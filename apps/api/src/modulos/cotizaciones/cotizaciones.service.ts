import {
  calcularCotizacion,
  formatearCLP,
  formatearFecha,
  formatearMonto,
  transicionesEtapaDesde,
  type EstadoCotizacion,
  type Moneda,
} from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import { dataSource } from '../../config/db.js';
import type { UsuarioSesion } from '../../core/auth/tipos.js';
import { ErrorApp } from '../../core/errores/error-app.js';
import { registrarAuditoria } from '../../core/historial/auditoria.js';
import { registrarCambios, registrarEvento } from '../../core/historial/evento.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import { generarPdf } from '../../integraciones/pdf/cotizacion.pdf.js';
import { generarXlsx } from '../../integraciones/xlsx/cotizacion.xlsx.js';
import { leerLogo, leerTarifas, obtenerMarca } from '../configuracion/configuracion.service.js';
import {
  bloquearOt,
  otCerrada,
  registrarActividadEnOt,
  type OtBloqueada,
} from '../ots/ots.acceso.js';
import { errorValidacion, hoyEnSantiago, recortar } from '../ots/ots.comun.js';
import { registrarEtapa } from '../ots/ots.etapas.service.js';
import { bloquearTicket, registrarActividadEnTicket } from '../tickets/tickets.service.js';
import { cargarCotizacion, listarCotizaciones } from './cotizaciones.consulta.js';
import type { MarcaDocumento } from '../../integraciones/documentos.js';
import type {
  AplicarPlantillaEntradaDatos,
  CotizacionEntradaDatos,
  CotizacionSalidaDatos,
  CotizacionesQueryDatos,
  ImportarHorasEntradaDatos,
} from './cotizaciones.tipos.js';

export function obtener(id: number): Promise<CotizacionSalidaDatos> {
  return cargarCotizacion(dataSource.manager, id);
}

export function listar(q: CotizacionesQueryDatos): ReturnType<typeof listarCotizaciones> {
  return listarCotizaciones(dataSource.manager, q);
}

// ---- Bloqueo (spec fase 4 §1.2): OT → cotización ----

export interface CotizacionBloqueada {
  id: number;
  ot_id: number;
  version: number;
  codigo: string;
  estado: EstadoCotizacion;
  contacto_id: number | null;
  fecha_emision: string;
  validez_dias: 15 | 30;
  moneda: Moneda;
  valor_uf: number | null;
  aplica_iva: boolean;
  iva_pct: number;
  condiciones: string | null;
  nota_interna: string | null;
  neto: number;
  total: number;
  vigente: boolean;
}

export async function bloquearCotizacion(
  tx: EntityManager,
  id: number,
): Promise<{ ot: OtBloqueada; cot: CotizacionBloqueada }> {
  // La cotización se lee primero sin bloqueo solo para conocer su OT; el orden es OT → cotización.
  const [previa]: { ot_id: number }[] = await tx.query(
    `SELECT ot_id FROM cotizacion WHERE id = $1`,
    [id],
  );
  if (!previa) throw new ErrorApp('NO_ENCONTRADO', 'Cotización no encontrada');
  const ot = await bloquearOt(tx, previa.ot_id);
  const [cot]: CotizacionBloqueada[] = await tx.query(
    `SELECT c.id, c.ot_id, c.version, c.codigo, c.estado, c.contacto_id, c.fecha_emision::text AS fecha_emision,
            c.validez_dias, c.moneda, c.valor_uf::float8 AS valor_uf, c.aplica_iva, c.iva_pct::float8 AS iva_pct,
            c.condiciones, c.nota_interna, c.neto::float8 AS neto, c.total::float8 AS total,
            (c.version = (SELECT max(x.version) FROM cotizacion x WHERE x.ot_id = c.ot_id)) AS vigente
       FROM cotizacion c WHERE c.id = $1 FOR UPDATE`,
    [id],
  );
  if (!cot) throw new ErrorApp('NO_ENCONTRADO', 'Cotización no encontrada');
  return { ot, cot };
}

// Solo la vigente en borrador se edita (importar, plantilla, enviar, eliminar usan la misma regla).
export function exigirEditable(ot: OtBloqueada, cot: CotizacionBloqueada): void {
  if (ot.final) throw otCerrada();
  if (!cot.vigente || cot.estado !== 'borrador') {
    throw new ErrorApp(
      'COTIZACION_NO_EDITABLE',
      'La cotización no es un borrador o no es la versión vigente',
    );
  }
}

