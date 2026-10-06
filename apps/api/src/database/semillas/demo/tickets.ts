import { ETIQUETA_ESTADO_TICKET } from '@zydesk/shared';
import { dataSource } from '../../../config/db.js';
import { enTransaccion } from '../../../core/historial/transaccion.js';
import { eliminarClaves, generarXlsxSimple, guardarArchivo, leerEstatico } from './archivos.js';
import {
  CLIENTE_POR_CLAVE,
  TAREAS_HECHAS,
  TICKETS,
  type TareaSemilla,
  type TicketSemilla,
} from './datos-tickets.js';
import {
  evento,
  fechaRelativa,
  horaDe,
  instante,
  instanteLibre,
  minutos,
  type Personas,
  type Tx,
} from './util.js';

// Tickets de la demo (spec fase 9 §11.3). Idempotentes por `codigo`: si el ticket ya existe no se toca. Insertan con
// `numero` explícito y suben el contador al último número sembrado. Los eventos son los que dejaría el flujo real.

const CREADORES = ['ralamos', 'cbustos'];

const nombresDe = async (tx: Tx, ids: number[]): Promise<string[]> => {
  const filas: { id: number; nombre: string }[] = await tx.query(
    `SELECT id, nombre FROM usuario WHERE id = ANY($1::int[])`,
    [ids],
  );
  return ids.map((i) => filas.find((f) => f.id === i)!.nombre);
};

async function xlsxDeCorreo(archivo: string): Promise<Buffer> {
  if (archivo === 'planilla-puestos-obra.xlsx') {
    return generarXlsxSimple(
      'Puestos',
      ['Puesto', 'Área', 'Requiere WiFi'],
      [
        ['Oficina de obra 1', 'Jefatura de obra', 'No'],
        ['Oficina de obra 2', 'Adquisiciones', 'No'],
        ['Oficina de obra 3', 'Prevención de riesgos', 'No'],
        ['Oficina de obra 4', 'Control de calidad', 'No'],
        ['Bodega de materiales', 'Bodega', 'Sí'],
      ],
    );
  }
  return leerEstatico(archivo);
}

