import { z } from 'zod';
import { ESTADOS_FACTURACION, ETAPAS_OT, FORMAS_APROBACION, TIPOS_OT } from '../enums/ot.js';
import { ESTADOS_TICKET } from '../enums/ticket.js';
import { ArchivoSalida } from './archivo.js';
import { CotizacionBreve } from './cotizacion.js';
import {
  ClienteBreve,
  Responsable,
  UsuarioBreve,
  booleanoTexto,
  csv,
  esquemaPaginacion,
  fechaIso,
  id,
  idQuery,
  instante,
  referencia,
  texto,
} from './comunes.js';
import { TareaSalida } from './tarea.js';

export const OtBreve = z.object({
  id,
  numero: z.number(),
  codigo: z.string(),
  titulo: z.string(),
  tipo: z.enum(TIPOS_OT),
  etapa: z.enum(ETAPAS_OT),
  estado_facturacion: z.enum(ESTADOS_FACTURACION),
  resolvio_ticket: z.boolean().nullable(),
  creado_en: instante,
  cerrada_en: instante.nullable(),
});

export const OtCrearEntrada = z.object({
  tipo: z.enum(TIPOS_OT),
  titulo: texto(200).optional(), // por defecto el asunto del ticket
  alcance: texto(20_000).nullable().default(null),
  responsable_tecnico_id: id.nullable().default(null), // por defecto el principal del ticket
  descuenta_bolsa: z.boolean().default(false),
});

const terminoNoAntesDeInicio = (v: {
  inicio?: string | null | undefined;
  termino?: string | null | undefined;
}): boolean => !v.inicio || !v.termino || v.termino >= v.inicio;

export const OtEditarEntrada = z
  .object({
    tipo: z.enum(TIPOS_OT),
    titulo: texto(200),
    alcance: texto(20_000).nullable(),
    responsable_tecnico_id: id.nullable(),
    cliente_id: id.nullable(),
    contacto_id: id.nullable(),
    inicio: fechaIso.nullable(),
    termino: fechaIso.nullable(),
    oc_cliente: texto(60).nullable(),
    condicion_pago: texto(80).nullable(),
    descuenta_bolsa: z.boolean(),
    centro_costo: texto(80).nullable(),
    area_solicitante: texto(120).nullable(),
    aprobador_id: id.nullable(),
  })
  .partial()
  .refine(terminoNoAntesDeInicio, {
    message: 'termino no puede ser anterior a inicio',
    path: ['termino'],
  });

// Aprobación interna (B8); `iniciar` = "Aprobar e iniciar"
export const AprobarOtEntrada = z.object({ iniciar: z.boolean().default(false) });

export const AprobacionClienteEntrada = z.object({
  contacto_id: id,
  fecha: fechaIso,
  forma: z.enum(FORMAS_APROBACION),
  archivo_id: id,
  iniciar: z.boolean().default(false),
});

export const AprobacionClienteSalida = z.object({
  contacto: z.object({ id, nombre: z.string(), correo: z.string().nullable() }),
  fecha: fechaIso,
  forma: z.enum(FORMAS_APROBACION),
  archivo: ArchivoSalida,
  registrada_por: referencia.nullable(),
  registrada_en: instante,
});

export const ArchivosOtEntrada = z.object({ archivo_ids: z.array(id).min(1).max(10) });

export const HorasOt = z.object({
  estimadas: z.number(), // Σ tarea.horas_estimadas
  reales: z.number(), // Σ tarea.horas_reales
  registradas: z.number(), // Σ registro_horas.horas con ot_id
});

export const OtResumen = OtBreve.extend({
  ticket: z.object({ id, codigo: z.string(), asunto: z.string() }),
  cliente: ClienteBreve.nullable(),
  responsable_tecnico: UsuarioBreve.nullable(),
  aprobador: UsuarioBreve.nullable(),
  neto: z.number().nullable(), // neto en CLP de la cotización vigente (enClp); null si no hay o falta valor_uf
  horas: HorasOt,
  inicio: fechaIso.nullable(),
  termino: fechaIso.nullable(),
  vencida: z.boolean(), // termino < hoy (Santiago) y no final
  esperando_cliente: z.boolean(), // facturable && etapa cotizada && cotización vigente enviada (A2: 'Esperando aprobación')
  por_aprobar: z.boolean(), // interna && etapa borrador && aprobador_id !== null (A2: 'Borrador · por aprobar')
  n_mensajes: z.number(),
  actualizado_en: instante,
});

export const OtSalida = OtResumen.extend({
  alcance: z.string().nullable(),
  cliente_id: id.nullable(),
  contacto: z
    .object({ id, nombre: z.string(), correo: z.string().nullable(), area: z.string().nullable() })
    .nullable(),
  oc_cliente: z.string().nullable(),
  condicion_pago: z.string().nullable(),
  bolsa: z.object({ contrato_id: id, horas_mes: z.number(), usadas_mes: z.number() }).nullable(), // ADR 0015
  centro_costo: z.string().nullable(),
  area_solicitante: z.string().nullable(),
  aprobada_por: referencia.nullable(),
  aprobada_en: instante.nullable(),
  aprobacion: AprobacionClienteSalida.nullable(),
  n_factura: z.string().nullable(),
  facturada_en: instante.nullable(),
  facturada_por: referencia.nullable(),
  resumen_cierre: z.string().nullable(),
  cerrada_por: referencia.nullable(),
  motivo_cancelacion: z.string().nullable(),
  cancelada_en: instante.nullable(),
  tareas: z.array(TareaSalida),
  archivos: z.array(ArchivoSalida), // propios de la OT, sin los de mensajes
  ticket_origen: z.object({
    id,
    codigo: z.string(),
    asunto: z.string(),
    estado: z.enum(ESTADOS_TICKET),
    cliente: ClienteBreve.nullable(),
    responsables: z.array(Responsable),
    seguidores: z.array(UsuarioBreve),
    otras_ots_abiertas: z.array(z.object({ id, codigo: z.string(), etapa: z.enum(ETAPAS_OT) })),
  }),
  cotizacion: CotizacionBreve.extend({ n_versiones: z.number().int() }).nullable(), // la vigente
  costo_interno: z.object({ horas: z.number(), tarifa: z.number(), monto: z.number() }).nullable(), // OT interna con tarifa configurada
  puede_cotizar: z.boolean(), // facturable && etapa borrador|cotizada && cliente externo
  tipo_cambiable: z.boolean(), // etapa === 'borrador'
  creado_por: referencia.nullable(),
});

export const OtsQuery = esquemaPaginacion.extend({
  q: texto(80).optional(),
  ticket_id: idQuery.optional(),
  cliente_id: idQuery.optional(),
  tipo: csv(TIPOS_OT).optional(),
  etapa: csv(ETAPAS_OT).optional(),
  estado_facturacion: csv(ESTADOS_FACTURACION).optional(),
  abiertas: booleanoTexto.optional(),
  responsable_id: idQuery.optional(),
  aprobador_id: idQuery.optional(),
  orden: z.enum(['-actualizado_en', '-creado_en', 'termino']).default('-actualizado_en'),
});

export const IndicadoresOtsSalida = z.object({
  por_facturar: z.object({ n: z.number(), neto: z.number().nullable() }), // estado_facturacion = por_facturar; Σ neto CLP de la cotización vigente
  esperando_cliente: z.object({ n: z.number(), neto: z.number().nullable() }), // esperando_cliente = true
  en_ejecucion: z.number(), // etapa en_ejecucion (ambos tipos)
  horas_internas_mes: z.number(), // Σ registro_horas.horas de OT internas con fecha en el mes actual (Santiago)
});