// ---- Crear v1 (spec fase 4 §5.2) ----

export async function crearCotizacion(
  actor: UsuarioSesion,
  ot_id: number,
): Promise<CotizacionSalidaDatos> {
  return enTransaccion(async (tx) => {
    const ot = await bloquearOt(tx, ot_id);
    if (ot.tipo !== 'facturable') {
      throw errorValidacion({ ot: ['Solo una OT facturable se cotiza'] });
    }
    if (ot.final) throw otCerrada();
    if (ot.etapa !== 'borrador' && ot.etapa !== 'cotizada') {
      throw new ErrorApp('TRANSICION_INVALIDA', 'Ese cambio de etapa no está permitido', {
        entidad: 'ot',
        desde: ot.etapa,
        hasta: 'cotizada',
        permitidas: transicionesEtapaDesde(ot.tipo, ot.etapa),
      });
    }
    const externo: unknown[] =
      ot.cliente_id === null
        ? []
        : await tx.query(`SELECT 1 FROM cliente WHERE id = $1 AND NOT es_interno`, [ot.cliente_id]);
    if (externo.length === 0) {
      throw errorValidacion({ cliente_id: ['La OT debe tener un cliente externo'] });
    }

    const [vigente]: { estado: EstadoCotizacion }[] = await tx.query(
      `SELECT estado FROM cotizacion WHERE ot_id = $1 ORDER BY version DESC LIMIT 1`,
      [ot_id],
    );
    if (vigente?.estado === 'borrador') {
      throw new ErrorApp('COTIZACION_NO_EDITABLE', 'Ya hay un borrador: edítalo o elimínalo');
    }
    if (vigente?.estado === 'enviada') {
      throw new ErrorApp(
        'COTIZACION_NO_EDITABLE',
        'Duplica la cotización enviada como nueva versión',
      );
    }
    if (vigente?.estado === 'aprobada') {
      throw new ErrorApp(
        'COTIZACION_APROBADA',
        'La cotización aprobada no se puede cambiar ni duplicar',
      );
    }

    const [contacto]: { contacto_id: number | null }[] = await tx.query(
      `SELECT contacto_id FROM ot WHERE id = $1`,
      [ot_id],
    );
    const tarifas = await leerTarifas(tx);
    const codigo = `COT-${ot.codigo.replace(/^\D+/, '')}`;
    const [fila]: { id: number; version: number }[] = await tx.query(
      `INSERT INTO cotizacion (ot_id, version, codigo, estado, contacto_id, fecha_emision, validez_dias, moneda,
                               aplica_iva, iva_pct, condiciones, creado_por)
       VALUES ($1, (SELECT COALESCE(MAX(version), 0) + 1 FROM cotizacion WHERE ot_id = $1), $2, 'borrador', $3, $4,
               $5, 'CLP', true, $6, $7, $8)
       RETURNING id, version`,
      [
        ot_id,
        codigo,
        contacto?.contacto_id ?? null,
        hoyEnSantiago(),
        tarifas.validez_dias_defecto,
        tarifas.iva_pct,
        tarifas.condiciones_defecto,
        actor.id,
      ],
    );
    await registrarEvento(tx, {
      entidad: 'ot',
      entidad_id: ot_id,
      actor,
      accion: 'cotizacion_creada',
      valor_nuevo: `${codigo} v${fila!.version}`,
      datos: { cotizacion_id: fila!.id, codigo, version: fila!.version },
    });
    await registrarActividadEnOt(tx, ot_id);
    return cargarCotizacion(tx, fila!.id);
  });
}

// ---- Editar (spec fase 4 §5.3) ----

interface Rastreado {
  contacto: string | null;
  fecha_emision: string;
  validez_dias: number;
  moneda: Moneda;
  valor_uf: number | null;
  aplica_iva: boolean;
  lineas: string; // firma de las líneas (JSON); la etiqueta la muestra como "N líneas"
  neto: string;
  total: string;
  condiciones: string | null;
  nota_interna: string | null;
}

const CAMPOS_RASTREADOS = [
  'contacto',
  'fecha_emision',
  'validez_dias',
  'moneda',
  'valor_uf',
  'aplica_iva',
  'lineas',
  'neto',
  'total',
  'condiciones',
  'nota_interna',
] as const;

