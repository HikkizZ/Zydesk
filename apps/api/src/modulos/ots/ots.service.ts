import {
  ETIQUETA_TIPO_OT,
  estadoFacturacionInicial,
  formatearFecha,
  tienePermiso,
  type Rol,
  type TipoOt,
} from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import { dataSource } from '../../config/db.js';
import type { UsuarioSesion } from '../../core/auth/tipos.js';
import { ErrorApp } from '../../core/errores/error-app.js';
import { registrarAuditoria } from '../../core/historial/auditoria.js';
import { registrarCambios, registrarEvento } from '../../core/historial/evento.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import { publicarPendientes, type EventoPendiente } from '../../core/eventos/dominio.js';
import { fuenteNumeros } from '../../core/numeracion/fuente.js';
import { siguienteNumero } from '../../core/numeracion/numeracion.js';
import { generarXlsxOts } from '../../integraciones/xlsx/ots.xlsx.js';
import { asociarArchivos, archivosDe } from '../archivos/archivos.service.js';
import { obtenerMarca } from '../configuracion/configuracion.service.js';
import { moverTareasAbiertas } from '../tareas/tareas.service.js';
import { bloquearTicket, registrarActividadEnTicket } from '../tickets/tickets.service.js';
import { bloquearOt, otCerrada, registrarActividadEnOt } from './ots.acceso.js';
import { bolsaVigente, errorValidacion, hoyEnSantiago, recortar } from './ots.comun.js';
import { cargarOt, indicadoresOts, listarOts, listarOtsParaExportar } from './ots.consulta.js';
import type {
  ArchivosOtEntradaDatos,
  IndicadoresOtsDatos,
  OtCrearEntradaDatos,
  OtEditarEntradaDatos,
  OtSalidaDatos,
  OtsQueryDatos,
} from './ots.tipos.js';

export function obtenerOt(id: number): Promise<OtSalidaDatos> {
  return cargarOt(dataSource.manager, id);
}

export function listar(q: OtsQueryDatos): ReturnType<typeof listarOts> {
  return listarOts(dataSource.manager, q);
}

// Pantalla 10: los montos solo con `reportes.ver` (spec fase 6 §12, §25.10).
export function obtenerIndicadores(actor: UsuarioSesion): Promise<IndicadoresOtsDatos> {
  return indicadoresOts(dataSource.manager, actor.permisos.includes('reportes.ver'));
}