async function sembrarTicket(
  t: TicketSemilla,
  personas: Personas,
  ids: Map<string, number>,
): Promise<void> {
  const codigo = `TK-${t.n}`;
  const existe: { id: number }[] = await dataSource.query(
    `SELECT id FROM ticket WHERE codigo = $1`,
    [codigo],
  );
  if (existe[0]) {
    ids.set(t.k, existe[0].id);
    return;
  }
  const p = (u: string): number => personas.get(u)!;
  const clienteNombre = CLIENTE_POR_CLAVE[t.cliente]!;
  const interno = ['af', 'op', 'br'].includes(t.cliente);
  const creador = p(CREADORES[t.n % 2]!);

  const claves: string[] = [];
  try {
    await enTransaccion(async (tx) => {
      const [cliente]: { id: number }[] = await tx.query(
        `SELECT id FROM cliente WHERE nombre = $1`,
        [clienteNombre],
      );
      const [contacto]: { nombre: string; correo: string }[] = interno
        ? []
        : await tx.query(
            `SELECT nombre, correo FROM contacto WHERE cliente_id = $1 ORDER BY id LIMIT 1`,
            [cliente!.id],
          );
      const [categoria]: { id: number }[] = await tx.query(
        `SELECT id FROM categoria WHERE nombre = $1`,
        [t.cat],
      );

      const creado_en = await instante(tx, t.creado, horaDe(t.n));
      const cerrado_en = t.cerrado === undefined ? null : await instante(tx, t.cerrado, '16:20');
      const archivado_en =
        t.archivado === undefined ? null : await instante(tx, t.archivado, '03:00');
      const act = await instante(tx, t.act ?? t.cerrado ?? 1, '15:10');
      const actualizado_en = new Date(Math.max((cerrado_en ?? act).getTime(), creado_en.getTime()));
      const fin = cerrado_en ?? actualizado_en;
      const fecha_limite = await instanteLibre(tx, -t.vence, '23:00');
      const hayRespuesta = t.estado !== 'nuevo' || t.msgs.some((m) => m.t === 's');
      const primera = minutos(creado_en, 60);

      let duplicado_de_id: number | null = null;
      let motivo = t.motivo ?? null;
      if (t.dup) {
        duplicado_de_id = ids.get(t.dup)!;
        motivo = `Duplicado de TK-${TICKETS.find((x) => x.k === t.dup)!.n}`;
      }

      const [{ id }] = await tx.query(
        `INSERT INTO ticket (numero, codigo, asunto, descripcion, cliente_id, solicitante_nombre, solicitante_correo,
                           origen, prioridad, categoria_id, estado, espera_de, espera_detalle, motivo_cierre,
                           duplicado_de_id, fecha_limite, primera_respuesta_en, horas_estimadas, creado_por,
                           creado_en, actualizado_en, cerrado_en, archivado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
       RETURNING id`,
        [
          t.n,
          codigo,
          t.asunto,
          t.desc,
          cliente!.id,
          contacto?.nombre ?? null,
          contacto?.correo ?? null,
          interno ? 'interno' : 'externo',
          t.prio,
          categoria!.id,
          t.estado,
          t.espera?.de ?? null,
          t.espera?.detalle ?? null,
          motivo,
          duplicado_de_id,
          fecha_limite,
          hayRespuesta ? new Date(Math.min(primera.getTime(), fin.getTime())) : null,
          t.est ?? null,
          creador,
          creado_en,
          actualizado_en,
          cerrado_en,
          archivado_en,
        ],
      );
      ids.set(t.k, id);

      for (const [i, u] of t.resp.entries()) {
        await tx.query(
          `INSERT INTO ticket_responsable (ticket_id, usuario_id, principal) VALUES ($1, $2, $3)`,
          [id, p(u), i === 0],
        );
      }
      for (const u of t.seg ?? []) {
        await tx.query(`INSERT INTO ticket_seguidor (ticket_id, usuario_id) VALUES ($1, $2)`, [
          id,
          p(u),
        ]);
      }

      // ---- Eventos de creación y asignación ----
      await evento(tx, 'ticket', id, creador, creado_en, 'creado', {
        datos: {
          desde_correo: t.correo !== undefined,
          adjuntos_extraidos: t.correo?.adjunto ? 1 : 0,
          codigo,
        },
      });
      const asignado_en = minutos(creado_en, 20);
      if (t.resp.length > 0) {
        const nombres = await nombresDe(tx, t.resp.map(p));
        await evento(tx, 'ticket', id, creador, asignado_en, 'cambio', {
          campo: 'responsable_principal',
          nuevo: nombres[0]!,
        });
        if (nombres.length > 1) {
          await evento(tx, 'ticket', id, creador, asignado_en, 'cambio', {
            campo: 'responsables',
            nuevo: nombres.slice(1).join(', '),
          });
        }
      }
      const quienTrabaja = p(t.resp[0] ?? CREADORES[0]!);
      const cuando = minutos(creado_en, 40);
      if (
        t.estado === 'en_curso' ||
        t.estado === 'resuelto' ||
        t.estado === 'descartado' ||
        t.estado === 'duplicado'
      ) {
        await evento(tx, 'ticket', id, quienTrabaja, cuando, 'cambio', {
          campo: 'estado',
          anterior: ETIQUETA_ESTADO_TICKET.nuevo,
          nuevo: ETIQUETA_ESTADO_TICKET.en_curso,
        });
      } else if (t.estado === 'en_espera' && t.espera) {
        await evento(tx, 'ticket', id, quienTrabaja, cuando, 'cambio', {
          campo: 'estado',
          anterior: ETIQUETA_ESTADO_TICKET.nuevo,
          nuevo: ETIQUETA_ESTADO_TICKET.en_espera,
          datos: { espera_de: t.espera.de, espera_detalle: t.espera.detalle },
        });
      }
      if (cerrado_en && t.estado !== 'en_curso') {
        await evento(tx, 'ticket', id, quienTrabaja, cerrado_en, 'cambio', {
          campo: 'estado',
          anterior: ETIQUETA_ESTADO_TICKET.en_curso,
          nuevo: ETIQUETA_ESTADO_TICKET[t.estado],
          datos:
            t.estado === 'descartado'
              ? { motivo }
              : t.estado === 'duplicado'
                ? { duplicado_de_codigo: motivo?.replace('Duplicado de ', '') }
                : {},
        });
      }
      if (archivado_en) await evento(tx, 'ticket', id, null, archivado_en, 'archivado');

      // ---- Correo original y adjunto extraído ----
      if (t.correo) {
        const eml = await guardarArchivo(
          tx,
          {
            contenido: leerEstatico(t.correo.archivo),
            nombre: t.correo.archivo,
            subido_por: creador,
            subido_en: creado_en,
            entidad: 'ticket',
            entidad_id: id,
          },
          claves,
        );
        const texto = leerEstatico(t.correo.archivo)
          .toString('utf8')
          .split(/\r?\n\r?\n/)
          .slice(1)
          .join('\n\n')
          .trim();
        const asunto = /^Subject: (.*)$/m
          .exec(leerEstatico(t.correo.archivo).toString('utf8'))![1]!
          .trim();
        const de = /^From: (.*)$/m
          .exec(leerEstatico(t.correo.archivo).toString('utf8'))![1]!
          .trim();
        const [{ id: correo_id }] = await tx.query(
          `INSERT INTO correo_adjunto (ticket_id, archivo_id, origen, de, para, fecha, asunto, cuerpo)
         VALUES ($1, $2, 'eml', $3, 'soporte@demo.zytech.dev', $4, $5, $6) RETURNING id`,
          [id, eml.id, de, creado_en, asunto, texto],
        );
        if (t.correo.adjunto) {
          await guardarArchivo(
            tx,
            {
              contenido: await xlsxDeCorreo(t.correo.adjunto.archivo),
              nombre: t.correo.adjunto.nombre,
              subido_por: creador,
              subido_en: creado_en,
              entidad: 'ticket',
              entidad_id: id,
              origen_correo_id: correo_id,
            },
            claves,
          );
        }
      }

      // ---- Fotos del ticket ----
      for (const [i, foto] of (t.fotos ?? []).entries()) {
        await guardarArchivo(
          tx,
          {
            contenido: leerEstatico(foto),
            nombre: foto,
            subido_por: quienTrabaja,
            subido_en: minutos(creado_en, 90 + i * 5),
            entidad: 'ticket',
            entidad_id: id,
          },
          claves,
        );
      }

      // ---- Seguimientos y notas (repartidos entre el inicio y la última actividad) ----
      const span = Math.max(fin.getTime() - creado_en.getTime(), 0);
      for (const [i, m] of t.msgs.entries()) {
        const en = new Date(creado_en.getTime() + (span * (i + 1)) / (t.msgs.length + 1));
        const [{ id: mensaje_id }] = await tx.query(
          `INSERT INTO mensaje (ticket_id, tipo, autor_id, texto, horas, creado_en)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [
            id,
            m.t === 's' ? 'seguimiento' : 'nota_interna',
            p(m.quien),
            m.texto,
            m.horas ?? null,
            en,
          ],
        );
        for (const u of m.menciona ?? []) {
          await tx.query(`INSERT INTO mencion (mensaje_id, usuario_id) VALUES ($1, $2)`, [
            mensaje_id,
            p(u),
          ]);
        }
        if (m.horas !== undefined) {
          const [{ f }] = await tx.query(
            `SELECT to_char(($1::timestamptz AT TIME ZONE 'America/Santiago')::date, 'YYYY-MM-DD') AS f`,
            [en],
          );
          await tx.query(
            `INSERT INTO registro_horas (usuario_id, fecha, ticket_id, mensaje_id, horas, creado_en, actualizado_en)
           VALUES ($1, $2, $3, $4, $5, $6, $6)`,
            [p(m.quien), f, id, mensaje_id, m.horas, en],
          );
        }
      }

      // ---- Tareas ----
      const tareas: TareaSemilla[] = [
        ...(TAREAS_HECHAS[t.k] ?? []).map((x) => ({ ...x, hecha: true })),
        ...(t.tareas ?? []),
      ];
      for (const [i, tr] of tareas.entries()) {
        const fecha = tr.vence === undefined ? null : await fechaRelativa(tx, -tr.vence);
        const hecha_en = tr.hecha ? new Date(creado_en.getTime() + span / 2) : null;
        const [{ id: tarea_id }] = await tx.query(
          `INSERT INTO tarea (ticket_id, titulo, responsable_id, fecha, hecha, hecha_en, orden, creado_por, creado_en, actualizado_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
          [
            id,
            tr.titulo,
            p(tr.quien),
            fecha,
            tr.hecha === true,
            hecha_en,
            i + 1,
            creador,
            minutos(creado_en, 50),
            hecha_en ?? minutos(creado_en, 50),
          ],
        );
        const [{ nombre }] = await tx.query(`SELECT nombre FROM usuario WHERE id = $1`, [
          p(tr.quien),
        ]);
        await evento(tx, 'ticket', id, creador, minutos(creado_en, 50), 'tarea_creada', {
          datos: { tarea_id, titulo: tr.titulo, responsable: nombre },
        });
        if (hecha_en) {
          await evento(tx, 'ticket', id, p(tr.quien), hecha_en, 'tarea_hecha', {
            datos: { tarea_id, titulo: tr.titulo },
          });
        }
      }
    });
  } catch (err) {
    await eliminarClaves(claves);
    throw err;
  }
}

// Siembra los tickets que faltan (los duplicados al final, porque apuntan a su original) y sube el contador.
// Devuelve el mapa `k` → id de ticket.
export async function sembrarTickets(personas: Personas): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (const t of TICKETS.filter((x) => !x.dup)) await sembrarTicket(t, personas, ids);
  for (const t of TICKETS.filter((x) => x.dup)) await sembrarTicket(t, personas, ids);
  const ultimo = Math.max(...TICKETS.map((t) => t.n));
  await dataSource.query(`UPDATE contador SET valor = GREATEST(valor, $1) WHERE clave = 'ticket'`, [
    ultimo,
  ]);
  return ids;
}
