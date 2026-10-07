import { dataSource } from '../../../config/db.js';
import { versionTerminosVigente } from '../../../modulos/legal/legal.service.js';
import { DOMINIO_DEMO, PERSONAS } from './base.js';
import { evento, type Personas } from './util.js';

// Auditoría de la demo (spec fase 9 §11.3): ingresos recientes desde IP privadas ficticias (10.20.0.x), dos ingresos
// fallidos, un restablecimiento de contraseña, cambios de configuración (tarifas, marca, numeración) y una exportación
// de OT. Sin `cuenta_bloqueada`. Idempotente: solo corre si estas personas no tienen ingresos registrados. La auditoría
// es de solo inserción para la app, igual que `evento` (los `evento` de configuración llevan `req_id` nulo).

const AGENTE = 'Mozilla/5.0 (X11; Linux x86_64) Zydesk-Demo';

async function marca(dias: number, hora: string): Promise<Date> {
  // Nunca dentro de la última hora: así no afecta el límite de intentos por IP (ventana de 15 minutos)
  const [{ t }] = await dataSource.query(
    `SELECT LEAST(((now() AT TIME ZONE 'America/Santiago')::date - $1::int + $2::time) AT TIME ZONE 'America/Santiago',
                  now() - interval '1 hour') AS t`,
    [dias, hora],
  );
  return t as Date;
}

async function auditar(
  accion: string,
  usuario_id: number | null,
  ip: string | null,
  detalle: Record<string, unknown>,
  creado_en: Date,
): Promise<void> {
  await dataSource.query(
    `INSERT INTO auditoria (usuario_id, ip, accion, detalle, creado_en) VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [usuario_id, ip, accion, JSON.stringify(detalle), creado_en],
  );
}

export async function sembrarAuditoria(personas: Personas): Promise<void> {
  const ids = [...personas.values()];
  const [{ n }] = await dataSource.query(
    `SELECT count(*)::int AS n FROM auditoria WHERE usuario_id = ANY($1::int[]) AND accion = 'ingreso_ok'`,
    [ids],
  );
  if (n > 0) return;
  const p = (u: string): number => personas.get(u)!;
  const hidalgo = p('phidalgo');
  const activas = PERSONAS.filter((x) => x.activo !== false);
  const ip = (i: number): string => `10.20.0.${10 + i}`;

  // Alta de las cuentas y aceptación de términos (hace nueve semanas)
  const version = versionTerminosVigente();
  for (const x of PERSONAS.filter((y) => y.usuario !== 'phidalgo')) {
    await auditar(
      'usuario_creado',
      hidalgo,
      ip(0),
      { usuario_creado_id: p(x.usuario), rol: x.rol, origen: 'web' },
      await marca(63, '09:10'),
    );
  }
  for (const [i, x] of activas.entries()) {
    await auditar('terminos_aceptados', p(x.usuario), ip(i), { version }, await marca(62, '09:20'));
  }

  // Configuración inicial
  await auditar(
    'config_cambiada',
    hidalgo,
    ip(0),
    { seccion: 'marca', nombre_app: 'Zydesk · Demo Patagua' },
    await marca(61, '10:00'),
  );
  await auditar(
    'config_cambiada',
    hidalgo,
    ip(0),
    {
      seccion: 'tarifas',
      campos: [
        'hora_normal',
        'hora_extendida',
        'hora_urgencia',
        'traslado_km',
        'costo_interno',
        'condiciones_defecto',
      ],
    },
    await marca(61, '10:20'),
  );
  for (const [clave, prefijo, antes, despues] of [
    ['ticket', 'TK-', 1000, 2000],
    ['ot', 'OT-', 200, 300],
  ] as const) {
    const cuando = await marca(61, '10:40');
    const cfg = (inicial: number) => ({ prefijo, inicial, digitos: 4, modo: 'correlativo' });
    await auditar(
      'numeracion_cambiada',
      hidalgo,
      ip(0),
      { clave, antes: cfg(antes), despues: cfg(despues) },
      cuando,
    );
    const texto = (inicial: number): string =>
      `${prefijo} · inicial ${inicial} · 4 dígitos · correlativo`;
    await evento(dataSource, 'contador', clave, hidalgo, cuando, 'numeracion_cambiada', {
      anterior: texto(antes),
      nuevo: texto(despues),
    });
  }

  // Ingresos recientes (uno a tres por persona en la última semana) y dos fallidos antes de entrar
  for (const [i, x] of activas.entries()) {
    const u = p(x.usuario);
    const veces = 1 + (i % 3);
    let ultimo: Date | null = null;
    for (let k = veces - 1; k >= 0; k--) {
      const cuando = await marca(
        1 + k * 2 + (i % 2),
        `0${8 + (i % 2)}:${String(10 + ((i * 7) % 45)).padStart(2, '0')}`,
      );
      await auditar(
        'ingreso_ok',
        u,
        ip(i),
        { correo: `${x.usuario}${DOMINIO_DEMO}`, user_agent: AGENTE, mantener: false },
        cuando,
      );
      if (!ultimo || cuando > ultimo) ultimo = cuando;
    }
    await dataSource.query(`UPDATE usuario SET ultimo_ingreso = $2 WHERE id = $1`, [u, ultimo]);
  }
  for (const [usuario, dias] of [
    ['jriquelme', 4],
    ['gtapia', 2],
  ] as const) {
    const i = activas.findIndex((x) => x.usuario === usuario);
    await auditar(
      'ingreso_fallido',
      null,
      ip(i),
      { correo: `${usuario}${DOMINIO_DEMO}`, user_agent: AGENTE },
      await marca(dias + 1, '07:55'),
    );
  }
  await auditar(
    'contrasena_restablecida',
    hidalgo,
    ip(0),
    { usuario_afectado_id: p('gtapia') },
    await marca(3, '08:05'),
  );
  await auditar(
    'exportacion',
    p('cbustos'),
    ip(2),
    { tipo: 'xlsx', entidad: 'ots', filtros: ['estado_facturacion'] },
    await marca(7, '11:40'),
  );
}
