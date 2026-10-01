import type { EntityManager } from 'typeorm';
import { dataSource } from '../../config/db.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import {
  eliminarDeDisco,
  guardarBufferComoArchivo,
} from '../../modulos/archivos/archivos.service.js';
import { sembrarCotizacion } from './desarrollo-cotizaciones.js';
import { fechaRelativa, instante, type Tx } from './desarrollo-tickets.js';

// Semillas de OT de desarrollo (spec fase 3 §13): OT-0214 a OT-0219. Idempotentes por `codigo`; insertan
// con `numero` explícito (no simulan la conversión: las tareas del ticket se conservan) y al final suben el
// contador de OT a 219. Las fechas son relativas a "hoy" en Santiago; `dia` = días atrás.

type Tipo = 'facturable' | 'interna';
type Etapa = 'borrador' | 'cotizada' | 'en_ejecucion' | 'cerrada';
type Facturacion = 'no_aplica' | 'pendiente' | 'por_facturar';
type Forma = 'orden_de_compra' | 'correo' | 'cotizacion_firmada';

interface TareaOt {
  titulo: string;
  quien: string;
  est: number;
  real?: number;
  hecha?: boolean;
}

interface OtSemilla {
  numero: number;
  ticket: number; // número del ticket
  tipo: Tipo;
  etapa: Etapa;
  facturacion: Facturacion;
  responsable: string;
  titulo: string;
  alcance?: string;
  cliente: string;
  contacto?: string; // nombre del contacto del cliente
  creado: number; // días atrás (OT creada a las 10:02, la de Camila)
  creador: string;
  inicio?: number;
  termino?: number;
  oc?: string;
  condicion_pago?: string;
  centro_costo?: string;
  area?: string;
  aprobador?: string;
  aprobada_por?: string; // interna: quien aprobó
  aprobacion?: { forma: Forma; archivo: string; quien: string; dia: number };
  cierre?: { resumen: string; dia: number; quien: string };
  tareas: TareaOt[];
}

