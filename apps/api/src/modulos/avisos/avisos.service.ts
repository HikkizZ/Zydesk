import { EVENTOS_AVISO, resolverPreferencias, type Canal, type EventoAviso } from '@zydesk/shared';
import { dataSource } from '../../config/db.js';
import type { UsuarioSesion } from '../../core/auth/tipos.js';
import { ErrorApp } from '../../core/errores/error-app.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import { cargarAviso, contarNoLeidos, listarAvisos } from './avisos.consulta.js';
import type {
  AvisoSalidaDatos,
  AvisosQueryDatos,
  AvisosSalidaDatos,
  PreferenciasEntradaDatos,
  PreferenciasSalidaDatos,
} from './avisos.tipos.js';

// Avisos y preferencias son personales (spec fase 6 §4.5): todo se filtra por el `usuario_id` de la
// sesión y no dejan `evento` ni `auditoria`.

export function listar(actor: UsuarioSesion, q: AvisosQueryDatos): Promise<AvisosSalidaDatos> {
  return listarAvisos(dataSource.manager, actor.id, q);
}

export async function noLeidos(actor: UsuarioSesion): Promise<{ no_leidos: number }> {
  return { no_leidos: await contarNoLeidos(dataSource.manager, actor.id) };
}

// Bloquea solo la fila `aviso` (§1.2). Ajeno → 404; ya leído → idempotente.
export async function marcarLeido(actor: UsuarioSesion, id: number): Promise<AvisoSalidaDatos> {
  return enTransaccion(async (tx) => {
    const [fila]: { leido_en: Date | null }[] = await tx.query(
      `SELECT leido_en FROM aviso WHERE id = $1 AND usuario_id = $2 AND en_app FOR UPDATE`,
      [id, actor.id],
    );
    if (!fila) throw new ErrorApp('NO_ENCONTRADO', 'Aviso no encontrado');
    if (fila.leido_en === null) {
      await tx.query(`UPDATE aviso SET leido_en = now() WHERE id = $1`, [id]);
    }
    return (await cargarAviso(tx, id, actor.id))!;
  });
}

export async function marcarTodosLeidos(actor: UsuarioSesion): Promise<{ marcados: number }> {
  return enTransaccion(async (tx) => {
    // UPDATE … RETURNING devuelve [filas, cantidad]
    const [filas] = (await tx.query(
      `UPDATE aviso SET leido_en = now()
        WHERE usuario_id = $1 AND leido_en IS NULL AND en_app RETURNING id`,
      [actor.id],
    )) as [unknown[], number];
    return { marcados: filas.length };
  });
}

// ---- Preferencias ----

async function leerPreferencias(usuario_id: number): Promise<PreferenciasSalidaDatos> {
  const m = dataSource.manager;
  const filas: { evento: EventoAviso; canal: Canal; activo: boolean }[] = await m.query(
    `SELECT evento, canal, activo FROM preferencia_aviso WHERE usuario_id = $1`,
    [usuario_id],
  );
  const resueltas = resolverPreferencias(filas);
  const vinculo: unknown[] = await m.query(`SELECT 1 FROM vinculo_telegram WHERE usuario_id = $1`, [
    usuario_id,
  ]);
  return {
    filas: EVENTOS_AVISO.map((evento) => ({ evento, ...resueltas[evento] })),
    telegram_vinculado: vinculo.length > 0,
  };
}

export function obtenerPreferencias(actor: UsuarioSesion): Promise<PreferenciasSalidaDatos> {
  return leerPreferencias(actor.id);
}

// Parcial: solo las filas enviadas. El resumen diario no existe «en la app» (CHECK de la tabla).
export async function guardarPreferencias(
  actor: UsuarioSesion,
  e: PreferenciasEntradaDatos,
): Promise<PreferenciasSalidaDatos> {
  await enTransaccion(async (tx) => {
    for (const fila of e.filas) {
      const canales: ['app' | 'telegram', boolean][] = [['telegram', fila.telegram]];
      if (fila.evento !== 'resumen_diario') canales.unshift(['app', fila.app]);
      for (const [canal, activo] of canales) {
        await tx.query(
          `INSERT INTO preferencia_aviso (usuario_id, evento, canal, activo) VALUES ($1, $2, $3, $4)
           ON CONFLICT (usuario_id, evento, canal) DO UPDATE SET activo = EXCLUDED.activo, actualizado_en = now()`,
          [actor.id, fila.evento, canal, activo],
        );
      }
    }
  });
  return leerPreferencias(actor.id);
}
