import { rutValido, jornadaSemanalHoras, ZONA } from '@zydesk/shared';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearUsuario } from '../../../test/fabricas.js';
import { fijarEnv } from '../../../test/entorno.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import { fuenteNumeros } from '../../core/numeracion/fuente.js';
import { siguienteNumero } from '../../core/numeracion/numeracion.js';
import { storage } from '../../integraciones/storage/storage.js';
import { cargarDemo, ejecutarDemo, ErrorDemo, validarEntorno } from './demo/cargar.js';

const CLAVE = 'Demo.Patagua.2026';
const hoy = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());

async function contar(tabla: string, where = 'true'): Promise<number> {
  const [{ n }] = await dataSource.query(`SELECT count(*)::int AS n FROM ${tabla} WHERE ${where}`);
  return n;
}
async function baseActual(): Promise<string> {
  return (await dataSource.query(`SELECT current_database() AS b`))[0].b;
}
function activarDemo(confirmar?: string): void {
  fijarEnv('ZYDESK_DEMO', true);
  fijarEnv('DEMO_PASSWORD', CLAVE);
  if (confirmar !== undefined) fijarEnv('ZYDESK_DEMO_CONFIRMAR', confirmar);
}

afterEach(() => vi.restoreAllMocks());

describe('db:demo: guardas', () => {
  it('sin ZYDESK_DEMO=true sale con 1 antes de conectar y no toca la base', async () => {
    fijarEnv('ZYDESK_DEMO', false);
    fijarEnv('DEMO_PASSWORD', CLAVE);
    expect(() => validarEntorno({ reiniciar: false })).toThrow('ZYDESK_DEMO=true');
    const salir = vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
      throw new Error(`salida ${c}`);
    }) as never);
    const conectar = vi.spyOn(dataSource, 'initialize');
    const consulta = vi.spyOn(dataSource, 'query');
    await expect(ejecutarDemo({ reiniciar: false })).rejects.toThrow('salida 1');
    expect(salir).toHaveBeenCalledWith(1);
    expect(conectar).not.toHaveBeenCalled();
    expect(consulta).not.toHaveBeenCalled();
    expect(await contar('usuario')).toBe(0);
  });

  it('exige DEMO_PASSWORD que cumpla la política de contraseñas', async () => {
    fijarEnv('ZYDESK_DEMO', true);
    fijarEnv('DEMO_PASSWORD', undefined);
    expect(() => validarEntorno({ reiniciar: false })).toThrow('DEMO_PASSWORD');
    fijarEnv('DEMO_PASSWORD', 'corta');
    expect(() => validarEntorno({ reiniciar: false })).toThrow('DEMO_PASSWORD');
    fijarEnv('DEMO_PASSWORD', 'demo@demo.zytech.dev');
    expect(() => validarEntorno({ reiniciar: false })).toThrow('DEMO_PASSWORD');
    fijarEnv('DEMO_PASSWORD', CLAVE);
    expect(() => validarEntorno({ reiniciar: false })).not.toThrow();
  });

  it('con una cuenta real en la base se niega sin --reiniciar y no cambia nada', async () => {
    activarDemo();
    await crearUsuario({ correo: 'persona@empresa.cl' });
    await expect(cargarDemo({ reiniciar: false })).rejects.toThrow(ErrorDemo);
    expect(await contar('usuario')).toBe(1);
    expect(await contar('ticket')).toBe(0);
    expect(await contar('departamento')).toBe(0);
  });

  it('--reiniciar sin ZYDESK_DEMO_CONFIRMAR, o con otro nombre de base, se niega y no borra nada', async () => {
    activarDemo();
    await crearUsuario({ correo: 'persona@empresa.cl' });
    await expect(cargarDemo({ reiniciar: true })).rejects.toThrow('ZYDESK_DEMO_CONFIRMAR');
    fijarEnv('ZYDESK_DEMO_CONFIRMAR', 'otra_base');
    await expect(cargarDemo({ reiniciar: true })).rejects.toThrow('no coincide');
    expect(await contar('usuario', `correo = 'persona@empresa.cl'`)).toBe(1);
  });

  it('--reiniciar con las dos variables vacía todo (también la cuenta real) y deja solo las 12 cuentas ficticias', async () => {
    activarDemo(await baseActual());
    await crearUsuario({ correo: 'persona@empresa.cl' });
    // un archivo que la semilla dejó antes: `--reiniciar` borra la carpeta `demo/` y vuelve a crear la suya
    const viejo = storage.ruta('demo/2020/01/viejo.txt');
    fs.mkdirSync(path.dirname(viejo), { recursive: true });
    fs.writeFileSync(viejo, 'de una carga anterior');
    await cargarDemo({ reiniciar: true });
    expect(fs.existsSync(viejo)).toBe(false);
    expect(await contar('archivo')).toBe(15);
    expect(await contar('usuario')).toBe(12);
    expect(await contar('usuario', `correo = 'persona@empresa.cl'`)).toBe(0);
    expect(await contar('usuario', `correo NOT LIKE '%@demo.zytech.dev'`)).toBe(0);
  }, 180_000);

  it('el CLI de demo y el de sembrar se niegan sin conectar (sin ZYDESK_DEMO y con NODE_ENV=production)', () => {
    const api = fileURLToPath(new URL('../../../', import.meta.url));
    const correr = (
      comando: string,
      extra: Record<string, string>,
    ): { codigo: number; salida: string } => {
      try {
        const salida = execFileSync(
          process.execPath,
          ['--import', 'tsx', 'src/database/cli.ts', comando],
          {
            cwd: api,
            env: {
              PATH: process.env['PATH'] ?? '',
              TZ: 'UTC',
              // base inalcanzable: si intentara conectar, fallaría con otro mensaje
              DATABASE_URL: 'postgres://u:p@127.0.0.1:1/inexistente',
              DATABASE_URL_OWNER: 'postgres://u:p@127.0.0.1:1/inexistente',
              ...extra,
            },
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        );
        return { codigo: 0, salida };
      } catch (err) {
        const e = err as { status: number; stdout: string; stderr: string };
        return { codigo: e.status, salida: `${e.stdout}${e.stderr}` };
      }
    };
    const demo = correr('demo', { ZYDESK_DEMO: '', DEMO_PASSWORD: CLAVE });
    expect(demo.codigo).toBe(1);
    expect(demo.salida).toContain('db:demo solo corre con ZYDESK_DEMO=true');
    const sembrar = correr('sembrar', { NODE_ENV: 'production', SEMILLA_PASSWORD: CLAVE });
    expect(sembrar.codigo).toBe(1);
    expect(sembrar.salida).toContain('db:sembrar no está permitido en producción');
  }, 60_000);
});