// prettier-ignore
const OTS: OtSemilla[] = [
  { numero: 214, ticket: 1033, tipo: 'facturable', etapa: 'cotizada', facturacion: 'pendiente', responsable: 'fcastro', titulo: 'Renovación de plataforma de respaldo', cliente: 'Constructora Andes', contacto: '[NOMBRE]', creado: 6, creador: 'fcastro', tareas: [] },
  { numero: 215, ticket: 1037, tipo: 'interna', etapa: 'en_ejecucion', facturacion: 'no_aplica', responsable: 'vsoto', titulo: 'Reemplazo de switch en bodega central', cliente: 'Operaciones', creado: 3, creador: 'fcastro', inicio: 2, centro_costo: 'Operaciones', area: 'Operaciones', aprobador: 'fcastro', aprobada_por: 'fcastro', tareas: [
    { titulo: 'Instalar el switch nuevo y migrar los puertos', quien: 'vsoto', est: 5 },
    { titulo: 'Verificar la conectividad de los equipos de bodega', quien: 'vsoto', est: 3 },
  ] },
  { numero: 216, ticket: 1019, tipo: 'facturable', etapa: 'cerrada', facturacion: 'por_facturar', responsable: 'imorales', titulo: 'Mantención preventiva trimestral', cliente: 'Clínica Los Robles', contacto: '[NOMBRE]', creado: 9, creador: 'crojas', inicio: 5, termino: 1,
    aprobacion: { forma: 'correo', archivo: 'aprobacion_ot-0216.txt', quien: 'crojas', dia: 8 },
    cierre: { resumen: 'Mantención realizada en los 12 equipos; sin observaciones.', dia: 1, quien: 'imorales' },
    tareas: [{ titulo: 'Mantención de los 12 equipos', quien: 'imorales', est: 6, real: 6, hecha: true }] },
  { numero: 217, ticket: 1042, tipo: 'facturable', etapa: 'en_ejecucion', facturacion: 'pendiente', responsable: 'crojas', titulo: 'Migración de correo a nuevo dominio', cliente: 'Constructora Andes', contacto: '[NOMBRE]', creado: 4, creador: 'crojas', inicio: 3, oc: 'OC-4471',
    aprobacion: { forma: 'orden_de_compra', archivo: 'oc-4471.txt', quien: 'crojas', dia: 3 },
    tareas: [
      { titulo: 'Validar el dominio nuevo', quien: 'crojas', est: 1, real: 1, hecha: true },
      { titulo: 'Migrar los buzones', quien: 'mfuentes', est: 8, real: 3 },
      { titulo: 'Recrear los alias y verificar el correo entrante', quien: 'mfuentes', est: 2 },
    ] },
  { numero: 218, ticket: 1048, tipo: 'facturable', etapa: 'cotizada', facturacion: 'pendiente', responsable: 'sdiaz', titulo: 'Regularización de folios de facturación electrónica', alcance: 'Diagnóstico del agotamiento de folios en el ERP, carga de un nuevo CAF, pruebas en QA, paso a producción con acompañamiento de la primera emisión y capacitación breve al equipo de administración.', cliente: 'Viña Santa Clara', contacto: 'Paula Herrera', creado: 1, creador: 'crojas', condicion_pago: '30 días', tareas: [
    { titulo: 'Diagnóstico y revisión de logs', quien: 'sdiaz', est: 3, real: 3, hecha: true },
    { titulo: 'Carga de nuevo CAF y pruebas en QA', quien: 'sdiaz', est: 4, real: 1 },
    { titulo: 'Paso a producción y acompañamiento', quien: 'sdiaz', est: 2 },
    { titulo: 'Capacitación breve', quien: 'crojas', est: 1 },
  ] },
  { numero: 219, ticket: 1053, tipo: 'interna', etapa: 'borrador', facturacion: 'no_aplica', responsable: 'vsoto', titulo: 'Reemplazo de UPS en sala de servidores', cliente: 'Operaciones', creado: 1, creador: 'crojas', centro_costo: 'Operaciones', area: 'Operaciones', aprobador: 'fcastro', tareas: [
    { titulo: 'Retirar la UPS antigua', quien: 'vsoto', est: 4 },
    { titulo: 'Instalar y configurar la UPS nueva', quien: 'vsoto', est: 2 },
  ] },
];

const ETAPA: Record<Etapa | 'aprobada', string> = {
  borrador: 'Borrador',
  cotizada: 'Cotizada',
  aprobada: 'Aprobada',
  en_ejecucion: 'En ejecución',
  cerrada: 'Cerrada',
};
const TIPO: Record<Tipo, string> = { facturable: 'Facturable', interna: 'Interna' };

// PNG de 1×1 píxel (las fotos de OT-0218 son marcadores; el contenido real se valida igual)
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const FOTOS_218 = ['captura_error.png', 'log_erp_folios.png', 'emision_ok_qa.png'];

