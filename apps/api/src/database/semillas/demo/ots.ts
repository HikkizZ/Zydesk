import {
  calcularCotizacion,
  ETIQUETA_ESTADO_FACTURACION,
  ETIQUETA_ETAPA_OT,
  ETIQUETA_TIPO_OT,
  formatearMonto,
} from '@zydesk/shared';
import { dataSource } from '../../../config/db.js';
import { enTransaccion } from '../../../core/historial/transaccion.js';
import { eliminarClaves, generarPdfSimple, generarXlsxSimple, guardarArchivo } from './archivos.js';
import { CLIENTE_POR_CLAVE } from './datos-tickets.js';
import { OTS, type CotizacionSemilla, type OtSemilla } from './datos-ots.js';
import {
  evento,
  fechaRelativa,
  instante,
  minutos,
  valorUf,
  type Personas,
  type Tx,
} from './util.js';

// OT y cotizaciones de la demo (spec fase 9 §11.3). Idempotentes por `codigo`; insertan con `numero` explícito y suben
// el contador de OT al último sembrado. Dejan los mismos campos y eventos que el flujo real (crear → cotizar →
// aprobar → ejecutar → cerrar → facturar). Los totales salen de `calcularCotizacion`.

const ETAPA = ETIQUETA_ETAPA_OT;
const codigoOt = (n: number): string => `OT-${String(n).padStart(4, '0')}`;

interface TarifasGuardadas {
  iva_pct: number;
  validez_dias_defecto: 15 | 30;
  condiciones_defecto: string | null;
}

