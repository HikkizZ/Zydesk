import {
  ETIQUETA_ESTADO_FACTURACION,
  ETIQUETA_ETAPA_OT,
  puedeCambiarEtapa,
  transicionesEtapaDesde,
  type CambioEtapaOtDatos,
  type CancelarOtDatos,
  type EtapaOt,
  type FacturarOtDatos,
} from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import type { UsuarioSesion } from '../../core/auth/tipos.js';
import { publicarPendientes, type EventoPendiente } from '../../core/eventos/dominio.js';
import { ErrorApp } from '../../core/errores/error-app.js';
import { registrarEvento } from '../../core/historial/evento.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import { asociarArchivos } from '../archivos/archivos.service.js';
import { bloquearTicket, registrarActividadEnTicket } from '../tickets/tickets.service.js';
import { bloquearOt, type OtBloqueada } from './ots.acceso.js';
import { errorValidacion, hoyEnSantiago, nombreUsuario } from './ots.comun.js';
import { cargarOt } from './ots.consulta.js';
import type {
  AprobacionClienteEntradaDatos,
  AprobarOtEntradaDatos,
  OtSalidaDatos,
} from './ots.tipos.js';

function transicionInvalida(
  ot: OtBloqueada,
  hasta: EtapaOt,
  mensaje = 'Ese cambio de etapa no está permitido',
): ErrorApp {
  return new ErrorApp('TRANSICION_INVALIDA', mensaje, {
    entidad: 'ot',
    desde: ot.etapa,
    hasta,
    permitidas: transicionesEtapaDesde(ot.tipo, ot.etapa),
  });
}

// `inicio = hoy` al entrar en ejecución si falta (spec 4.5). Si `termino` ya es anterior a hoy el CHECK
// de la tabla no lo permite: en ese caso `inicio` se deja como está.
async function registrarEtapa(
  tx: EntityManager,
  actor: UsuarioSesion,
  ot: OtBloqueada,
  hasta: EtapaOt,
  opciones: { etiqueta?: string; datos?: unknown } = {},
): Promise<void> {
  const columnas = ['etapa = $2', 'actualizado_en = now()'];
  const valores: unknown[] = [ot.id, hasta];
  if (hasta === 'en_ejecucion') {
    valores.push(hoyEnSantiago());
    columnas.push(
      `inicio = COALESCE(inicio, CASE WHEN termino IS NULL OR termino >= $3::date THEN $3::date END)`,
    );
  }
  await tx.query(`UPDATE ot SET ${columnas.join(', ')} WHERE id = $1`, valores);
  await registrarEvento(tx, {
    entidad: 'ot',
    entidad_id: ot.id,
    actor,
    accion: 'cambio',
    campo: 'etapa',
    valor_anterior: ETIQUETA_ETAPA_OT[ot.etapa],
    valor_nuevo: opciones.etiqueta ?? ETIQUETA_ETAPA_OT[hasta],
    datos: opciones.datos ?? null,
  });
}

// ---- Etapas sin permiso especial (spec fase 3 §4.5) ----

export async function cambiarEtapa(
  actor: UsuarioSesion,
  id: number,
  p: CambioEtapaOtDatos,
): Promise<OtSalidaDatos> {
  return enTransaccion(async (tx) => {
    const ot = await bloquearOt(tx, id);
    if (!puedeCambiarEtapa(ot.tipo, ot.etapa, p.etapa)) throw transicionInvalida(ot, p.etapa);

    if (p.etapa === 'cotizada') {
      // En esta fase es una marca manual: la cotización se hizo fuera de la app.
      const externo: unknown[] =
        ot.cliente_id === null
          ? []
          : await tx.query(`SELECT 1 FROM cliente WHERE id = $1 AND NOT es_interno`, [
              ot.cliente_id,
            ]);
      if (externo.length === 0) {
        throw errorValidacion({ cliente_id: ['La OT debe tener un cliente externo'] });
      }
    }
    await registrarEtapa(tx, actor, ot, p.etapa);
    return cargarOt(tx, id);
  });
}

// ---- Aprobaciones (spec fase 3 §4.6) ----

export async function aprobarOt(
  actor: UsuarioSesion,
  id: number,
  e: AprobarOtEntradaDatos,
): Promise<OtSalidaDatos> {
  return enTransaccion(async (tx) => {
    const ot = await bloquearOt(tx, id);
    if (ot.tipo === 'facturable') {
      throw transicionInvalida(
        ot,
        'aprobada',
        'Una OT facturable se aprueba con la aprobación del cliente',
      );
    }
    if (ot.etapa !== 'borrador') throw transicionInvalida(ot, 'aprobada');

    await tx.query(`UPDATE ot SET aprobada_por = $2, aprobada_en = now() WHERE id = $1`, [
      id,
      actor.id,
    ]);
    await registrarEtapa(tx, actor, ot, 'aprobada', {
      datos: { aprobada_por: await nombreUsuario(tx, actor.id) },
    });
    if (e.iniciar) await registrarEtapa(tx, actor, { ...ot, etapa: 'aprobada' }, 'en_ejecucion');
    return cargarOt(tx, id);
  });
}

