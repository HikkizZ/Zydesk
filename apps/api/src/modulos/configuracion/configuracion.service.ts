import type {
  EventoSalidaDatos,
  LogoEntradaDatos,
  MarcaEntradaDatos,
  MarcaSalidaDatos,
  NumeracionEntradaDatos,
  NumeracionSalidaDatos,
  TarifasEntradaDatos,
  TarifasSalidaDatos,
} from '@zydesk/shared';
import { TarifasSalida } from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import { dataSource } from '../../config/db.js';
import type { UsuarioSesion } from '../../core/auth/tipos.js';
import { ErrorApp } from '../../core/errores/error-app.js';
import { registrarAuditoria } from '../../core/historial/auditoria.js';
import { registrarEvento } from '../../core/historial/evento.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import { fuenteNumeros } from '../../core/numeracion/fuente.js';
import {
  leerContador,
  type ClaveContador,
  type FilaContador,
} from '../../core/numeracion/numeracion.js';

const URL_LOGO = '/api/config/logo';
const MAX_LOGO_BYTES = 200 * 1024;

interface Logo {
  tipo_mime: LogoEntradaDatos['tipo_mime'];
  base64: string;
}

async function leerClave(m: EntityManager, clave: string): Promise<unknown> {
  const filas: { valor: unknown }[] = await m.query(
    `SELECT valor FROM configuracion WHERE clave = $1`,
    [clave],
  );
  return filas[0]?.valor ?? null;
}

async function guardarClave(m: EntityManager, clave: string, valor: unknown): Promise<void> {
  await m.query(
    `INSERT INTO configuracion (clave, valor) VALUES ($1, $2::jsonb)
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now()`,
    [clave, JSON.stringify(valor)],
  );
}

const TARIFAS_DEFECTO: TarifasSalidaDatos = {
  hora_normal: null,
  hora_extendida: null,
  hora_urgencia: null,
  traslado_km: null,
  costo_interno: null,
  iva_pct: 19,
  validez_dias_defecto: 30,
  condiciones_defecto: null,
};

const CONCEPTOS_CON_MONEDA = ['hora_normal', 'hora_extendida', 'hora_urgencia', 'traslado_km'];

// Red de compatibilidad (spec fase 8b §5.3): un concepto numérico (forma antigua) se envuelve como pesos.
export function normalizarTarifas(valor: unknown): unknown {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return valor;
  const copia: Record<string, unknown> = { ...(valor as Record<string, unknown>) };
  for (const k of CONCEPTOS_CON_MONEDA) {
    if (typeof copia[k] === 'number') copia[k] = { moneda: 'CLP', valor: copia[k] };
  }
  return copia;
}

// Spec fase 4 §8.1: la usan cotizaciones y cargarOt; sin la clave (base antigua) devuelve los valores por defecto.
export async function leerTarifas(
  m: EntityManager = dataSource.manager,
): Promise<TarifasSalidaDatos> {
  const valor = await leerClave(m, 'tarifas');
  return valor === null ? { ...TARIFAS_DEFECTO } : TarifasSalida.parse(normalizarTarifas(valor));
}

// Spec fase 4 §8.1 y fase 8b §5.3: el detalle de auditoría lleva solo los nombres de los campos cambiados, nunca montos ni monedas.
export async function guardarTarifas(
  actor: UsuarioSesion,
  e: TarifasEntradaDatos,
): Promise<TarifasSalidaDatos> {
  return enTransaccion(async (tx) => {
    const actual = await leerTarifas(tx);
    const campos = (Object.keys(e) as (keyof TarifasEntradaDatos)[]).filter(
      (k) => JSON.stringify(e[k]) !== JSON.stringify(actual[k]),
    );
    await guardarClave(tx, 'tarifas', e);
    await registrarAuditoria(tx, {
      accion: 'config_cambiada',
      usuario_id: actor.id,
      detalle: { seccion: 'tarifas', campos },
    });
    return leerTarifas(tx);
  });
}

export async function obtenerMarca(
  m: EntityManager = dataSource.manager,
): Promise<MarcaSalidaDatos> {
  const nombre = await leerClave(m, 'nombre_app');
  const logo = await leerClave(m, 'logo');
  return {
    nombre_app: typeof nombre === 'string' ? nombre : 'Zydesk',
    logo_url: logo ? URL_LOGO : null,
  };
}