describe('db:demo: la historia de Patagua', () => {
  it('dos cargas dejan las cifras de la historia aprobada (spec fase 9 §11.4)', async () => {
    activarDemo();
    await cargarDemo({ reiniciar: false });
    await cargarDemo({ reiniciar: false });

    // Organización
    expect(await contar('usuario')).toBe(12);
    expect(await contar('usuario', 'NOT activo')).toBe(1);
    expect(await contar('usuario', `rol = 'lectura'`)).toBe(2);
    expect(await contar('usuario', 'debe_cambiar_contrasena')).toBe(0);
    expect(await contar('departamento')).toBe(3);
    expect(await contar('horario_dia')).toBe(21);
    expect(await contar('categoria')).toBe(7);
    expect(await contar('cliente')).toBe(10);
    expect(await contar('cliente', 'NOT es_interno')).toBe(7);
    expect(await contar('contrato_bolsa')).toBe(1);
    expect(await contar('tarifa_cliente', `moneda = 'UF'`)).toBe(2);
    expect((await dataSource.query(`SELECT DISTINCT cliente_id FROM tarifa_cliente`)).length).toBe(
      2,
    );
    expect(await contar('plantilla_cotizacion')).toBe(3);
    expect(await contar('indicador_uf')).toBe(10);
    expect(await contar('feriado', `departamento_id IS NOT NULL`)).toBe(1);
    const ruts: { rut: string }[] = await dataSource.query(
      `SELECT rut FROM cliente WHERE rut IS NOT NULL`,
    );
    expect(ruts).toHaveLength(7);
    expect(ruts.every((r) => rutValido(r.rut))).toBe(true);
    const [{ valor: marca }] = await dataSource.query(
      `SELECT valor FROM configuracion WHERE clave = 'nombre_app'`,
    );
    expect(marca).toBe('Zydesk · Demo Patagua');
    const [{ valor: logo }] = await dataSource.query(
      `SELECT valor FROM configuracion WHERE clave = 'logo'`,
    );
    expect(logo.tipo_mime).toBe('image/svg+xml');
    expect(Buffer.from(logo.base64, 'base64').length).toBeLessThan(20 * 1024);

    // Tickets: 36 (6 archivados) con la mezcla de la historia
    expect(await contar('ticket')).toBe(36);
    expect(await contar('ticket', 'archivado_en IS NOT NULL')).toBe(6);
    for (const [estado, n] of [
      ['nuevo', 8],
      ['en_curso', 9],
      ['en_espera', 4],
      ['resuelto', 10],
      ['descartado', 3],
      ['duplicado', 2],
    ] as const) {
      expect(await contar('ticket', `estado = '${estado}'`), estado).toBe(n);
    }
    for (const [prio, n] of [
      ['urgente', 6],
      ['alta', 10],
      ['media', 14],
      ['baja', 6],
    ] as const) {
      expect(await contar('ticket', `prioridad = '${prio}'`), prio).toBe(n);
    }
    expect(
      await contar(
        'ticket',
        `estado = 'nuevo' AND creado_en >= date_trunc('day', now() AT TIME ZONE 'America/Santiago') AT TIME ZONE 'America/Santiago'`,
      ),
    ).toBe(3);
    expect(await contar('correo_adjunto', `origen = 'eml'`)).toBe(2);
    expect(await contar('archivo', 'origen_correo_id IS NOT NULL')).toBe(2);
    expect(await contar('ticket', `estado = 'duplicado' AND duplicado_de_id IS NOT NULL`)).toBe(2);
    expect(await contar('ticket', `estado = 'descartado' AND motivo_cierre IS NOT NULL`)).toBe(3);
    expect(
      await contar(
        'ticket',
        `estado = 'en_curso' AND fecha_limite < now() AND (fecha_limite AT TIME ZONE 'America/Santiago')::date < (now() AT TIME ZONE 'America/Santiago')::date`,
      ),
    ).toBe(2);
    expect(await contar('tarea', 'ticket_id IS NOT NULL')).toBeGreaterThanOrEqual(38);
    expect(await contar('tarea', 'ticket_id IS NOT NULL AND hecha')).toBeGreaterThanOrEqual(15);
    expect(await contar('mencion')).toBeGreaterThanOrEqual(10);
    const [{ n: sinMensajes }] = await dataSource.query(
      `SELECT count(*)::int AS n FROM ticket t WHERE NOT EXISTS (SELECT 1 FROM mensaje m WHERE m.ticket_id = t.id)`,
    );
    expect(sinMensajes).toBe(0);
    const [{ valor: contadorTk }] = await dataSource.query(
      `SELECT valor FROM contador WHERE clave = 'ticket'`,
    );
    expect(contadorTk).toBeGreaterThanOrEqual(2035);
    const siguiente = await enTransaccion((tx) => siguienteNumero(tx, 'ticket', fuenteNumeros));
    expect(siguiente.codigo).toBe('TK-2036');

    // OT y cotizaciones
    expect(await contar('ot')).toBe(11);
    expect(await contar('ot', `tipo = 'facturable'`)).toBe(6);
    expect(await contar('ot', `tipo = 'interna'`)).toBe(5);
    expect(await contar('ot', `etapa = 'cancelada'`)).toBe(1);
    expect(await contar('ot', `etapa = 'cerrada'`)).toBe(4);
    expect(await contar('ot', `estado_facturacion = 'facturada'`)).toBe(1);
    expect(await contar('ot', `estado_facturacion = 'por_facturar'`)).toBe(1);
    expect(await contar('ot', `etapa = 'cerrada' AND resolvio_ticket = false`)).toBe(2);
    expect(
      await contar('ot', `etapa = 'borrador' AND tipo = 'interna' AND aprobador_id IS NOT NULL`),
    ).toBe(1);
    expect(await contar('aprobacion_cliente')).toBe(3);
    expect(await contar('mensaje', 'copiado_desde_id IS NOT NULL')).toBe(3);
    expect(await contar('cotizacion')).toBe(8);
    for (const [estado, n] of [
      ['aprobada', 3],
      ['enviada', 2],
      ['rechazada', 1],
      ['reemplazada', 1],
      ['borrador', 1],
    ] as const) {
      expect(await contar('cotizacion', `estado = '${estado}'`), estado).toBe(n);
    }
    expect(await contar('cotizacion', 'NOT aplica_iva')).toBe(1);
    expect(await contar('cotizacion', `moneda = 'UF'`)).toBe(2);
    const cot = async (
      codigo: string,
      version: number,
    ): Promise<{ neto: string; total: string; moneda: string }> =>
      (
        await dataSource.query(
          `SELECT neto, total, moneda FROM cotizacion WHERE codigo = $1 AND version = $2`,
          [codigo, version],
        )
      )[0];
    expect(Number((await cot('COT-0300', 1)).neto)).toBe(412000);
    const uf = await cot('COT-0301', 2);
    expect(uf).toMatchObject({ moneda: 'UF' });
    expect(Number(uf.neto)).toBe(9.4);
    const [{ valor: contadorOt }] = await dataSource.query(
      `SELECT valor FROM contador WHERE clave = 'ot'`,
    );
    expect(contadorOt).toBeGreaterThanOrEqual(310);
    const oc = await dataSource.query(`SELECT oc_cliente FROM ot WHERE codigo = 'OT-0302'`);
    expect(oc[0].oc_cliente).toBe('OC-7781');

    // Archivos: al menos 14, cada uno con su archivo en disco y su tamaño real
    const archivos: { clave: string; tamano: number; tipo_mime: string; categoria: string }[] =
      await dataSource.query(`SELECT clave, tamano, tipo_mime, categoria FROM archivo`);
    expect(archivos.length).toBe(15); // 7 imágenes, 2 correos, 3 PDF y 3 .xlsx; la segunda carga no duplica nada
    for (const a of archivos) {
      expect(a.clave.startsWith('demo/'), a.clave).toBe(true);
      expect(fs.statSync(storage.ruta(a.clave)).size).toBe(a.tamano);
    }
    expect(archivos.filter((a) => a.categoria === 'foto').length).toBeGreaterThanOrEqual(7);
    expect(archivos.filter((a) => a.tipo_mime === 'application/pdf').length).toBeGreaterThanOrEqual(
      3,
    );
    expect(
      archivos.filter((a) => a.tipo_mime.includes('spreadsheetml')).length,
    ).toBeGreaterThanOrEqual(1);
    expect(archivos.filter((a) => a.tipo_mime === 'message/rfc822')).toHaveLength(2);

    // Horas: sin fechas futuras ni en OT finales (después de su cierre), dentro de las 8 semanas y de la jornada
    expect(
      await contar('registro_horas', `fecha > (now() AT TIME ZONE 'America/Santiago')::date`),
    ).toBe(0);
    expect(
      await contar(
        'registro_horas rh JOIN ot o ON o.id = rh.ot_id',
        `o.etapa IN ('cerrada', 'cancelada') AND rh.fecha > (COALESCE(o.cerrada_en, o.cancelada_en) AT TIME ZONE 'America/Santiago')::date`,
      ),
    ).toBe(0);
    expect(await contar('registro_horas', 'fuera_de_horario')).toBeGreaterThan(0);
    const semanas: { usuario_id: number; semana: string; h: number }[] = await dataSource.query(
      `SELECT rh.usuario_id, date_trunc('week', rh.fecha)::date::text AS semana, sum(rh.horas)::float8 AS h
         FROM registro_horas rh GROUP BY 1, 2`,
    );
    const horarios: {
      departamento_id: number;
      dia_semana: number;
      activo: boolean;
      entrada: string;
      salida: string;
      colacion_inicio: string;
      colacion_min: number;
    }[] = await dataSource.query(`SELECT * FROM horario_dia`);
    const usuarios: { id: number; departamento_id: number }[] = await dataSource.query(
      `SELECT id, departamento_id FROM usuario`,
    );
    const personasConHoras = new Set(semanas.map((s) => s.usuario_id));
    expect(personasConHoras.size).toBe(8);
    for (const s of semanas) {
      const dep = usuarios.find((u) => u.id === s.usuario_id)!.departamento_id;
      const jornada = jornadaSemanalHoras(horarios.filter((h) => h.departamento_id === dep));
      expect(s.h, `${s.usuario_id} ${s.semana}`).toBeLessThanOrEqual(jornada);
    }
    const [{ n: nSemanas }] = await dataSource.query(
      `SELECT count(DISTINCT date_trunc('week', fecha))::int AS n FROM registro_horas`,
    );
    expect(nSemanas).toBeGreaterThanOrEqual(8);

    // Avisos: 6 a 12 por persona activa, mezcla de leídos y sin leer, sin Telegram ni vínculos
    expect(await contar('aviso')).toBeGreaterThanOrEqual(60);
    const porPersona: { usuario_id: number; n: number }[] = await dataSource.query(
      `SELECT usuario_id, count(*)::int AS n FROM aviso GROUP BY 1`,
    );
    expect(porPersona).toHaveLength(11);
    for (const f of porPersona) {
      expect(f.n, `usuario ${f.usuario_id}`).toBeGreaterThanOrEqual(6);
      expect(f.n, `usuario ${f.usuario_id}`).toBeLessThanOrEqual(12);
    }
    expect(await contar('aviso', 'leido_en IS NULL')).toBeGreaterThan(0);
    expect(await contar('aviso', 'leido_en IS NOT NULL')).toBeGreaterThan(0);
    expect(await contar('aviso_envio')).toBe(0);
    expect(await contar('vinculo_telegram')).toBe(0);
    expect(await contar('codigo_vinculo')).toBe(0);
    expect(
      await contar(
        'preferencia_aviso',
        `evento = 'seguimiento' AND canal = 'telegram' AND NOT activo`,
      ),
    ).toBe(1);

    // Auditoría y eventos
    expect(await contar('auditoria', `accion = 'ingreso_ok'`)).toBeGreaterThanOrEqual(11);
    expect(await contar('auditoria', `accion = 'ingreso_fallido'`)).toBe(2);
    expect(await contar('auditoria', `accion = 'contrasena_restablecida'`)).toBe(1);
    expect(await contar('auditoria', `accion = 'exportacion'`)).toBe(1);
    expect(await contar('auditoria', `accion = 'cuenta_bloqueada'`)).toBe(0);
    expect(
      await contar('auditoria', `accion = 'config_cambiada' AND detalle->>'seccion' = 'tarifas'`),
    ).toBe(1);
    expect(await contar('auditoria', `accion = 'numeracion_cambiada'`)).toBe(2);
    expect(await contar('auditoria', `ip IS NOT NULL AND NOT (ip << '10.20.0.0/24'::inet)`)).toBe(
      0,
    );
    expect(await contar('evento', 'req_id IS NOT NULL')).toBe(0);
    expect(await contar('evento')).toBeGreaterThan(200);

    // Ningún dato real: correos solo `@demo.zytech.dev` o dominios reservados `.test`
    expect(await contar('usuario', `correo NOT LIKE '%@demo.zytech.dev'`)).toBe(0);
    expect(await contar('contacto', `correo IS NULL OR correo NOT LIKE '%.test'`)).toBe(0);
    expect(
      await contar(
        'ticket',
        `solicitante_correo IS NOT NULL AND solicitante_correo NOT LIKE '%.test'`,
      ),
    ).toBe(0);

    // Ingreso real, Mi día, Reportes
    const agente = request
      .agent(crearApp({ comprobarBd: async () => true }))
      .set('X-Requested-With', 'Zydesk');
    const sesion = await agente
      .post('/api/auth/ingresar')
      .send({ correo: 'ralamos@demo.zytech.dev', contrasena: CLAVE });
    expect(sesion.status).toBe(200);
    expect(sesion.body).toMatchObject({
      rol: 'coordinacion',
      debe_cambiar_contrasena: false,
      debe_aceptar_terminos: false,
    });
    expect(sesion.body.nombre_app).toBe('Zydesk · Demo Patagua');
    const miDia = (await agente.get('/api/mi-dia')).body;
    for (const lista of ['vencen_hoy', 'vencidos', 'menciones', 'tareas', 'detenidos'] as const) {
      expect(miDia[lista].length, lista).toBeGreaterThan(0);
    }
    const bustos = request
      .agent(crearApp({ comprobarBd: async () => true }))
      .set('X-Requested-With', 'Zydesk');
    await bustos
      .post('/api/auth/ingresar')
      .send({ correo: 'cbustos@demo.zytech.dev', contrasena: CLAVE });
    const miDiaBustos = (await bustos.get('/api/mi-dia')).body;
    for (const lista of [
      'vencen_hoy',
      'vencidos',
      'por_aprobar',
      'menciones',
      'tareas',
      'detenidos',
    ] as const) {
      expect(miDiaBustos[lista].length, lista).toBeGreaterThan(0);
    }

    const mes = (await agente.get('/api/reportes')).body;
    expect(mes.indicadores.cerrados.total).toBeGreaterThan(0);
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 90);
    const r90 = (
      await agente.get(`/api/reportes?desde=${d.toISOString().slice(0, 10)}&hasta=${hoy()}`)
    ).body;
    expect(r90.indicadores.cerrados.total).toBeGreaterThanOrEqual(10);
    expect(r90.indicadores.horas.pct_facturables).toBeGreaterThanOrEqual(40);
    expect(r90.indicadores.horas.pct_facturables).toBeLessThanOrEqual(80);
    expect(r90.carga.filter((c: { pct: number | null }) => (c.pct ?? 0) > 100)).toHaveLength(2);
    expect(r90.resolucion_por_prioridad.some((x: { sobre_plazo: boolean }) => x.sobre_plazo)).toBe(
      true,
    );
    expect(r90.por_cliente.length).toBeGreaterThanOrEqual(6);

    // Pantallas del checklist: OT en cada etapa, indicadores y exportación
    const ind = (await agente.get('/api/ots/indicadores')).body;
    expect(ind).toBeTruthy();
    const ots = (await agente.get('/api/ots?por_pagina=50')).body;
    const etapas = new Set(ots.datos.map((o: { etapa: string }) => o.etapa));
    for (const etapa of ['borrador', 'cotizada', 'en_ejecucion', 'cerrada', 'cancelada'])
      expect(etapas.has(etapa), etapa).toBe(true);
    const tablero = (await agente.get('/api/tickets?por_pagina=50')).body;
    expect(tablero.total).toBe(30); // sin los 6 archivados
  }, 240_000);
});