export async function registrarAprobacionCliente(
  actor: UsuarioSesion,
  id: number,
  e: AprobacionClienteEntradaDatos,
): Promise<OtSalidaDatos> {
  return enTransaccion(async (tx) => {
    const ot = await bloquearOt(tx, id);
    if (ot.tipo !== 'facturable' || ot.etapa !== 'cotizada')
      throw transicionInvalida(ot, 'aprobada');

    // `aprueba_cotizaciones` es informativo: basta un contacto activo del cliente (spec §17.8)
    const [contacto]: { nombre: string }[] =
      ot.cliente_id === null
        ? []
        : await tx.query(
            `SELECT nombre FROM contacto WHERE id = $1 AND cliente_id = $2 AND activo`,
            [e.contacto_id, ot.cliente_id],
          );
    if (!contacto) {
      throw errorValidacion({ contacto_id: ['Debe ser un contacto activo del cliente de la OT'] });
    }
    await asociarArchivos(tx, [e.archivo_id], { entidad: 'ot', entidad_id: id }, actor);
    await tx.query(
      `INSERT INTO aprobacion_cliente (ot_id, contacto_id, fecha, forma, archivo_id, registrada_por)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, e.contacto_id, e.fecha, e.forma, e.archivo_id, actor.id],
    );
    await tx.query(
      `UPDATE ot SET aprobada_por = $2, aprobada_en = now(), contacto_id = COALESCE(contacto_id, $3) WHERE id = $1`,
      [id, actor.id, e.contacto_id],
    );
    await registrarEtapa(tx, actor, ot, 'aprobada', {
      etiqueta: 'Aprobada por cliente',
      datos: {
        contacto: contacto.nombre,
        fecha: e.fecha,
        forma: e.forma,
        archivo_id: e.archivo_id,
      },
    });
    if (e.iniciar) await registrarEtapa(tx, actor, { ...ot, etapa: 'aprobada' }, 'en_ejecucion');
    return cargarOt(tx, id);
  });
}

// ---- Cancelar (spec fase 3 §4.7) ----

export async function cancelarOt(
  actor: UsuarioSesion,
  id: number,
  p: CancelarOtDatos,
): Promise<OtSalidaDatos> {
  const pendientes: EventoPendiente[] = [];
  const salida = await enTransaccion(async (tx) => {
    // Orden de bloqueo §1.2: ticket → OT. La OT se lee primero sin bloqueo para conocer su ticket.
    const [previa]: { ticket_id: number }[] = await tx.query(
      `SELECT ticket_id FROM ot WHERE id = $1`,
      [id],
    );
    if (!previa) throw new ErrorApp('NO_ENCONTRADO', 'OT no encontrada');
    await bloquearTicket(tx, previa.ticket_id);
    const ot = await bloquearOt(tx, id);
    if (ot.final) throw transicionInvalida(ot, 'cancelada');

    // Una OT cancelada no se factura, aunque sea facturable; sus tareas se quedan en ella.
    await tx.query(
      `UPDATE ot SET motivo_cancelacion = $2, cancelada_en = now(), estado_facturacion = 'no_aplica' WHERE id = $1`,
      [id, p.motivo],
    );
    await registrarEtapa(tx, actor, ot, 'cancelada', { datos: { motivo: p.motivo } });
    await registrarEvento(tx, {
      entidad: 'ticket',
      entidad_id: ot.ticket_id,
      actor,
      accion: 'ot_cancelada',
      datos: { ot_id: id, codigo: ot.codigo, motivo: p.motivo },
    });
    await registrarActividadEnTicket(tx, ot.ticket_id);

    const destinatarios: { usuario_id: number }[] = await tx.query(
      `SELECT usuario_id FROM ticket_responsable WHERE ticket_id = $1
       UNION SELECT usuario_id FROM ticket_seguidor WHERE ticket_id = $1`,
      [ot.ticket_id],
    );
    pendientes.push([
      'ot.cancelada',
      {
        ot_id: id,
        ticket_id: ot.ticket_id,
        destinatarios_ids: destinatarios.map((d) => d.usuario_id),
      },
    ]);
    return cargarOt(tx, id);
  });
  publicarPendientes(pendientes);
  return salida;
}

// ---- Facturar (spec fase 3 §4.1) ----

export async function facturarOt(
  actor: UsuarioSesion,
  id: number,
  p: FacturarOtDatos,
): Promise<OtSalidaDatos> {
  return enTransaccion(async (tx) => {
    const ot = await bloquearOt(tx, id);
    const [f]: { estado_facturacion: keyof typeof ETIQUETA_ESTADO_FACTURACION }[] = await tx.query(
      `SELECT estado_facturacion FROM ot WHERE id = $1`,
      [id],
    );
    if (f!.estado_facturacion !== 'por_facturar') {
      throw new ErrorApp('TRANSICION_INVALIDA', 'La OT no está por facturar', {
        entidad: 'ot',
        campo: 'estado_facturacion',
        desde: f!.estado_facturacion,
        hasta: 'facturada',
        permitidas: [],
      });
    }
    await tx.query(
      `UPDATE ot SET estado_facturacion = 'facturada', n_factura = $2, facturada_en = now(), facturada_por = $3,
                     actualizado_en = now()
        WHERE id = $1`,
      [ot.id, p.n_factura, actor.id],
    );
    await registrarEvento(tx, {
      entidad: 'ot',
      entidad_id: id,
      actor,
      accion: 'cambio',
      campo: 'estado_facturacion',
      valor_anterior: ETIQUETA_ESTADO_FACTURACION['por_facturar'],
      valor_nuevo: ETIQUETA_ESTADO_FACTURACION['facturada'],
      datos: { n_factura: p.n_factura },
    });
    return cargarOt(tx, id);
  });
}
