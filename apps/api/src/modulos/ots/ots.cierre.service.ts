import {
  ETIQUETA_ESPERA_DE,
  ETIQUETA_ESTADO_FACTURACION,
  ETIQUETA_ETAPA_OT,
  efectosCierreOt,
  transicionesEtapaDesde,
  type CierreOtDatos,
  type EstadoTicket,
  type TipoOt,
} from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import type { UsuarioSesion } from '../../core/auth/tipos.js';
import { publicarPendientes, type EventoPendiente } from '../../core/eventos/dominio.js';
import { ErrorApp } from '../../core/errores/error-app.js';
import { registrarEvento } from '../../core/historial/evento.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import { fuenteNumeros } from '../../core/numeracion/fuente.js';
import { siguienteNumero } from '../../core/numeracion/numeracion.js';
import { copiarAlTicket, insertarMensaje } from '../mensajes/mensajes.service.js';
import { moverTareasAbiertas } from '../tareas/tareas.service.js';
import {
  bloquearTicket,
  cambiarEstadoEnTx,
  guardarResponsablesEnTx,
  otsAbiertas,
  registrarActividadEnTicket,
} from '../tickets/tickets.service.js';
import { bloquearOt } from './ots.acceso.js';
import { errorValidacion, hoyEnSantiago, nombreUsuario, recortar } from './ots.comun.js';
import { cargarOt } from './ots.consulta.js';
import type { OtSalidaDatos } from './ots.tipos.js';

const ETIQUETA_CORTA: Record<TipoOt, string> = { facturable: 'Facturable', interna: 'Interna' };