async function sembrarCotizacion(
  tx: Tx,
  otId: number,
  codigoDeOt: string,
  q: CotizacionSemilla,
  contactoId: number | null,
  creador: number,
  tarifas: TarifasGuardadas,
): Promise<number> {
  const codigo = `COT-${codigoDeOt.replace(/^\D+/, '')}`;
  const aplica_iva = q.aplica_iva !== false;
  const lineas = q.lineas.map((l) => ({
    ...l,
    cantidad: l.cantidad,
    precio_unitario: l.precio,
    descuento_pct: l.descuento ?? 0,
  }));
  const r = calcularCotizacion(lineas, { moneda: q.moneda, aplica_iva, iva_pct: tarifas.iva_pct });
  const diaUf = (q.enviada ?? q.creada)[0];
  const creada_en = await instante(tx, ...q.creada);
  const enviada_en = q.enviada ? await instante(tx, ...q.enviada) : null;
  const respondida_en = q.respondida ? await instante(tx, ...q.respondida) : null;
  const aprobada_en = q.estado === 'aprobada' ? respondida_en : null;
  const rechazada_en = q.estado === 'rechazada' ? respondida_en : null;
  const ultima = respondida_en ?? enviada_en ?? creada_en;

  const [{ id }] = await tx.query(
    `INSERT INTO cotizacion (ot_id, version, codigo, estado, contacto_id, fecha_emision, validez_dias, moneda,
                             valor_uf, valor_uf_fecha, valor_uf_fuente, aplica_iva, iva_pct, condiciones,
                             nota_interna, subtotal, descuentos, neto, iva, total, enviada_en, enviada_por,
                             aprobada_en, rechazada_en, creado_por, creado_en, actualizado_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'semilla', $11, $12, $13, $14, $15, $16, $17, $18, $19,
             $20, $21, $22, $23, $24, $25, $26)
     RETURNING id`,
    [
      otId,
      q.version,
      codigo,
      q.estado,
      contactoId,
      await fechaRelativa(tx, diaUf),
      tarifas.validez_dias_defecto,
      q.moneda,
      valorUf(diaUf),
      await fechaRelativa(tx, diaUf),
      aplica_iva,
      tarifas.iva_pct,
      tarifas.condiciones_defecto,
      q.nota ?? null,
      r.subtotal,
      r.descuentos,
      r.neto,
      r.iva,
      r.total,
      enviada_en,
      enviada_en ? creador : null,
      aprobada_en,
      rechazada_en,
      creador,
      creada_en,
      ultima,
    ],
  );
  for (const [i, l] of lineas.entries()) {
    await tx.query(
      `INSERT INTO linea_cotizacion (cotizacion_id, orden, tipo, descripcion, cantidad, unidad, precio_unitario,
                                     descuento_pct, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
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

  const base = { cotizacion_id: id, codigo, version: q.version };
  const resumen = { ...base, moneda: q.moneda, neto: r.neto, total: r.total };
  const etiqueta = `${codigo} v${q.version} · ${formatearMonto(r.total, q.moneda)}`;
  await evento(tx, 'ot', otId, creador, creada_en, 'cotizacion_creada', {
    nuevo: `${codigo} v${q.version}`,
    datos: q.desde_version ? { ...base, desde_version: q.desde_version } : base,
  });
  if (q.origen) {
    const [plantilla]: { id: number }[] =
      q.origen === 'plantilla'
        ? await tx.query(
            `SELECT id FROM plantilla_cotizacion WHERE nombre = 'Visita técnica estándar'`,
          )
        : [];
    await evento(tx, 'ot', otId, creador, minutos(creada_en, 10), 'cotizacion_lineas_agregadas', {
      datos: {
        ...base,
        n: lineas.length,
        origen: q.origen,
        ...(plantilla ? { plantilla_id: plantilla.id } : {}),
      },
    });
  }
  if (enviada_en) {
    await evento(tx, 'ot', otId, creador, enviada_en, 'cotizacion_enviada', {
      nuevo: etiqueta,
      datos: resumen,
    });
  }
  if (aprobada_en) {
    await evento(tx, 'ot', otId, creador, aprobada_en, 'cotizacion_aprobada', {
      nuevo: etiqueta,
      datos: resumen,
    });
  }
  if (rechazada_en) {
    await evento(tx, 'ot', otId, creador, rechazada_en, 'cotizacion_rechazada', {
      nuevo: `${codigo} v${q.version}`,
      datos: base,
    });
  }
  return id as number;
}

async function pdfOXlsx(a: {
  nombre: string;
  tipo: 'pdf' | 'xlsx';
  titulo: string;
  lineas: string[];
}): Promise<Buffer> {
  if (a.tipo === 'pdf') return generarPdfSimple(a.titulo, a.lineas);
  if (a.nombre.startsWith('inventario-notebooks')) {
    return generarXlsxSimple(
      'Inventario',
      ['Equipo', 'Área', 'Antigüedad (años)', 'Memoria (GB)', 'Estado de la batería'],
      [
        ['Notebook 01', 'Gerencia', 6, 8, 'Degradada'],
        ['Notebook 02', 'Finanzas', 5, 8, 'Degradada'],
        ['Notebook 03', 'Administración', 4, 16, 'Buena'],
        ['Notebook 04', 'Ventas', 6, 8, 'Degradada'],
        ['Notebook 05', 'Ventas', 3, 16, 'Buena'],
      ],
    );
  }
  return generarXlsxSimple(
    'Bodegas',
    ['Bodega', 'Puntos de red', 'Puntos de acceso WiFi', 'Largo de canalización (m)'],
    [
      ['Bodega 1', 70, 4, 520],
      ['Bodega 2', 80, 5, 610],
      ['Bodega 3', 60, 4, 470],
    ],
  );
}

async function sembrarOt(
  o: OtSemilla,
  personas: Personas,
  ticketIds: Map<string, number>,
): Promise<void> {
  const codigo = codigoOt(o.n);
  const existe: unknown[] = await dataSource.query(`SELECT 1 FROM ot WHERE codigo = $1`, [codigo]);
  if (existe.length > 0) return;
  const p = (u: string): number => personas.get(u)!;
  const claves: string[] = [];

  try {
    await enTransaccion(async (tx) => {
      const ticket_id = ticketIds.get(o.ticket)!;
      const [ticket]: { codigo: string }[] = await tx.query(
        `SELECT codigo FROM ticket WHERE id = $1`,
        [ticket_id],
      );
      const [cliente]: { id: number }[] = await tx.query(
        `SELECT id FROM cliente WHERE nombre = $1`,
        [CLIENTE_POR_CLAVE[o.cliente]],
      );
      const [contacto]: { id: number; nombre: string }[] = o.contacto
        ? await tx.query(`SELECT id, nombre FROM contacto WHERE cliente_id = $1 AND nombre = $2`, [
            cliente!.id,
            o.contacto,
          ])
        : [];
      const [bolsa]: { id: number }[] = o.bolsa
        ? await tx.query(
            `SELECT id FROM contrato_bolsa WHERE cliente_id = $1 ORDER BY id LIMIT 1`,
            [cliente!.id],
          )
        : [];
      const [tarifasFila]: { valor: TarifasGuardadas }[] = await tx.query(
        `SELECT valor FROM configuracion WHERE clave = 'tarifas'`,
      );
      const tarifas = tarifasFila!.valor;

      const creador = p(o.creador);
      const creado_en = await instante(tx, o.creado, '10:02');
      const aprobacionDia = o.aprobacion?.dia ?? o.aprobada?.dia ?? null;
      const aprobada_en =
        aprobacionDia === null ? null : await instante(tx, aprobacionDia, '11:30');
      const aprobada_por = o.aprobacion
        ? p(o.aprobacion.quien)
        : o.aprobada
          ? p(o.aprobada.quien)
          : null;
      const cerrada_en = o.cierre ? await instante(tx, o.cierre.dia, '16:00') : null;
      const facturada_en = o.facturada ? await instante(tx, o.facturada.dia, '14:00') : null;
      const cancelada_en = o.cancelacion ? await instante(tx, o.cancelacion.dia, '15:00') : null;

      const [{ id }] = await tx.query(
        `INSERT INTO ot (numero, codigo, ticket_id, tipo, etapa, titulo, alcance, responsable_tecnico_id, cliente_id,
                         contacto_id, inicio, termino, oc_cliente, condicion_pago, contrato_id, centro_costo,
                         area_solicitante, aprobador_id, aprobada_por, aprobada_en, estado_facturacion, n_factura,
                         facturada_en, facturada_por, resolvio_ticket, resumen_cierre, cerrada_en, cerrada_por,
                         motivo_cancelacion, cancelada_en, creado_por, creado_en, actualizado_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
                 $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $32)
         RETURNING id`,
        [
          o.n,
          codigo,
          ticket_id,
          o.tipo,
          o.etapa,
          o.titulo,
          o.alcance,
          p(o.resp),
          cliente!.id,
          contacto?.id ?? null,
          o.inicio === undefined ? null : await fechaRelativa(tx, o.inicio),
          o.termino === undefined ? null : await fechaRelativa(tx, o.termino),
          o.oc ?? null,
          o.condicion_pago ?? null,
          bolsa?.id ?? null,
          o.centro_costo ?? null,
          o.area ?? null,
          o.aprobador ? p(o.aprobador) : null,
          aprobada_por,
          aprobada_en,
          o.fact,
          o.facturada?.n_factura ?? null,
          facturada_en,
          o.facturada ? p(o.facturada.quien) : null,
          o.cierre ? o.cierre.resolvio : null,
          o.cierre?.resumen ?? null,
          cerrada_en,
          o.cierre ? p(o.cierre.quien) : null,
          o.cancelacion?.motivo ?? null,
          cancelada_en,
          creador,
          creado_en,
        ],
      );
      let ultimo = creado_en;
      const ev = async (
        dia: number,
        hora: string,
        autor: number,
        accion: string,
        extra: { campo?: string; anterior?: string; nuevo?: string; datos?: unknown } = {},
      ): Promise<Date> => {
        const cuando = await instante(tx, dia, hora);
        await evento(tx, 'ot', id, autor, cuando, accion, extra);
        if (cuando > ultimo) ultimo = cuando;
        return cuando;
      };
      const etapa = (
        dia: number,
        hora: string,
        autor: number,
        de: string,
        a: string,
        datos: unknown = null,
      ) => ev(dia, hora, autor, 'cambio', { campo: 'etapa', anterior: de, nuevo: a, datos });

      // ---- Creación (ticket y OT) ----
      const previa = OTS.find((x) => x.cierre?.siguiente === o.n);
      await evento(tx, 'ticket', ticket_id, creador, creado_en, 'convertido_en_ot', {
        nuevo: `${codigo} · ${ETIQUETA_TIPO_OT[o.tipo]}`,
        datos: {
          ot_id: id,
          codigo,
          tipo: o.tipo,
          tareas_traspasadas: 0,
          ...(previa ? { desde_ot: codigoOt(previa.n) } : {}),
        },
      });
      await evento(tx, 'ot', id, creador, creado_en, 'creada', {
        datos: {
          desde_ticket: { id: ticket_id, codigo: ticket!.codigo },
          codigo,
          tipo: o.tipo,
          tareas_traspasadas: 0,
        },
      });

      // ---- Tareas ----
      for (const [i, tr] of o.tareas.entries()) {
        const hecha_en = tr.hecha ? await instante(tx, tr.ventana[1], '12:00') : null;
        const [{ id: tarea_id }] = await tx.query(
          `INSERT INTO tarea (ot_id, titulo, responsable_id, hecha, hecha_en, orden, horas_estimadas, creado_por,
                              creado_en, actualizado_en)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
          [
            id,
            tr.titulo,
            p(tr.quien),
            tr.hecha === true,
            hecha_en,
            i + 1,
            tr.est,
            creador,
            minutos(creado_en, 13),
            hecha_en ?? minutos(creado_en, 13),
          ],
        );
        const [{ nombre }] = await tx.query(`SELECT nombre FROM usuario WHERE id = $1`, [
          p(tr.quien),
        ]);
        await ev(o.creado, '10:15', creador, 'tarea_creada', {
          datos: { tarea_id, titulo: tr.titulo, responsable: nombre, horas_estimadas: tr.est },
        });
        if (hecha_en) {
          await evento(tx, 'ot', id, p(tr.quien), hecha_en, 'tarea_hecha', {
            datos: { tarea_id, titulo: tr.titulo },
          });
        }
      }

      // ---- Cotizaciones y etapas de la OT facturable ----
      let etapaActual: keyof typeof ETAPA = 'borrador';
      let cotAprobadaId: number | undefined;
      for (const q of o.cotizaciones) {
        const cotId = await sembrarCotizacion(
          tx,
          id,
          codigo,
          q,
          contacto?.id ?? null,
          creador,
          tarifas,
        );
        const datosCot = { cotizacion_id: cotId };
        if (q.enviada && etapaActual === 'borrador') {
          await etapa(
            q.enviada[0],
            q.enviada[1],
            creador,
            ETAPA.borrador,
            ETAPA.cotizada,
            datosCot,
          );
          etapaActual = 'cotizada';
        }
        if (q.estado === 'rechazada' && q.respondida) {
          await etapa(
            q.respondida[0],
            q.respondida[1],
            creador,
            ETAPA.cotizada,
            ETAPA.borrador,
            datosCot,
          );
          etapaActual = 'borrador';
        }
        if (q.estado === 'aprobada') cotAprobadaId = cotId;
      }

      // ---- Aprobación ----
      if (o.aprobacion) {
        const a = o.aprobacion;
        const pdf = await guardarArchivo(
          tx,
          {
            contenido: await pdfOXlsx(a.pdf),
            nombre: a.pdf.nombre,
            subido_por: p(a.quien),
            subido_en: aprobada_en!,
            entidad: 'ot',
            entidad_id: id,
          },
          claves,
        );
        const fecha = await fechaRelativa(tx, a.dia);
        await tx.query(
          `INSERT INTO aprobacion_cliente (ot_id, contacto_id, fecha, forma, archivo_id, registrada_por, registrada_en)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, contacto!.id, fecha, a.forma, pdf.id, p(a.quien), aprobada_en],
        );
        await etapa(a.dia, '11:30', p(a.quien), ETAPA.cotizada, 'Aprobada por cliente', {
          contacto: contacto!.nombre,
          fecha,
          forma: a.forma,
          archivo_id: pdf.id,
          cotizacion_id: cotAprobadaId,
        });
        etapaActual = 'aprobada';
      } else if (o.aprobada) {
        const quien = (
          await tx.query(`SELECT nombre FROM usuario WHERE id = $1`, [p(o.aprobada.quien)])
        )[0].nombre;
        await etapa(o.aprobada.dia, '11:30', p(o.aprobada.quien), ETAPA.borrador, ETAPA.aprobada, {
          aprobada_por: quien,
        });
        etapaActual = 'aprobada';
      }
      if (o.inicio !== undefined && etapaActual === 'aprobada') {
        await etapa(o.inicio, '09:00', p(o.resp), ETAPA.aprobada, ETAPA.en_ejecucion);
        etapaActual = 'en_ejecucion';
      }

      // ---- Archivos de la OT ----
      for (const a of o.archivos ?? []) {
        await guardarArchivo(
          tx,
          {
            contenido: await pdfOXlsx(a),
            nombre: a.nombre,
            subido_por: p(a.quien),
            subido_en: await instante(tx, a.dia, '12:00'),
            entidad: 'ot',
            entidad_id: id,
          },
          claves,
        );
        await ev(a.dia, '12:00', p(a.quien), 'archivos_agregados', { datos: { n: 1 } });
      }

      // ---- Seguimientos (con «Copiar al ticket» en algunos) ----
      for (const m of o.mensajes) {
        const en = await instante(tx, m.dia, m.hora);
        const [{ id: origen }] = await tx.query(
          `INSERT INTO mensaje (ot_id, tipo, autor_id, texto, creado_en) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [id, m.tipo === 'nota_interna' ? 'nota_interna' : 'seguimiento', p(m.quien), m.texto, en],
        );
        if (en > ultimo) ultimo = en;
        if (m.copiar) {
          const [{ id: copia }] = await tx.query(
            `INSERT INTO mensaje (ticket_id, tipo, autor_id, texto, copiado_desde_id, creado_en)
             VALUES ($1, 'seguimiento', $2, $3, $4, $5) RETURNING id`,
            [ticket_id, p(m.quien), m.texto, origen, en],
          );
          await evento(tx, 'ticket', ticket_id, p(m.quien), en, 'seguimiento_copiado', {
            datos: { mensaje_id: copia, desde_mensaje_id: origen, ot_id: id, codigo },
          });
        }
      }

      // ---- Cierre, facturación y cancelación ----
      if (o.cierre && cerrada_en) {
        const quien = p(o.cierre.quien);
        await etapa(o.cierre.dia, '16:00', quien, ETAPA.en_ejecucion, ETAPA.cerrada, {
          resolvio_ticket: o.cierre.resolvio,
          siguiente: o.cierre.siguiente
            ? { accion: 'otra_ot', ot: codigoOt(o.cierre.siguiente) }
            : null,
        });
        if (o.tipo === 'facturable') {
          await ev(o.cierre.dia, '16:00', quien, 'cambio', {
            campo: 'estado_facturacion',
            anterior: ETIQUETA_ESTADO_FACTURACION.pendiente,
            nuevo: ETIQUETA_ESTADO_FACTURACION.por_facturar,
          });
        }
        if (o.facturada) {
          await ev(o.facturada.dia, '14:00', p(o.facturada.quien), 'cambio', {
            campo: 'estado_facturacion',
            anterior: ETIQUETA_ESTADO_FACTURACION.por_facturar,
            nuevo: ETIQUETA_ESTADO_FACTURACION.facturada,
            datos: { n_factura: o.facturada.n_factura },
          });
        }
        await evento(tx, 'ticket', ticket_id, quien, cerrada_en, 'ot_cerrada', {
          nuevo: `${codigo} cerrada · ${o.cierre.resolvio ? 'resolvió el ticket' : 'el ticket sigue abierto'}`,
          datos: {
            ot_id: id,
            codigo,
            resolvio_ticket: o.cierre.resolvio,
            siguiente: o.cierre.siguiente
              ? { accion: 'otra_ot', ot: codigoOt(o.cierre.siguiente) }
              : null,
            resumen: o.cierre.resumen,
          },
        });
      }
      if (o.cancelacion && cancelada_en) {
        const quien = p(o.cancelacion.quien);
        await etapa(o.cancelacion.dia, '15:00', quien, ETAPA.cotizada, ETAPA.cancelada, {
          motivo: o.cancelacion.motivo,
        });
        await evento(tx, 'ticket', ticket_id, quien, cancelada_en, 'ot_cancelada', {
          datos: { ot_id: id, codigo, motivo: o.cancelacion.motivo },
        });
      }
      await tx.query(`UPDATE ot SET actualizado_en = $2 WHERE id = $1`, [id, ultimo]);
    });
  } catch (err) {
    await eliminarClaves(claves);
    throw err;
  }
}

export async function sembrarOts(
  personas: Personas,
  ticketIds: Map<string, number>,
): Promise<void> {
  for (const o of OTS) await sembrarOt(o, personas, ticketIds);
  await dataSource.query(`UPDATE contador SET valor = GREATEST(valor, $1) WHERE clave = 'ot'`, [
    Math.max(...OTS.map((o) => o.n)),
  ]);
}