// `AAAA-MM-DD` sin hora: se formatea al mediodía UTC para que la fecha no cambie al pasar a Santiago.
const formatearFechaIso = (f: string): string => formatearFecha(new Date(`${f}T12:00:00Z`));

const ETIQUETAS_CAMBIO: Record<string, (v: unknown) => string> = {
  fecha_emision: (v) => formatearFechaIso(String(v)),
  validez_dias: (v) => `${String(v)} días`,
  valor_uf: (v) => formatearCLP(Number(v)),
  aplica_iva: (v) => (v ? 'sí' : 'no'),
  lineas: (v) => {
    const n = (JSON.parse(String(v)) as unknown[]).length;
    return `${n} ${n === 1 ? 'línea' : 'líneas'}`;
  },
  condiciones: (v) => recortar(String(v)),
  nota_interna: (v) => recortar(String(v)),
};

async function rastreado(tx: EntityManager, id: number): Promise<Rastreado> {
  const [f]: (Omit<Rastreado, 'lineas' | 'neto' | 'total'> & { neto: number; total: number })[] =
    await tx.query(
      `SELECT co.nombre AS contacto, c.fecha_emision::text AS fecha_emision, c.validez_dias, c.moneda,
              c.valor_uf::float8 AS valor_uf, c.aplica_iva, c.neto::float8 AS neto, c.total::float8 AS total,
              c.condiciones, c.nota_interna
         FROM cotizacion c LEFT JOIN contacto co ON co.id = c.contacto_id WHERE c.id = $1`,
      [id],
    );
  const lineas: unknown[] = await tx.query(
    `SELECT tipo, descripcion, cantidad::float8, unidad, precio_unitario::float8, descuento_pct::float8
       FROM linea_cotizacion WHERE cotizacion_id = $1 ORDER BY orden`,
    [id],
  );
  return {
    ...f!,
    lineas: JSON.stringify(lineas),
    neto: formatearMonto(f!.neto, f!.moneda),
    total: formatearMonto(f!.total, f!.moneda),
  };
}

export interface LineaGuardable {
  tipo: CotizacionEntradaDatos['lineas'][number]['tipo'];
  descripcion: string;
  cantidad: number;
  unidad: CotizacionEntradaDatos['lineas'][number]['unidad'];
  precio_unitario: number;
  descuento_pct: number;
}