export async function guardarMarca(
  actor: UsuarioSesion,
  e: MarcaEntradaDatos,
): Promise<MarcaSalidaDatos> {
  return enTransaccion(async (tx) => {
    await guardarClave(tx, 'nombre_app', e.nombre_app);
    await registrarAuditoria(tx, {
      accion: 'config_cambiada',
      usuario_id: actor.id,
      detalle: { seccion: 'marca', nombre_app: e.nombre_app },
    });
    return obtenerMarca(tx);
  });
}

function errorLogo(mensaje: string): ErrorApp {
  return new ErrorApp('VALIDACION', 'Datos inválidos', { base64: [mensaje] });
}

// Decodifica y valida tamaño y firma del archivo según el MIME declarado (spec §10.2).
function validarLogo(e: LogoEntradaDatos): number {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(e.base64) || e.base64.length % 4 !== 0) {
    throw errorLogo('Base64 inválido');
  }
  const bytes = Buffer.from(e.base64, 'base64');
  if (bytes.length > MAX_LOGO_BYTES) throw errorLogo('El logo supera 200 KB');
  const coincide =
    e.tipo_mime === 'image/png'
      ? bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      : e.tipo_mime === 'image/jpeg'
        ? bytes[0] === 0xff && bytes[1] === 0xd8
        : bytes.toString('utf8').includes('<svg');
  if (!coincide) throw errorLogo('El contenido no corresponde al tipo de archivo');
  return bytes.length;
}

export async function guardarLogo(
  actor: UsuarioSesion,
  e: LogoEntradaDatos,
): Promise<MarcaSalidaDatos> {
  const tamano = validarLogo(e);
  return enTransaccion(async (tx) => {
    const logo: Logo = { tipo_mime: e.tipo_mime, base64: e.base64 };
    await guardarClave(tx, 'logo', logo);
    await registrarAuditoria(tx, {
      accion: 'config_cambiada',
      usuario_id: actor.id,
      detalle: { seccion: 'logo', tamano },
    });
    return obtenerMarca(tx);
  });
}

export async function quitarLogo(actor: UsuarioSesion): Promise<MarcaSalidaDatos> {
  return enTransaccion(async (tx) => {
    await guardarClave(tx, 'logo', null);
    await registrarAuditoria(tx, {
      accion: 'config_cambiada',
      usuario_id: actor.id,
      detalle: { seccion: 'logo', tamano: 0 },
    });
    return obtenerMarca(tx);
  });
}

export async function leerLogo(): Promise<{ tipo_mime: string; datos: Buffer }> {
  const logo = (await leerClave(dataSource.manager, 'logo')) as Logo | null;
  if (!logo) throw new ErrorApp('NO_ENCONTRADO', 'No hay logo configurado');
  return { tipo_mime: logo.tipo_mime, datos: Buffer.from(logo.base64, 'base64') };
}

// ---- Numeración (ADR 0014) ----

const CLAVES: ClaveContador[] = ['ticket', 'ot'];

type ConfigNumeracion = Pick<FilaContador, 'prefijo' | 'inicial' | 'digitos' | 'modo'>;

function descripcion(c: ConfigNumeracion): string {
  return `${c.prefijo} · inicial ${c.inicial} · ${c.digitos} dígitos · ${c.modo}`;
}

function configuracionDe(c: ConfigNumeracion): ConfigNumeracion {
  return { prefijo: c.prefijo, inicial: c.inicial, digitos: c.digitos, modo: c.modo };
}

export async function obtenerNumeracion(
  m: EntityManager = dataSource.manager,
): Promise<NumeracionSalidaDatos> {
  const filas = [];
  for (const clave of CLAVES) {
    const c = await leerContador(m, clave);
    const capacidad = 10 ** c.digitos - c.inicial;
    const usados = await fuenteNumeros.usados(m, clave);
    filas.push({
      ...configuracionDe(c),
      ultimo_usado: await fuenteNumeros.ultimoUsado(m, clave),
      usados,
      capacidad,
      advertencia: c.modo === 'aleatorio' && capacidad > 0 && usados / capacidad >= 0.5,
    });
  }
  return { ticket: filas[0]!, ot: { ...filas[1]!, modo: 'correlativo' } };
}

