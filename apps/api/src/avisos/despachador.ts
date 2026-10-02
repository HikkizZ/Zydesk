import {
  NOMBRES_EVENTOS_DOMINIO,
  resolverPreferencias,
  type EventoAviso,
  type PreferenciasResueltas,
} from '@zydesk/shared';
import type PgBoss from 'pg-boss';
import { dataSource } from '../config/db.js';
import { logger } from '../config/logger.js';
import { eventosDominio, type EventoPendiente } from '../core/eventos/dominio.js';
import { enTransaccion } from '../core/historial/transaccion.js';
import { encolarEnvio } from '../core/jobs/enviar-aviso.js';
import { resolverDestinatarios } from './destinatarios.js';
import { construirAviso } from './textos.js';

interface Configuracion {
  boss: PgBoss | null;
  // Token del bot de Telegram; sin él el envío queda `omitido / sin_token`.
  token: () => string | undefined;
}

const config: Configuracion = {
  boss: null,
  token: () => process.env['TELEGRAM_BOT_TOKEN'] || undefined,
};

let conectado = false;
const enVuelo = new Set<Promise<void>>();

// Despacha un evento de dominio (fase 6 §7.1): una fila `aviso` por destinatario, en su propia transacción
// corta y después del commit del negocio; luego encola Telegram. Nunca lanza: el servicio que publicó ya
// respondió. Los logs llevan solo ids y nombres de evento, jamás `texto`.
export async function despachar(evento: EventoPendiente): Promise<void> {
  const nombre = evento[0];
  try {
    const m = dataSource.manager;
    const destinatarios = await resolverDestinatarios(m, evento);
    if (destinatarios.length === 0) return;
    const plan = await construirAviso(m, evento);
    if (!plan) return;

    const prefs = await preferenciasDe(destinatarios);
    const vinculados = await vinculadosDe(destinatarios);
    const hayToken = config.token() !== undefined;

    const insertados = await enTransaccion(async (tx) => {
      const creados: { usuario_id: number; aviso_id: string }[] = [];
      for (const usuario_id of destinatarios) {
        const [fila]: { id: string }[] = await tx.query(
          `INSERT INTO aviso (usuario_id, evento, tipo, clave, texto, enlace, entidad, entidad_id, datos, actor_id, en_app)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
           ON CONFLICT (usuario_id, clave) WHERE clave IS NOT NULL DO NOTHING
           RETURNING id`,
          [
            usuario_id,
            plan.evento,
            plan.tipo,
            plan.clave,
            plan.texto,
            plan.enlace,
            plan.entidad,
            plan.entidad_id,
            JSON.stringify(plan.datos),
            plan.actor_id,
            prefs.get(usuario_id)![plan.evento].app,
          ],
        );
        // Ya existía (misma `clave`): ni fila ni envío nuevos
        if (!fila) continue;
        if (prefs.get(usuario_id)![plan.evento].telegram && vinculados.has(usuario_id)) {
          await tx.query(
            `INSERT INTO aviso_envio (aviso_id, canal, estado, error) VALUES ($1, 'telegram', $2, $3)`,
            [fila.id, hayToken ? 'pendiente' : 'omitido', hayToken ? null : 'sin_token'],
          );
          if (hayToken) creados.push({ usuario_id, aviso_id: fila.id });
        }
      }
      return creados;
    });

    // Tras el commit. Sin `boss` (EJECUTAR_JOBS=false o tests) queda `pendiente` y otro proceso lo recoge.
    for (const { aviso_id } of insertados) {
      if (config.boss) await encolarEnvio(config.boss, aviso_id, 'telegram');
      else logger.debug({ evento: nombre, aviso_id }, 'aviso de Telegram pendiente sin cola');
    }
    logger.debug(
      { evento: nombre, usuario_ids: destinatarios, aviso_ids: insertados.map((i) => i.aviso_id) },
      'aviso despachado',
    );
  } catch (err) {
    logger.error({ err, evento: nombre }, 'no se pudo despachar el aviso');
  }
}

async function preferenciasDe(ids: number[]): Promise<Map<number, PreferenciasResueltas>> {
  const filas: {
    usuario_id: number;
    evento: EventoAviso;
    canal: 'app' | 'telegram' | 'correo';
    activo: boolean;
  }[] = await dataSource.query(
    `SELECT usuario_id, evento, canal, activo FROM preferencia_aviso WHERE usuario_id = ANY($1::int[])`,
    [ids],
  );
  return new Map(
    ids.map((id) => [id, resolverPreferencias(filas.filter((f) => f.usuario_id === id))]),
  );
}

async function vinculadosDe(ids: number[]): Promise<Set<number>> {
  const filas: { usuario_id: number }[] = await dataSource.query(
    `SELECT usuario_id FROM vinculo_telegram WHERE usuario_id = ANY($1::int[])`,
    [ids],
  );
  return new Set(filas.map((f) => f.usuario_id));
}

// Suscribe el despachador a todos los eventos de dominio. Idempotente: `crearApp()` lo llama también
// (tests); `server.ts` lo llama antes con el `boss`. Pasar `opciones.boss` solo cambia la cola.
export function conectarDespachador(opciones: { boss?: PgBoss | null } = {}): void {
  if (opciones.boss !== undefined) config.boss = opciones.boss;
  if (conectado) return;
  conectado = true;
  for (const nombre of NOMBRES_EVENTOS_DOMINIO) {
    eventosDominio.on(nombre, (datos) => {
      const p = despachar([nombre, datos] as EventoPendiente).finally(() => enVuelo.delete(p));
      enVuelo.add(p);
    });
  }
}

// Espera los despachos en curso (tests: evita que una fila llegue después de reiniciar la BD).
export async function esperarDespachos(): Promise<void> {
  while (enVuelo.size > 0) await Promise.all([...enVuelo]);
}