// "Exportar para facturación (.xlsx)" con los filtros vigentes. Deja `auditoria.exportacion` (ADR 0017):
// solo los nombres de los filtros, sin valores, ids ni montos; no es una entidad, así que sin `evento` ni `archivo`.
export async function exportarOts(
  actor: UsuarioSesion,
  q: OtsQueryDatos,
  filtros: string[],
): Promise<{ buffer: Buffer; nombre: string; tipo_mime: string }> {
  const filas = await listarOtsParaExportar(dataSource.manager, q);
  const { nombre_app } = await obtenerMarca();
  const buffer = await generarXlsxOts(filas, nombre_app);
  await enTransaccion(async (tx) => {
    await registrarAuditoria(tx, {
      accion: 'exportacion',
      usuario_id: actor.id,
      detalle: { tipo: 'xlsx', entidad: 'ots', filtros },
    });
  });
  return {
    buffer,
    nombre: `ots-facturacion-${hoyEnSantiago()}.xlsx`,
    tipo_mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

const ETIQUETA_CORTA: Record<TipoOt, string> = { facturable: 'Facturable', interna: 'Interna' };

// ---- Convertir ticket en OT (spec fase 3 §4.2) ----

export async function convertirEnOt(
  actor: UsuarioSesion,
  ticket_id: number,
  e: OtCrearEntradaDatos,
): Promise<OtSalidaDatos> {
  return enTransaccion(async (tx) => {
    // Orden de bloqueo §1.2: primero el ticket; la OT nueva no necesita bloqueo.
    const bloqueado = await bloquearTicket(tx, ticket_id);
    if (bloqueado.cerrado_en !== null) {
      throw new ErrorApp('TICKET_CERRADO', 'Reabre el ticket para crear una OT');
    }
    const [ticket]: {
      asunto: string;
      cliente_id: number | null;
      cliente_nombre: string | null;
      cliente_interno: boolean | null;
    }[] = await tx.query(
      `SELECT t.asunto, t.cliente_id, c.nombre AS cliente_nombre, c.es_interno AS cliente_interno
         FROM ticket t LEFT JOIN cliente c ON c.id = t.cliente_id WHERE t.id = $1`,
      [ticket_id],
    );
    const t = ticket!;

    const errores: Record<string, string[]> = {};
    let responsable_id = e.responsable_tecnico_id;
    if (responsable_id === null) {
      const [p]: { usuario_id: number }[] = await tx.query(
        `SELECT usuario_id FROM ticket_responsable WHERE ticket_id = $1 AND principal`,
        [ticket_id],
      );
      responsable_id = p?.usuario_id ?? null;
    }
    if (responsable_id !== null && !(await usuarioActivo(tx, responsable_id))) {
      errores['responsable_tecnico_id'] = ['No existe o está inactivo'];
    }
    let contrato_id: number | null = null;
    if (e.descuenta_bolsa) {
      const mensaje = await validarBolsa(tx, e.tipo, t.cliente_id);
      if (typeof mensaje === 'string') errores['descuenta_bolsa'] = [mensaje];
      else contrato_id = mensaje;
    }
    if (Object.keys(errores).length > 0) throw errorValidacion(errores);

    const { numero, codigo } = await siguienteNumero(tx, 'ot', fuenteNumeros);
    const [fila]: { id: number }[] = await tx.query(
      `INSERT INTO ot (numero, codigo, ticket_id, tipo, etapa, titulo, alcance, responsable_tecnico_id, cliente_id,
                       area_solicitante, contrato_id, estado_facturacion, creado_por)
       VALUES ($1, $2, $3, $4, 'borrador', $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        numero,
        codigo,
        ticket_id,
        e.tipo,
        e.titulo ?? t.asunto,
        e.alcance,
        responsable_id,
        t.cliente_id,
        e.tipo === 'interna' && t.cliente_interno ? t.cliente_nombre : null,
        contrato_id,
        estadoFacturacionInicial(e.tipo),
        actor.id,
      ],
    );
    const id = fila!.id;

    // Las tareas abiertas pasan a la OT (spec 4.4); las hechas se quedan en el ticket.
    const movidas = await moverTareasAbiertas(tx, { ticket_id }, { ot_id: id });
    const n = movidas.length;

    await registrarEvento(tx, {
      entidad: 'ticket',
      entidad_id: ticket_id,
      actor,
      accion: 'convertido_en_ot',
      valor_nuevo: `${codigo} · ${ETIQUETA_CORTA[e.tipo]}`,
      datos: { ot_id: id, codigo, tipo: e.tipo, tareas_traspasadas: n },
    });
    await registrarEvento(tx, {
      entidad: 'ot',
      entidad_id: id,
      actor,
      accion: 'creada',
      datos: {
        desde_ticket: { id: ticket_id, codigo: bloqueado.codigo },
        codigo,
        tipo: e.tipo,
        tareas_traspasadas: n,
      },
    });
    if (n > 0) {
      await registrarEvento(tx, {
        entidad: 'ot',
        entidad_id: id,
        actor,
        accion: 'tareas_traspasadas',
        datos: { desde: bloqueado.codigo, n, titulos: movidas.map((m) => m.titulo) },
      });
    }
    await registrarActividadEnTicket(tx, ticket_id);
    return cargarOt(tx, id);
  });
}

async function usuarioActivo(tx: EntityManager, id: number): Promise<boolean> {
  const f: unknown[] = await tx.query(`SELECT 1 FROM usuario WHERE id = $1 AND activo`, [id]);
  return f.length > 0;
}

// `descuenta_bolsa = true` (ADR 0015): devuelve el contrato vigente o el mensaje de error.
async function validarBolsa(
  tx: EntityManager,
  tipo: TipoOt,
  cliente_id: number | null,
): Promise<number | string> {
  if (tipo !== 'facturable') return 'Solo aplica a una OT facturable';
  if (cliente_id === null) return 'El cliente no tiene bolsa vigente';
  return (await bolsaVigente(tx, cliente_id)) ?? 'El cliente no tiene bolsa vigente';
}

// ---- Editar (spec fase 3 §4.4) ----

interface ValoresRastreados {
  tipo: TipoOt;
  titulo: string;
  alcance: string | null;
  responsable_tecnico: string | null;
  cliente: string | null;
  contacto: string | null;
  inicio: string | null;
  termino: string | null;
  oc_cliente: string | null;
  condicion_pago: string | null;
  descuenta_bolsa: string;
  centro_costo: string | null;
  area_solicitante: string | null;
  aprobador: string | null;
}

async function valoresRastreados(tx: EntityManager, id: number): Promise<ValoresRastreados> {
  const [f]: ValoresRastreados[] = await tx.query(
    `SELECT o.tipo, o.titulo, o.alcance, ur.nombre AS responsable_tecnico, c.nombre AS cliente,
            co.nombre AS contacto, o.inicio::text AS inicio, o.termino::text AS termino, o.oc_cliente,
            o.condicion_pago, CASE WHEN o.contrato_id IS NULL THEN 'no' ELSE 'sí' END AS descuenta_bolsa,
            o.centro_costo, o.area_solicitante, ua.nombre AS aprobador
       FROM ot o
       LEFT JOIN usuario ur ON ur.id = o.responsable_tecnico_id
       LEFT JOIN cliente c ON c.id = o.cliente_id
       LEFT JOIN contacto co ON co.id = o.contacto_id
       LEFT JOIN usuario ua ON ua.id = o.aprobador_id
      WHERE o.id = $1`,
    [id],
  );
  return f!;
}

const CAMPOS_RASTREADOS = [
  'tipo',
  'titulo',
  'alcance',
  'responsable_tecnico',
  'cliente',
  'contacto',
  'inicio',
  'termino',
  'oc_cliente',
  'condicion_pago',
  'descuenta_bolsa',
  'centro_costo',
  'area_solicitante',
  'aprobador',
] as const;

// `AAAA-MM-DD` sin hora: se formatea al mediodía UTC para que la fecha no cambie al pasar a Santiago.
const formatearFechaIso = (f: string): string => formatearFecha(new Date(`${f}T12:00:00Z`));

const ETIQUETAS_CAMBIO: Record<string, (v: unknown) => string> = {
  tipo: (v) => ETIQUETA_TIPO_OT[v as TipoOt],
  alcance: (v) => recortar(String(v)),
  inicio: (v) => formatearFechaIso(String(v)),
  termino: (v) => formatearFechaIso(String(v)),
};

const SOLO_FACTURABLE = [
  'contacto_id',
  'oc_cliente',
  'condicion_pago',
  'descuenta_bolsa',
] as const satisfies readonly (keyof OtEditarEntradaDatos)[];
const SOLO_INTERNA = [
  'centro_costo',
  'area_solicitante',
  'aprobador_id',
] as const satisfies readonly (keyof OtEditarEntradaDatos)[];

export async function editarOt(
  actor: UsuarioSesion,
  id: number,
  e: OtEditarEntradaDatos,
): Promise<OtSalidaDatos> {
  const pendientes: EventoPendiente[] = [];
  const salida = await enTransaccion(async (tx) => {
    const ot = await bloquearOt(tx, id);
    if (ot.final) throw otCerrada();

    const tipoNuevo = e.tipo ?? ot.tipo;
    const cambiaTipo = tipoNuevo !== ot.tipo;
    if (cambiaTipo && ot.etapa !== 'borrador') {
      throw new ErrorApp('OT_TIPO_BLOQUEADO', 'El tipo solo se cambia en Borrador');
    }
    const cambiaCliente = e.cliente_id !== undefined && e.cliente_id !== ot.cliente_id;
    if (cambiaCliente && ot.etapa !== 'borrador') {
      throw new ErrorApp('OT_TIPO_BLOQUEADO', 'El cliente solo se cambia en Borrador');
    }

    // Datos comerciales de una OT aprobada: solo con `ots.aprobar`
    if (
      (ot.etapa === 'aprobada' || ot.etapa === 'en_ejecucion') &&
      !tienePermiso(actor.rol, 'ots.aprobar')
    ) {
      const [actual]: {
        oc_cliente: string | null;
        condicion_pago: string | null;
        contrato_id: number | null;
      }[] = await tx.query(`SELECT oc_cliente, condicion_pago, contrato_id FROM ot WHERE id = $1`, [
        id,
      ]);
      const campos: string[] = [];
      if (e.oc_cliente !== undefined && e.oc_cliente !== actual!.oc_cliente)
        campos.push('oc_cliente');
      if (e.condicion_pago !== undefined && e.condicion_pago !== actual!.condicion_pago) {
        campos.push('condicion_pago');
      }
      if (e.descuenta_bolsa !== undefined && e.descuenta_bolsa !== (actual!.contrato_id !== null)) {
        campos.push('descuenta_bolsa');
      }
      if (campos.length > 0) {
        throw new ErrorApp(
          'SIN_PERMISO',
          'Solo Coordinación o Administración cambian los datos comerciales de una OT aprobada',
          { campos },
        );
      }
    }

    // Campos del otro tipo → 400 por campo
    const errores: Record<string, string[]> = {};
    const ajenos = tipoNuevo === 'interna' ? SOLO_FACTURABLE : SOLO_INTERNA;
    for (const campo of ajenos) {
      if (e[campo] !== undefined) {
        errores[campo] = [
          tipoNuevo === 'interna' ? 'No aplica a una OT interna' : 'No aplica a una OT facturable',
        ];
      }
    }
    if (Object.keys(errores).length > 0) throw errorValidacion(errores);

    // Los valores resultantes se arman en `sets`; el resto de las columnas no se toca.
    const sets: Record<string, unknown> = {};
    const aplicar = (columna: string, valor: unknown): void => {
      sets[columna] = valor;
    };

    if (cambiaTipo) {
      aplicar('tipo', tipoNuevo);
      aplicar('estado_facturacion', estadoFacturacionInicial(tipoNuevo));
      if (tipoNuevo === 'interna') {
        for (const c of ['contrato_id', 'contacto_id', 'oc_cliente', 'condicion_pago']) {
          aplicar(c, null);
        }
      } else {
        for (const c of ['centro_costo', 'area_solicitante', 'aprobador_id']) aplicar(c, null);
      }
    }

    let cliente_id = ot.cliente_id;
    if (cambiaCliente) {
      cliente_id = e.cliente_id ?? null;
      if (cliente_id !== null) {
        const f: unknown[] = await tx.query(`SELECT 1 FROM cliente WHERE id = $1 AND activo`, [
          cliente_id,
        ]);
        if (f.length === 0) errores['cliente_id'] = ['No existe o está inactivo'];
      }
      aplicar('cliente_id', cliente_id);
      aplicar('contacto_id', null);
      aplicar('contrato_id', null);
    }

    if (e.contacto_id !== undefined) {
      if (e.contacto_id !== null) {
        const f: unknown[] = await tx.query(
          `SELECT 1 FROM contacto WHERE id = $1 AND cliente_id = $2 AND activo`,
          [e.contacto_id, cliente_id],
        );
        if (f.length === 0) {
          errores['contacto_id'] = ['Debe ser un contacto activo del cliente de la OT'];
        }
      }
      aplicar('contacto_id', e.contacto_id);
    }
    if (e.aprobador_id !== undefined && e.aprobador_id !== null) {
      const [u]: { rol: Rol }[] = await tx.query(
        `SELECT rol FROM usuario WHERE id = $1 AND activo`,
        [e.aprobador_id],
      );
      if (!u || !tienePermiso(u.rol, 'ots.aprobar')) {
        errores['aprobador_id'] = ['Debe poder aprobar OT'];
      }
    }
    if (e.responsable_tecnico_id !== undefined && e.responsable_tecnico_id !== null) {
      if (!(await usuarioActivo(tx, e.responsable_tecnico_id))) {
        errores['responsable_tecnico_id'] = ['No existe o está inactivo'];
      }
    }
    if (e.descuenta_bolsa !== undefined) {
      // Regla mínima de bolsa (spec fase 4 §6.3): con el contrato ya fijado, `true` no lo vuelve a
      // resolver; para cambiar de contrato hay que enviar `false` y luego `true`.
      const [fijo]: { contrato_id: number | null }[] = await tx.query(
        `SELECT contrato_id FROM ot WHERE id = $1`,
        [id],
      );
      const contratoFijado = fijo!.contrato_id !== null && !('contrato_id' in sets);
      if (e.descuenta_bolsa && contratoFijado) {
        // sin cambios
      } else if (e.descuenta_bolsa) {
        const r = await validarBolsa(tx, tipoNuevo, cliente_id);
        if (typeof r === 'string') errores['descuenta_bolsa'] = [r];
        else aplicar('contrato_id', r);
      } else {
        aplicar('contrato_id', null);
      }
    }
    if (Object.keys(errores).length > 0) throw errorValidacion(errores);

    for (const campo of [
      'titulo',
      'alcance',
      'responsable_tecnico_id',
      'inicio',
      'termino',
      'oc_cliente',
      'condicion_pago',
      'centro_costo',
      'area_solicitante',
      'aprobador_id',
    ] as const) {
      if (e[campo] !== undefined) aplicar(campo, e[campo]);
    }

    // `termino >= inicio` con los valores resultantes (el CHECK de la tabla lo exige)
    const [fechas]: {
      inicio: string | null;
      termino: string | null;
      aprobador_id: number | null;
    }[] = await tx.query(
      `SELECT inicio::text AS inicio, termino::text AS termino, aprobador_id FROM ot WHERE id = $1`,
      [id],
    );
    const inicio = 'inicio' in sets ? (sets['inicio'] as string | null) : fechas!.inicio;
    const termino = 'termino' in sets ? (sets['termino'] as string | null) : fechas!.termino;
    if (inicio && termino && termino < inicio) {
      throw errorValidacion({ termino: ['termino no puede ser anterior a inicio'] });
    }

    const antes = await valoresRastreados(tx, id);
    const columnas = Object.keys(sets);
    const valores = columnas.map((c) => sets[c]);
    await tx.query(
      `UPDATE ot SET ${[...columnas.map((c, i) => `${c} = $${i + 2}`), 'actualizado_en = now()'].join(', ')} WHERE id = $1`,
      [id, ...valores],
    );
    const despues = await valoresRastreados(tx, id);

    await registrarCambios(tx, {
      entidad: 'ot',
      entidad_id: id,
      actor,
      antes: { ...antes },
      despues: { ...despues },
      campos: [...CAMPOS_RASTREADOS],
      etiquetas: ETIQUETAS_CAMBIO,
    });

    // Fase 6 avisará a quien debe aprobar (ADR 0008)
    const aprobador = sets['aprobador_id'] as number | null | undefined;
    if (
      aprobador !== undefined &&
      aprobador !== null &&
      aprobador !== fechas!.aprobador_id &&
      tipoNuevo === 'interna' &&
      ot.etapa === 'borrador'
    ) {
      pendientes.push(['ot.por_aprobar', { ot_id: id, aprobador_id: aprobador }]);
    }
    return cargarOt(tx, id);
  });
  publicarPendientes(pendientes);
  return salida;
}

// ---- Archivos de la OT (spec fase 3 §4.1 y §5) ----

export async function agregarArchivos(
  actor: UsuarioSesion,
  id: number,
  e: ArchivosOtEntradaDatos,
): Promise<OtSalidaDatos['archivos']> {
  return enTransaccion(async (tx) => {
    const ot = await bloquearOt(tx, id);
    if (ot.final) throw otCerrada();
    await asociarArchivos(tx, e.archivo_ids, { entidad: 'ot', entidad_id: id }, actor);
    const nombres: { nombre_original: string }[] = await tx.query(
      `SELECT nombre_original FROM archivo WHERE id = ANY($1::int[]) ORDER BY id`,
      [[...new Set(e.archivo_ids)]],
    );
    await registrarEvento(tx, {
      entidad: 'ot',
      entidad_id: id,
      actor,
      accion: 'archivos_agregados',
      datos: { n: nombres.length, nombres: nombres.map((n) => n.nombre_original) },
    });
    await registrarActividadEnOt(tx, id);
    return archivosDe(tx, 'ot', id);
  });
}