export async function evento(
  tx: Tx,
  entidad: 'ticket' | 'ot',
  entidad_id: number,
  autor: number,
  creado_en: Date,
  accion: string,
  extra: { campo?: string; anterior?: string; nuevo?: string; datos?: unknown } = {},
): Promise<void> {
  await tx.query(
    `INSERT INTO evento (entidad, entidad_id, autor_id, accion, campo, valor_anterior, valor_nuevo, datos, creado_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
    [
      entidad,
      String(entidad_id),
      autor,
      accion,
      extra.campo ?? null,
      extra.anterior ?? null,
      extra.nuevo ?? null,
      extra.datos === undefined ? null : JSON.stringify(extra.datos),
      creado_en,
    ],
  );
}

async function sembrarOt(
  o: OtSemilla,
  personas: Map<string, number>,
  claves: string[],
): Promise<void> {
  const [c]: { prefijo: string; digitos: number }[] = await dataSource.query(
    `SELECT prefijo, digitos FROM contador WHERE clave = 'ot'`,
  );
  const codigo = `${c!.prefijo}${String(o.numero).padStart(c!.digitos, '0')}`;
  const existe: unknown[] = await dataSource.query(`SELECT 1 FROM ot WHERE codigo = $1`, [codigo]);
  if (existe.length > 0) return;
  const p = (u: string) => personas.get(u)!;

  await enTransaccion(async (tx) => {
    const [ticket]: { id: number; codigo: string }[] = await tx.query(
      `SELECT id, codigo FROM ticket WHERE numero = $1`,
      [o.ticket],
    );
    const [cliente]: { id: number }[] = await tx.query(`SELECT id FROM cliente WHERE nombre = $1`, [
      o.cliente,
    ]);
    const contacto: { id: number; nombre: string }[] = o.contacto
      ? await tx.query(`SELECT id, nombre FROM contacto WHERE cliente_id = $1 AND nombre = $2`, [
          cliente!.id,
          o.contacto,
        ])
      : [];
    const creado_en = await instante(tx, o.creado, '10:02');
    const cierre = o.cierre;
    const cerrada_en = cierre ? await instante(tx, cierre.dia, '16:00') : null;
    const aprobada_dia = o.aprobacion?.dia ?? (o.aprobada_por ? o.creado : null);
    const aprobada_en = aprobada_dia === null ? null : await instante(tx, aprobada_dia, '11:30');
    const aprobada_por = o.aprobacion
      ? p(o.aprobacion.quien)
      : o.aprobada_por
        ? p(o.aprobada_por)
        : null;

    const [{ id }] = await tx.query(
      `INSERT INTO ot (numero, codigo, ticket_id, tipo, etapa, titulo, alcance, responsable_tecnico_id, cliente_id,
                       contacto_id, inicio, termino, oc_cliente, condicion_pago, centro_costo, area_solicitante,
                       aprobador_id, aprobada_por, aprobada_en, estado_facturacion, resolvio_ticket, resumen_cierre,
                       cerrada_en, cerrada_por, creado_por, creado_en, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
               $23, $24, $25, $26, $26)
       RETURNING id`,
      [
        o.numero,
        codigo,
        ticket!.id,
        o.tipo,
        o.etapa,
        o.titulo,
        o.alcance ?? null,
        p(o.responsable),
        cliente!.id,
        contacto[0]?.id ?? null,
        o.inicio === undefined ? null : await fechaRelativa(tx, o.inicio),
        o.termino === undefined ? null : await fechaRelativa(tx, o.termino),
        o.oc ?? null,
        o.condicion_pago ?? null,
        o.centro_costo ?? null,
        o.area ?? null,
        o.aprobador ? p(o.aprobador) : null,
        aprobada_por,
        aprobada_en,
        o.facturacion,
        cierre ? true : null,
        cierre?.resumen ?? null,
        cerrada_en,
        cierre ? p(cierre.quien) : null,
        p(o.creador),
        creado_en,
      ],
    );

    // Eventos de la OT y del ticket (como los dejaría el flujo real)
    const creador = p(o.creador);
    await evento(tx, 'ticket', ticket!.id, creador, creado_en, 'convertido_en_ot', {
      nuevo: `${codigo} · ${TIPO[o.tipo]}`,
      datos: { ot_id: id, codigo, tipo: o.tipo, tareas_traspasadas: 0 },
    });
    await evento(tx, 'ot', id, creador, creado_en, 'creada', {
      datos: {
        desde_ticket: { id: ticket!.id, codigo: ticket!.codigo },
        codigo,
        tipo: o.tipo,
        tareas_traspasadas: 0,
      },
    });
    let t = creado_en.getTime() + 37 * 60_000; // la primera etapa a las 10:40, luego de a un minuto
    const siguiente = () => new Date((t += 60_000));
    const etapa = (autor: number, desde: string, hasta: string, datos: unknown = null) =>
      evento(tx, 'ot', id, autor, siguiente(), 'cambio', {
        campo: 'etapa',
        anterior: desde,
        nuevo: hasta,
        datos,
      });

    // Tareas de la OT (con sus eventos `tarea_creada`)
    for (const [i, tr] of o.tareas.entries()) {
      const hecha_en = tr.hecha ? await instante(tx, Math.max(o.creado - 1, 0), '12:00') : null;
      const [{ id: tarea_id }] = await tx.query(
        `INSERT INTO tarea (ot_id, titulo, responsable_id, hecha, hecha_en, orden, horas_estimadas, horas_reales,
                            creado_por, creado_en, actualizado_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10) RETURNING id`,
        [
          id,
          tr.titulo,
          p(tr.quien),
          tr.hecha === true,
          hecha_en,
          i + 1,
          tr.est,
          tr.real ?? null,
          creador,
          creado_en,
        ],
      );
      await evento(
        tx,
        'ot',
        id,
        p(o.responsable),
        await instante(tx, o.creado, '10:15'),
        'tarea_creada',
        {
          datos: {
            tarea_id,
            titulo: tr.titulo,
            responsable: (
              await tx.query(`SELECT nombre FROM usuario WHERE id = $1`, [p(tr.quien)])
            )[0].nombre,
            horas_estimadas: tr.est,
          },
        },
      );
    }

    // Cotización v1 (spec fase 4 §14): sus eventos van antes de los `cambio etapa`, que llevan su id
    const cotizacion_id = await sembrarCotizacion(
      tx,
      { id, codigo, contacto_id: contacto[0]?.id ?? null, aprobada_en },
      personas,
      evento,
    );

    // Etapas
    if (o.tipo === 'facturable' && o.etapa !== 'borrador') {
      await etapa(
        creador,
        ETAPA.borrador,
        ETAPA.cotizada,
        cotizacion_id === null ? null : { cotizacion_id },
      );
    }
    if (o.tipo === 'interna' && o.aprobada_por) {
      await evento(tx, 'ot', id, p(o.aprobada_por), siguiente(), 'cambio', {
        campo: 'etapa',
        anterior: ETAPA.borrador,
        nuevo: ETAPA.aprobada,
        datos: {
          aprobada_por: (
            await tx.query(`SELECT nombre FROM usuario WHERE id = $1`, [p(o.aprobada_por)])
          )[0].nombre,
        },
      });
    }

    if (o.aprobacion) {
      const a = o.aprobacion;
      const contenido = Buffer.from(
        `Aprobación de ${codigo} registrada por ${a.forma === 'correo' ? 'correo' : 'orden de compra'} (documento de ejemplo).\n`,
        'utf8',
      );
      const archivo = await guardarBufferComoArchivo(tx, {
        contenido,
        nombre_original: a.archivo,
        subido_por: p(a.quien),
        destino: { entidad: 'ot', entidad_id: id },
        tipo: { tipo_mime: 'text/plain', ext: '.txt' },
      });
      claves.push(archivo.clave);
      const fecha = await fechaRelativa(tx, a.dia);
      await tx.query(
        `INSERT INTO aprobacion_cliente (ot_id, contacto_id, fecha, forma, archivo_id, registrada_por, registrada_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, contacto[0]!.id, fecha, a.forma, archivo.id, p(a.quien), aprobada_en],
      );
      await evento(tx, 'ot', id, p(a.quien), siguiente(), 'cambio', {
        campo: 'etapa',
        anterior: ETAPA.cotizada,
        nuevo: 'Aprobada por cliente',
        datos: {
          contacto: contacto[0]!.nombre,
          fecha,
          forma: a.forma,
          archivo_id: archivo.id,
          ...(cotizacion_id === null ? {} : { cotizacion_id }),
        },
      });
    }
    if (o.etapa === 'en_ejecucion' || o.etapa === 'cerrada') {
      await etapa(p(o.responsable), ETAPA.aprobada, ETAPA.en_ejecucion);
    }

    if (o.numero === 218) await detalle218(tx, id, p, claves);

    if (cierre && cerrada_en) {
      const quien = p(cierre.quien);
      await evento(tx, 'ot', id, quien, cerrada_en, 'cambio', {
        campo: 'etapa',
        anterior: ETAPA.en_ejecucion,
        nuevo: ETAPA.cerrada,
        datos: { resolvio_ticket: true, siguiente: null },
      });
      await evento(tx, 'ot', id, quien, cerrada_en, 'cambio', {
        campo: 'estado_facturacion',
        anterior: 'Pendiente',
        nuevo: 'Por facturar',
        datos: null,
      });
      await evento(tx, 'ticket', ticket!.id, quien, cerrada_en, 'ot_cerrada', {
        nuevo: `${codigo} cerrada · resolvió el ticket`,
        datos: {
          ot_id: id,
          codigo,
          resolvio_ticket: true,
          siguiente: null,
          resumen: cierre.resumen,
        },
      });
      // Seguimiento de cierre en la OT y su copia en el ticket
      const [{ id: origen }] = await tx.query(
        `INSERT INTO mensaje (ot_id, tipo, autor_id, texto, creado_en) VALUES ($1, 'seguimiento', $2, $3, $4) RETURNING id`,
        [id, quien, cierre.resumen, cerrada_en],
      );
      const [{ id: copia }] = await tx.query(
        `INSERT INTO mensaje (ticket_id, tipo, autor_id, texto, copiado_desde_id, creado_en)
         VALUES ($1, 'seguimiento', $2, $3, $4, $5) RETURNING id`,
        [ticket!.id, quien, cierre.resumen, origen, cerrada_en],
      );
      await evento(tx, 'ticket', ticket!.id, quien, cerrada_en, 'seguimiento_copiado', {
        datos: { mensaje_id: copia, desde_mensaje_id: origen, ot_id: id, codigo },
      });
    }
  });
}