// Cierre de OT (spec fase 3 §7, spec funcional 4.6): una sola transacción; los eventos de dominio se
// publican solo después del commit. Orden de bloqueo §1.2: ticket → OT.
export async function cerrarOt(
  actor: UsuarioSesion,
  id: number,
  p: CierreOtDatos,
): Promise<OtSalidaDatos> {
  const pendientes: EventoPendiente[] = [];
  const salida = await enTransaccion(async (tx) => {
    // La OT se lee primero sin bloqueo para conocer su ticket; tras bloquear se relee.
    const [previa]: { ticket_id: number }[] = await tx.query(
      `SELECT ticket_id FROM ot WHERE id = $1`,
      [id],
    );
    if (!previa) throw new ErrorApp('NO_ENCONTRADO', 'OT no encontrada');
    const ticket = await bloquearTicket(tx, previa.ticket_id);
    const bloqueada = await bloquearOt(tx, id);
    if (bloqueada.etapa !== 'en_ejecucion') {
      throw new ErrorApp('TRANSICION_INVALIDA', 'Ese cambio de etapa no está permitido', {
        entidad: 'ot',
        desde: bloqueada.etapa,
        hasta: 'cerrada',
        permitidas: transicionesEtapaDesde(bloqueada.tipo, bloqueada.etapa),
      });
    }
    if (ticket.cerrado_en !== null) {
      throw new ErrorApp('TICKET_CERRADO', 'Reabre el ticket para cerrar la OT');
    }

    // Contexto de los efectos (los mismos que muestra el diálogo)
    const responsables: { usuario_id: number; nombre: string }[] = await tx.query(
      `SELECT r.usuario_id, u.nombre FROM ticket_responsable r JOIN usuario u ON u.id = r.usuario_id
        WHERE r.ticket_id = $1 ORDER BY r.principal DESC, u.nombre, u.id`,
      [ticket.id],
    );
    const seguidores: { usuario_id: number; nombre: string }[] = await tx.query(
      `SELECT s.usuario_id, u.nombre FROM ticket_seguidor s JOIN usuario u ON u.id = s.usuario_id
        WHERE s.ticket_id = $1 ORDER BY u.nombre, u.id`,
      [ticket.id],
    );
    let responsable_id: number | null = null;
    if (!p.resolvio_ticket) {
      responsable_id = p.siguiente.responsable_id;
      const [u]: { nombre: string }[] = await tx.query(
        `SELECT nombre FROM usuario WHERE id = $1 AND activo`,
        [responsable_id],
      );
      if (!u) throw errorValidacion({ responsable_id: ['No existe o está inactivo'] });
    }
    const efectos = efectosCierreOt(
      {
        ot: { codigo: bloqueada.codigo, tipo: bloqueada.tipo, neto: null },
        ticket: { codigo: ticket.codigo, estado: ticket.estado, responsables, seguidores },
        responsable_siguiente:
          responsable_id === null
            ? null
            : { nombre: (await nombreUsuario(tx, responsable_id)) ?? '' },
      },
      p,
    );

    if (p.resolvio_ticket) {
      const otras = (await otsAbiertas(tx, ticket.id)).filter((o) => o.id !== id);
      if (otras.length > 0) {
        throw new ErrorApp('OT_ABIERTA', 'El ticket tiene OT abiertas', { ots: otras });
      }
    }

    // 4. La OT
    const hoy = hoyEnSantiago();
    await tx.query(
      `UPDATE ot SET etapa = 'cerrada', resolvio_ticket = $2, resumen_cierre = $3, cerrada_en = now(),
                     cerrada_por = $4, estado_facturacion = $5,
                     termino = COALESCE(termino, CASE WHEN inicio IS NULL OR inicio <= $6::date THEN $6::date ELSE inicio END),
                     actualizado_en = now()
        WHERE id = $1`,
      [id, p.resolvio_ticket, p.resumen, actor.id, efectos.estado_facturacion_final, hoy],
    );

    // 5. Seguimiento en la OT y su copia en el ticket (la actividad del ticket lo muestra como "Cierre de OT-…")
    const mensaje = await insertarMensaje(
      tx,
      actor,
      { ot_id: id },
      {
        tipo: 'seguimiento',
        texto: p.resumen,
        archivo_ids: [],
        mencionados_ids: [],
        horas: null,
        copiar_al_ticket: false,
      },
    );
    await copiarAlTicket(tx, actor, mensaje);

    // 6. Eventos
    await registrarEvento(tx, {
      entidad: 'ot',
      entidad_id: id,
      actor,
      accion: 'cambio',
      campo: 'etapa',
      valor_anterior: ETIQUETA_ETAPA_OT['en_ejecucion'],
      valor_nuevo: ETIQUETA_ETAPA_OT['cerrada'],
      datos: {
        resolvio_ticket: p.resolvio_ticket,
        siguiente: p.resolvio_ticket ? null : p.siguiente,
      },
    });
    if (bloqueada.tipo === 'facturable') {
      await registrarEvento(tx, {
        entidad: 'ot',
        entidad_id: id,
        actor,
        accion: 'cambio',
        campo: 'estado_facturacion',
        valor_anterior: ETIQUETA_ESTADO_FACTURACION['pendiente'],
        valor_nuevo: ETIQUETA_ESTADO_FACTURACION[efectos.estado_facturacion_final],
        datos: null,
      });
    }
    await registrarEvento(tx, {
      entidad: 'ticket',
      entidad_id: ticket.id,
      actor,
      accion: 'ot_cerrada',
      valor_nuevo: `${bloqueada.codigo} cerrada · ${p.resolvio_ticket ? 'resolvió' : 'no resolvió'} el ticket`,
      datos: {
        ot_id: id,
        codigo: bloqueada.codigo,
        resolvio_ticket: p.resolvio_ticket,
        siguiente: p.resolvio_ticket ? null : p.siguiente,
        resumen: recortar(p.resumen, 300),
      },
    });

    // 7. El ticket
    const final: EstadoTicket = efectos.ticket_estado_final;
    if (p.resolvio_ticket) {
      await cambiarEstadoEnTx(tx, actor, ticket.id, { estado: final as 'resuelto' }, { ticket });
    } else {
      const siguiente = p.siguiente;
      if (final === 'en_espera' && siguiente.accion === 'en_espera') {
        const detalle = siguiente.espera_detalle ?? null;
        if (ticket.estado !== 'en_espera') {
          await cambiarEstadoEnTx(
            tx,
            actor,
            ticket.id,
            {
              estado: 'en_espera',
              espera_de: siguiente.espera_de,
              espera_detalle: siguiente.espera_detalle,
            },
            { ticket },
          );
        } else {
          // Ya estaba en espera: solo se actualiza de quién se espera
          await tx.query(
            `UPDATE ticket SET espera_de = $2, espera_detalle = $3, actualizado_en = now() WHERE id = $1`,
            [ticket.id, siguiente.espera_de, detalle],
          );
          await registrarEvento(tx, {
            entidad: 'ticket',
            entidad_id: ticket.id,
            actor,
            accion: 'cambio',
            campo: 'estado',
            valor_anterior: 'En espera',
            valor_nuevo: `En espera · ${ETIQUETA_ESPERA_DE[siguiente.espera_de].toLowerCase()}`,
            datos: { espera_de: siguiente.espera_de, espera_detalle: detalle },
          });
        }
      } else if (ticket.estado !== 'en_curso') {
        await cambiarEstadoEnTx(tx, actor, ticket.id, { estado: 'en_curso' }, { ticket });
      }

      if (efectos.crea_nueva_ot) {
        const { numero, codigo } = await siguienteNumero(tx, 'ot', fuenteNumeros);
        const [nueva]: { id: number }[] = await tx.query(
          `INSERT INTO ot (numero, codigo, ticket_id, tipo, etapa, titulo, alcance, responsable_tecnico_id, cliente_id,
                           contacto_id, contrato_id, centro_costo, area_solicitante, aprobador_id,
                           estado_facturacion, creado_por)
           SELECT $1, $2, ticket_id, tipo, 'borrador', titulo, alcance, $3, cliente_id,
                  contacto_id, contrato_id, centro_costo, area_solicitante, aprobador_id, $4, $5
             FROM ot WHERE id = $6
           RETURNING id`,
          [
            numero,
            codigo,
            responsable_id,
            bloqueada.tipo === 'facturable' ? 'pendiente' : 'no_aplica',
            actor.id,
            id,
          ],
        );
        const movidas = await moverTareasAbiertas(tx, { ot_id: id }, { ot_id: nueva!.id });
        const desde_ot = { id, codigo: bloqueada.codigo };
        await registrarEvento(tx, {
          entidad: 'ot',
          entidad_id: nueva!.id,
          actor,
          accion: 'creada',
          datos: {
            desde_ticket: { id: ticket.id, codigo: ticket.codigo },
            desde_ot,
            codigo,
            tipo: bloqueada.tipo,
            tareas_traspasadas: movidas.length,
          },
        });
        if (movidas.length > 0) {
          await registrarEvento(tx, {
            entidad: 'ot',
            entidad_id: nueva!.id,
            actor,
            accion: 'tareas_traspasadas',
            datos: {
              desde: bloqueada.codigo,
              n: movidas.length,
              titulos: movidas.map((m) => m.titulo),
            },
          });
        }
        await registrarEvento(tx, {
          entidad: 'ticket',
          entidad_id: ticket.id,
          actor,
          accion: 'convertido_en_ot',
          valor_nuevo: `${codigo} · ${ETIQUETA_CORTA[bloqueada.tipo]}`,
          datos: {
            ot_id: nueva!.id,
            codigo,
            tipo: bloqueada.tipo,
            tareas_traspasadas: movidas.length,
            desde_ot,
          },
        });
      }
      await asignarSiguiente(tx, actor, ticket, responsable_id!);
    }
    await registrarActividadEnTicket(tx, ticket.id, { respuesta: true });

    const destinatarios_ids = [
      ...new Set([...responsables, ...seguidores].map((d) => d.usuario_id)),
    ];
    pendientes.push([
      'ot.cerrada',
      { ot_id: id, ticket_id: ticket.id, resolvio_ticket: p.resolvio_ticket, destinatarios_ids },
    ]);
    if (bloqueada.tipo === 'facturable') pendientes.push(['ot.por_facturar', { ot_id: id }]);
    return cargarOt(tx, id);
  });
  publicarPendientes(pendientes);
  return salida;
}

// El responsable del siguiente paso queda como principal; el principal anterior y los demás pasan a "otros".
async function asignarSiguiente(
  tx: EntityManager,
  actor: UsuarioSesion,
  ticket: Awaited<ReturnType<typeof bloquearTicket>>,
  responsable_id: number,
): Promise<void> {
  const actuales: { usuario_id: number }[] = await tx.query(
    `SELECT usuario_id FROM ticket_responsable WHERE ticket_id = $1`,
    [ticket.id],
  );
  await guardarResponsablesEnTx(
    tx,
    actor,
    ticket.id,
    {
      principal_id: responsable_id,
      otros_ids: actuales.map((a) => a.usuario_id).filter((u) => u !== responsable_id),
    },
    { ticket },
  );
}