export async function guardarNumeracion(
  actor: UsuarioSesion,
  e: NumeracionEntradaDatos,
): Promise<NumeracionSalidaDatos> {
  return enTransaccion(async (tx) => {
    const nuevos: Record<ClaveContador, ConfigNumeracion> = {
      ticket: e.ticket,
      ot: { ...e.ot, modo: 'correlativo' },
    };
    for (const clave of CLAVES) {
      const actual = await leerContador(tx, clave, true);
      const n = nuevos[clave];
      const ultimo = await fuenteNumeros.ultimoUsado(tx, clave);

      // Las reglas de ADR 0014 se aplican al cambiar `inicial` o `digitos`: guardar sin tocarlos
      // (p. ej. solo el prefijo) no debe fallar porque ya se emitieron números.
      if (n.inicial !== actual.inicial && ultimo !== null && n.inicial <= ultimo) {
        throw new ErrorApp(
          'NUMERACION_INICIAL_MENOR',
          `El número inicial de ${clave === 'ticket' ? 'tickets' : 'OT'} debe ser mayor que el último usado (${ultimo})`,
          { campo: `${clave}.inicial`, ultimo_usado: ultimo },
        );
      }
      if (
        (n.digitos !== actual.digitos || n.inicial !== actual.inicial) &&
        (n.inicial >= 10 ** n.digitos || (ultimo !== null && ultimo >= 10 ** n.digitos))
      ) {
        throw new ErrorApp(
          'NUMERACION_DIGITOS_INSUFICIENTES',
          'Los dígitos no alcanzan para los números existentes o el inicial',
          { campo: `${clave}.digitos` },
        );
      }

      let valor = actual.valor;
      if (n.modo === 'correlativo') {
        if (actual.modo === 'aleatorio') valor = Math.max(ultimo ?? -Infinity, n.inicial - 1);
        else if (n.inicial !== actual.inicial) valor = n.inicial - 1;
      }

      const cambiado =
        n.prefijo !== actual.prefijo ||
        n.inicial !== actual.inicial ||
        n.digitos !== actual.digitos ||
        n.modo !== actual.modo;
      if (!cambiado) continue;

      await tx.query(
        `UPDATE contador SET prefijo = $2, inicial = $3, digitos = $4, modo = $5, valor = $6,
                actualizado_en = now() WHERE clave = $1`,
        [clave, n.prefijo, n.inicial, n.digitos, n.modo, valor],
      );
      await registrarEvento(tx, {
        entidad: 'contador',
        entidad_id: clave,
        actor,
        accion: 'numeracion_cambiada',
        valor_anterior: descripcion(actual),
        valor_nuevo: descripcion(n),
      });
      await registrarAuditoria(tx, {
        accion: 'numeracion_cambiada',
        usuario_id: actor.id,
        detalle: { clave, antes: configuracionDe(actual), despues: configuracionDe(n) },
      });
    }
    return obtenerNumeracion(tx);
  });
}

export async function historialNumeracion(): Promise<EventoSalidaDatos[]> {
  const filas: {
    id: string;
    creado_en: Date;
    autor_id: number | null;
    autor_nombre: string | null;
    entidad_id: string;
    valor_anterior: string | null;
    valor_nuevo: string | null;
  }[] = await dataSource.query(
    `SELECT e.id, e.creado_en, e.autor_id, u.nombre AS autor_nombre, e.entidad_id, e.valor_anterior, e.valor_nuevo
       FROM evento e LEFT JOIN usuario u ON u.id = e.autor_id
      WHERE e.entidad = 'contador' AND e.accion = 'numeracion_cambiada'
      ORDER BY e.creado_en DESC, e.id DESC LIMIT 50`,
  );
  return filas.map((f) => ({
    id: Number(f.id),
    creado_en: f.creado_en.toISOString(),
    autor: f.autor_id !== null ? { id: f.autor_id, nombre: f.autor_nombre ?? '' } : null,
    entidad_id: f.entidad_id,
    valor_anterior: f.valor_anterior,
    valor_nuevo: f.valor_nuevo,
  }));
}