// Escribe encabezado y líneas recalculando los totales con `calcularCotizacion`: el cliente nunca los
// dicta y `iva_pct` es el snapshot de la cotización (ADR 0007). Lo comparten editar, importar y plantilla.
async function escribirCotizacion(
  tx: EntityManager,
  ot: OtBloqueada,
  cot: CotizacionBloqueada,
  e: Omit<CotizacionEntradaDatos, 'lineas'> & { lineas: LineaGuardable[] },
): Promise<void> {
  if (e.contacto_id !== null) {
    const f: unknown[] =
      ot.cliente_id === null
        ? []
        : await tx.query(`SELECT 1 FROM contacto WHERE id = $1 AND cliente_id = $2 AND activo`, [
            e.contacto_id,
            ot.cliente_id,
          ]);
    if (f.length === 0) {
      throw errorValidacion({ contacto_id: ['Debe ser un contacto activo del cliente de la OT'] });
    }
  }
  const r = calcularCotizacion(e.lineas, {
    moneda: e.moneda,
    aplica_iva: e.aplica_iva,
    iva_pct: cot.iva_pct,
  });
  await tx.query(
    `UPDATE cotizacion SET contacto_id = $2, fecha_emision = $3, validez_dias = $4, moneda = $5, valor_uf = $6,
                           aplica_iva = $7, condiciones = $8, nota_interna = $9, subtotal = $10, descuentos = $11,
                           neto = $12, iva = $13, total = $14, actualizado_en = now()
      WHERE id = $1`,
    [
      cot.id,
      e.contacto_id,
      e.fecha_emision,
      e.validez_dias,
      e.moneda,
      e.moneda === 'UF' ? e.valor_uf : null,
      e.aplica_iva,
      e.condiciones,
      e.nota_interna,
      r.subtotal,
      r.descuentos,
      r.neto,
      r.iva,
      r.total,
    ],
  );
  await tx.query(`DELETE FROM linea_cotizacion WHERE cotizacion_id = $1`, [cot.id]);
  for (const [i, l] of e.lineas.entries()) {
    await tx.query(
      `INSERT INTO linea_cotizacion (cotizacion_id, orden, tipo, descripcion, cantidad, unidad, precio_unitario,
                                     descuento_pct, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        cot.id,
        i + 1,
        l.tipo,
        l.descripcion,
        l.cantidad,
        l.unidad,
        l.precio_unitario,
        l.descuento_pct,
        r.lineas[i],
      ],
    );
  }
}

export async function editarCotizacion(
  actor: UsuarioSesion,
  id: number,
  e: CotizacionEntradaDatos,
): Promise<CotizacionSalidaDatos> {
  return enTransaccion(async (tx) => {
    const { ot, cot } = await bloquearCotizacion(tx, id);
    exigirEditable(ot, cot);
    const antes = await rastreado(tx, id);
    await escribirCotizacion(tx, ot, cot, e);
    const despues = await rastreado(tx, id);
    await registrarCambios(tx, {
      entidad: 'ot',
      entidad_id: ot.id,
      actor,
      antes: { ...antes },
      despues: { ...despues },
      campos: [...CAMPOS_RASTREADOS],
      etiquetas: ETIQUETAS_CAMBIO,
      datos: { cotizacion_id: id, version: cot.version },
    });
    await registrarActividadEnOt(tx, ot.id);
    return cargarCotizacion(tx, id);
  });
}

// ---- Agregar líneas: importar horas y aplicar plantilla (spec fase 4 §5.5 y §5.6) ----

const MAX_LINEAS = 100;

async function lineasActuales(tx: EntityManager, id: number): Promise<LineaGuardable[]> {
  return tx.query(
    `SELECT tipo, descripcion, cantidad::float8 AS cantidad, unidad, precio_unitario::float8 AS precio_unitario,
            descuento_pct::float8 AS descuento_pct
       FROM linea_cotizacion WHERE cotizacion_id = $1 ORDER BY orden`,
    [id],
  );
}

// Tarifa del cliente si existe y si no la global (B12); `null` si ninguna está definida.
async function tarifaDe(
  tx: EntityManager,
  cliente_id: number | null,
  concepto: 'hora_normal' | 'traslado_km',
): Promise<number | null> {
  if (cliente_id !== null) {
    const [t]: { valor: number }[] = await tx.query(
      `SELECT valor::float8 AS valor FROM tarifa_cliente WHERE cliente_id = $1 AND concepto = $2`,
      [cliente_id, concepto],
    );
    if (t) return t.valor;
  }
  return (await leerTarifas(tx))[concepto];
}

const tarifaFaltante = (concepto: string): ErrorApp =>
  new ErrorApp('TARIFA_FALTANTE', 'Configura la tarifa en Configuración → Tarifas', { concepto });

// Las tarifas están en pesos: una cotización en UF no puede recibir precios tomados de ellas.
const tarifaEnPesos = (): ErrorApp =>
  errorValidacion({ moneda: ['Las tarifas están en pesos: cambia la moneda a CLP primero'] });

async function agregarLineas(
  tx: EntityManager,
  actor: UsuarioSesion,
  ot: OtBloqueada,
  cot: CotizacionBloqueada,
  nuevas: LineaGuardable[],
  extra: { condiciones?: string | null },
  datos: Record<string, unknown>,
): Promise<void> {
  const [actual]: {
    contacto_id: number | null;
    fecha_emision: string;
    validez_dias: 15 | 30;
    moneda: Moneda;
    valor_uf: number | null;
    aplica_iva: boolean;
    condiciones: string | null;
    nota_interna: string | null;
  }[] = await tx.query(
    `SELECT contacto_id, fecha_emision::text AS fecha_emision, validez_dias, moneda, valor_uf::float8 AS valor_uf,
            aplica_iva, condiciones, nota_interna
       FROM cotizacion WHERE id = $1`,
    [cot.id],
  );
  const lineas = [...(await lineasActuales(tx, cot.id)), ...nuevas];
  if (lineas.length > MAX_LINEAS) {
    throw errorValidacion({ lineas: [`Máximo ${MAX_LINEAS} líneas`] });
  }
  await escribirCotizacion(tx, ot, cot, {
    ...actual!,
    condiciones: actual!.condiciones ?? extra.condiciones ?? null,
    lineas,
  });
  await registrarEvento(tx, {
    entidad: 'ot',
    entidad_id: ot.id,
    actor,
    accion: 'cotizacion_lineas_agregadas',
    datos: {
      cotizacion_id: cot.id,
      codigo: cot.codigo,
      version: cot.version,
      n: nuevas.length,
      ...datos,
    },
  });
  await registrarActividadEnOt(tx, ot.id);
}

export async function importarHoras(
  actor: UsuarioSesion,
  id: number,
  e: ImportarHorasEntradaDatos,
): Promise<CotizacionSalidaDatos> {
  return enTransaccion(async (tx) => {
    const { ot, cot } = await bloquearCotizacion(tx, id);
    exigirEditable(ot, cot);
    const tarifaHora = await tarifaDe(tx, ot.cliente_id, 'hora_normal');
    if (tarifaHora === null) throw tarifaFaltante('hora_normal');
    if (cot.moneda === 'UF') throw tarifaEnPesos();

    const columna = e.origen === 'reales' ? 'horas_reales' : 'horas_estimadas';
    const tareas: { titulo: string; horas: number }[] = await tx.query(
      `SELECT titulo, ${columna}::float8 AS horas FROM tarea
        WHERE ot_id = $1 AND ${columna} > 0 ORDER BY orden, id`,
      [ot.id],
    );
    if (tareas.length === 0) {
      throw errorValidacion({
        origen: [`Las tareas no tienen horas ${e.origen === 'reales' ? 'reales' : 'estimadas'}`],
      });
    }
    await agregarLineas(
      tx,
      actor,
      ot,
      cot,
      tareas.map((t) => ({
        tipo: 'mano_de_obra',
        descripcion: t.titulo,
        cantidad: t.horas,
        unidad: 'h',
        precio_unitario: tarifaHora,
        descuento_pct: 0,
      })),
      {},
      { origen: 'tareas' },
    );
    return cargarCotizacion(tx, id);
  });
}

export async function aplicarPlantilla(
  actor: UsuarioSesion,
  id: number,
  e: AplicarPlantillaEntradaDatos,
): Promise<CotizacionSalidaDatos> {
  return enTransaccion(async (tx) => {
    const { ot, cot } = await bloquearCotizacion(tx, id);
    exigirEditable(ot, cot);
    const [plantilla]: { id: number; condiciones: string | null }[] = await tx.query(
      `SELECT id, condiciones FROM plantilla_cotizacion WHERE id = $1 AND activo`,
      [e.plantilla_id],
    );
    if (!plantilla) throw errorValidacion({ plantilla_id: ['No existe o está inactiva'] });
    const lineasPlantilla: (Omit<LineaGuardable, 'precio_unitario'> & {
      precio_unitario: number | null;
    })[] = await tx.query(
      `SELECT tipo, descripcion, cantidad::float8 AS cantidad, unidad, precio_unitario::float8 AS precio_unitario,
              descuento_pct::float8 AS descuento_pct
         FROM plantilla_linea WHERE plantilla_id = $1 ORDER BY orden`,
      [plantilla.id],
    );

    // Precio de la plantilla o, si es null, la tarifa por unidad (h → hora normal, km → traslado; un/gl → 0).
    const nuevas: LineaGuardable[] = [];
    for (const l of lineasPlantilla) {
      let precio = l.precio_unitario;
      if (precio === null) {
        if (l.unidad === 'h' || l.unidad === 'km') {
          const concepto = l.unidad === 'h' ? 'hora_normal' : 'traslado_km';
          precio = await tarifaDe(tx, ot.cliente_id, concepto);
          if (precio === null) throw tarifaFaltante(concepto);
          if (cot.moneda === 'UF') throw tarifaEnPesos();
        } else {
          precio = 0;
        }
      }
      nuevas.push({ ...l, precio_unitario: precio });
    }
    await agregarLineas(
      tx,
      actor,
      ot,
      cot,
      nuevas,
      { condiciones: plantilla.condiciones },
      { origen: 'plantilla', plantilla_id: plantilla.id },
    );
    return cargarCotizacion(tx, id);
  });
}

// ---- Enviar — "Marcar como enviada" (spec fase 4 §5.7) ----

export async function enviarCotizacion(
  actor: UsuarioSesion,
  id: number,
): Promise<CotizacionSalidaDatos> {
  return enTransaccion(async (tx) => {
    // Enviar toca la actividad del ticket: para respetar el orden ticket → OT → cotización (§1.2) y no
    // arriesgar un interbloqueo con el cierre, el ticket se bloquea primero.
    const [previa]: { ticket_id: number }[] = await tx.query(
      `SELECT o.ticket_id FROM cotizacion c JOIN ot o ON o.id = c.ot_id WHERE c.id = $1`,
      [id],
    );
    if (!previa) throw new ErrorApp('NO_ENCONTRADO', 'Cotización no encontrada');
    await bloquearTicket(tx, previa.ticket_id);
    const { ot, cot } = await bloquearCotizacion(tx, id);
    exigirEditable(ot, cot);

    const [cuenta]: { n: number }[] = await tx.query(
      `SELECT count(*)::int AS n FROM linea_cotizacion WHERE cotizacion_id = $1`,
      [id],
    );
    const errores: Record<string, string[]> = {};
    if (cuenta!.n === 0) errores['lineas'] = ['Agrega al menos una línea'];
    if (cot.contacto_id === null) {
      errores['contacto_id'] = ['Indica el contacto que recibe la cotización'];
    }
    if (Object.keys(errores).length > 0) throw errorValidacion(errores);

    if (ot.tipo !== 'facturable' || (ot.etapa !== 'borrador' && ot.etapa !== 'cotizada')) {
      throw new ErrorApp('TRANSICION_INVALIDA', 'Ese cambio de etapa no está permitido', {
        entidad: 'ot',
        desde: ot.etapa,
        hasta: 'cotizada',
        permitidas: transicionesEtapaDesde(ot.tipo, ot.etapa),
      });
    }
    const externo: unknown[] =
      ot.cliente_id === null
        ? []
        : await tx.query(`SELECT 1 FROM cliente WHERE id = $1 AND NOT es_interno`, [ot.cliente_id]);
    if (externo.length === 0) {
      throw errorValidacion({ cliente_id: ['La OT debe tener un cliente externo'] });
    }

    await tx.query(
      `UPDATE cotizacion SET estado = 'enviada', enviada_en = now(), enviada_por = $2, actualizado_en = now()
        WHERE id = $1`,
      [id, actor.id],
    );
    await tx.query(
      `UPDATE cotizacion SET estado = 'reemplazada', actualizado_en = now()
        WHERE ot_id = $1 AND id <> $2 AND estado = 'enviada'`,
      [ot.id, id],
    );
    await tx.query(`UPDATE ot SET contacto_id = COALESCE(contacto_id, $2) WHERE id = $1`, [
      ot.id,
      cot.contacto_id,
    ]);
    if (ot.etapa === 'borrador') {
      await registrarEtapa(tx, actor, ot, 'cotizada', {
        datos: { cotizacion_id: id, codigo: cot.codigo, version: cot.version },
      });
    }
    await registrarEvento(tx, {
      entidad: 'ot',
      entidad_id: ot.id,
      actor,
      accion: 'cotizacion_enviada',
      valor_nuevo: `${cot.codigo} v${cot.version} · ${formatearMonto(cot.total, cot.moneda)}`,
      datos: {
        cotizacion_id: id,
        codigo: cot.codigo,
        version: cot.version,
        moneda: cot.moneda,
        neto: cot.neto,
        total: cot.total,
      },
    });
    await registrarActividadEnOt(tx, ot.id);
    await registrarActividadEnTicket(tx, ot.ticket_id);
    return cargarCotizacion(tx, id);
  });
}

// ---- Duplicar como vN (spec fase 4 §5.8) ----

export async function duplicarCotizacion(
  actor: UsuarioSesion,
  id: number,
): Promise<CotizacionSalidaDatos> {
  return enTransaccion(async (tx) => {
    const { ot, cot } = await bloquearCotizacion(tx, id);
    if (ot.final) throw otCerrada();
    if (!cot.vigente) {
      throw new ErrorApp('COTIZACION_NO_EDITABLE', 'Solo se duplica la versión vigente');
    }
    if (cot.estado === 'aprobada' || ot.etapa === 'aprobada' || ot.etapa === 'en_ejecucion') {
      throw new ErrorApp(
        'COTIZACION_APROBADA',
        'La cotización aprobada no se puede cambiar ni duplicar',
      );
    }
    if (cot.estado === 'borrador') {
      throw new ErrorApp('COTIZACION_NO_EDITABLE', 'Ya es un borrador');
    }
    if (cot.estado !== 'enviada' && cot.estado !== 'rechazada') {
      throw new ErrorApp(
        'COTIZACION_NO_EDITABLE',
        'La cotización no es un borrador o no es la versión vigente',
      );
    }

    // El `iva_pct` es el de la original (snapshot fiscal); la fecha de emisión es hoy.
    const [nueva]: { id: number; version: number }[] = await tx.query(
      `INSERT INTO cotizacion (ot_id, version, codigo, estado, contacto_id, fecha_emision, validez_dias, moneda,
                               valor_uf, aplica_iva, iva_pct, condiciones, nota_interna, subtotal, descuentos,
                               neto, iva, total, creado_por)
       SELECT ot_id, version + 1, codigo, 'borrador', contacto_id, $2::date, validez_dias, moneda, valor_uf,
              aplica_iva, iva_pct, condiciones, nota_interna, subtotal, descuentos, neto, iva, total, $3
         FROM cotizacion WHERE id = $1
       RETURNING id, version`,
      [id, hoyEnSantiago(), actor.id],
    );
    await tx.query(
      `INSERT INTO linea_cotizacion (cotizacion_id, orden, tipo, descripcion, cantidad, unidad, precio_unitario,
                                     descuento_pct, total)
       SELECT $2, orden, tipo, descripcion, cantidad, unidad, precio_unitario, descuento_pct, total
         FROM linea_cotizacion WHERE cotizacion_id = $1 ORDER BY orden`,
      [id, nueva!.id],
    );
    await registrarEvento(tx, {
      entidad: 'ot',
      entidad_id: ot.id,
      actor,
      accion: 'cotizacion_creada',
      valor_nuevo: `${cot.codigo} v${nueva!.version}`,
      datos: {
        cotizacion_id: nueva!.id,
        codigo: cot.codigo,
        version: nueva!.version,
        desde_version: cot.version,
      },
    });
    await registrarActividadEnOt(tx, ot.id);
    return cargarCotizacion(tx, nueva!.id);
  });
}

// ---- Eliminar borrador (spec fase 4 §5.9) ----

export async function eliminarCotizacion(actor: UsuarioSesion, id: number): Promise<void> {
  return enTransaccion(async (tx) => {
    const { ot, cot } = await bloquearCotizacion(tx, id);
    exigirEditable(ot, cot);
    await tx.query(`DELETE FROM cotizacion WHERE id = $1`, [id]);
    await registrarEvento(tx, {
      entidad: 'ot',
      entidad_id: ot.id,
      actor,
      accion: 'cotizacion_eliminada',
      valor_anterior: `${cot.codigo} v${cot.version}`,
      datos: { cotizacion_id: id, codigo: cot.codigo, version: cot.version },
    });
    await registrarActividadEnOt(tx, ot.id);
  });
}

// ---- Descargas .xlsx y PDF (spec fase 4 §7) ----

export type FormatoDocumento = 'xlsx' | 'pdf';

const TIPO_MIME: Record<FormatoDocumento, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

// Genera el documento y deja el rastro: `evento` en la OT y `auditoria.exportacion` (ADR 0017). No guarda
// el documento como `archivo` (§18.5) ni toca la actividad de la OT: descargar no es trabajo sobre ella.
export async function descargarCotizacion(
  actor: UsuarioSesion,
  id: number,
  formato: FormatoDocumento,
): Promise<{ buffer: Buffer; nombre: string; tipo_mime: string }> {
  const cot = await cargarCotizacion(dataSource.manager, id);
  const { nombre_app, logo_url } = await obtenerMarca();
  const marca: MarcaDocumento = { nombre_app };
  if (logo_url !== null) {
    const logo = await leerLogo();
    if (logo.tipo_mime === 'image/png' || logo.tipo_mime === 'image/jpeg') marca.logo = logo;
  }
  const buffer = await (formato === 'xlsx' ? generarXlsx(cot, marca) : generarPdf(cot, marca));
  const sufijo = cot.estado === 'borrador' ? '-BORRADOR' : '';
  const nombre = `${cot.codigo}_v${cot.version}${sufijo}.${formato}`;

  await enTransaccion(async (tx) => {
    await registrarEvento(tx, {
      entidad: 'ot',
      entidad_id: cot.ot_id,
      actor,
      accion: 'cotizacion_descargada',
      datos: { cotizacion_id: id, codigo: cot.codigo, version: cot.version, formato },
    });
    await registrarAuditoria(tx, {
      accion: 'exportacion',
      usuario_id: actor.id,
      detalle: { tipo: formato, entidad: 'cotizacion', entidad_id: id, ot_id: cot.ot_id },
    });
  });
  return { buffer, nombre, tipo_mime: TIPO_MIME[formato] };
}