// OT-0218 (pantalla "Orden de trabajo OT-0218"): fotos, seguimiento con horas y fechas de los eventos.
async function detalle218(
  tx: EntityManager,
  id: number,
  p: (u: string) => number,
  claves: string[],
): Promise<void> {
  const sd = p('sdiaz');
  for (const nombre of FOTOS_218) {
    const archivo = await guardarBufferComoArchivo(tx, {
      contenido: PNG_1X1,
      nombre_original: nombre,
      subido_por: sd,
      destino: { entidad: 'ot', entidad_id: id },
    });
    claves.push(archivo.clave);
  }
  const cuando = await instante(tx, 1, '12:30');
  const [{ id: mensaje_id }] = await tx.query(
    `INSERT INTO mensaje (ot_id, tipo, autor_id, texto, creado_en) VALUES ($1, 'seguimiento', $2, $3, $4) RETURNING id`,
    [id, sd, 'Diagnóstico terminado: 3 h', cuando],
  );
  await tx.query(
    `INSERT INTO registro_horas (usuario_id, fecha, ot_id, mensaje_id, horas, creado_en, actualizado_en)
     VALUES ($1, $2, $3, $4, 3, $5, $5)`,
    [sd, await fechaRelativa(tx, 1), id, mensaje_id, cuando],
  );
}

export async function sembrarOts(personas: Map<string, number>): Promise<void> {
  const claves: string[] = [];
  try {
    for (const o of OTS) await sembrarOt(o, personas, claves);
  } catch (err) {
    await eliminarDeDisco(claves);
    throw err;
  }
  await dataSource.query(`UPDATE contador SET valor = GREATEST(valor, 219) WHERE clave = 'ot'`);
}
