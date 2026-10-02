import { PERMISOS_POR_ROL, PREFERENCIAS_POR_DEFECTO, ZONA, type Rol } from '@zydesk/shared';
import type PgBoss from 'pg-boss';
import { dataSource } from '../../config/db.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { enviarMensaje, ErrorTelegram, escaparHtml } from '../../integraciones/telegram/cliente.js';
import { hoyEnSantiago } from '../../modulos/horas/horas.tipos.js';
import { cargarMiDia } from '../../modulos/mi-dia/mi-dia.service.js';
import type { MiDiaSalidaDatos } from '../../modulos/mi-dia/mi-dia.tipos.js';
import type { UsuarioSesion } from '../auth/tipos.js';

export const JOB_RESUMEN_DIARIO = 'avisos.resumen_diario';

const ITEMS_POR_SECCION = 5;
const LARGO_ASUNTO = 60;

const recortar = (t: string): string =>
  t.length > LARGO_ASUNTO ? `${t.slice(0, LARGO_ASUNTO - 1)}…` : t;

function seccion(titulo: string, total: number, items: string[]): string | null {
  if (total === 0) return null;
  const visibles = items.slice(0, ITEMS_POR_SECCION).map((i) => escaparHtml(i));
  const resto = total - visibles.length;
  return `${titulo} (${total}): ${visibles.join(', ')}${resto > 0 ? ` y ${resto} más` : ''}`;
}

// "jueves 1 de octubre" en Santiago (la fecha ya viene como AAAA-MM-DD de Santiago).
function fechaLarga(fecha: string): string {
  const partes = new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).formatToParts(new Date(`${fecha}T12:00:00Z`));
  const de = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  return `${de('weekday')} ${de('day')} de ${de('month')}`;
}

// Mensaje de §8.2 o null si no hay nada que mostrar. Solo códigos, asuntos y títulos: nunca texto de mensajes.
export function construirResumen(d: MiDiaSalidaDatos): string | null {
  const secciones = [
    seccion(
      'Vencen hoy',
      d.conteos.vencen_hoy,
      d.vencen_hoy.map((t) => `${t.codigo} ${recortar(t.asunto)}`),
    ),
    seccion(
      'Vencidos',
      d.conteos.vencidos,
      d.vencidos.map((t) => `${t.codigo} ${recortar(t.asunto)}`),
    ),
    seccion(
      'Por aprobar',
      d.conteos.por_aprobar,
      d.por_aprobar.map((o) => `${o.codigo} ${recortar(o.titulo)}`),
    ),
    d.conteos.menciones > 0 ? `Menciones sin leer: ${d.conteos.menciones}` : null,
    seccion(
      'Tareas pendientes',
      d.conteos.tareas,
      d.tareas.map((t) => `${recortar(t.titulo)} (${t.destino.codigo})`),
    ),
  ].filter((s): s is string => s !== null);
  if (secciones.length === 0) return null;
  return [
    `<b>Zydesk · Resumen del ${escaparHtml(fechaLarga(d.fecha))}</b>`,
    ...secciones,
    `<a href="${escaparHtml(`${env.WEB_URL}/mi-dia`)}">Abrir Mi día</a>`,
  ].join('\n');
}

interface Destinatario {
  id: number;
  nombre: string;
  rol: Rol;
  chat_id: string;
}

// `cargarMiDia` solo usa `id` y `permisos` del actor.
function actorDe(u: Destinatario): UsuarioSesion {
  return {
    id: u.id,
    nombre: u.nombre,
    correo: '',
    rol: u.rol,
    permisos: PERMISOS_POR_ROL[u.rol],
    debe_cambiar_contrasena: false,
    debe_aceptar_terminos: false,
    sesion_id: '',
    origen: 'web',
    autenticado_por: 'cookie',
  };
}

export interface ResultadoResumen {
  enviados: number;
  omitidos: number;
  fallidos: number;
  feriado: boolean;
}

// Resumen diario por Telegram (spec fase 6 §8.2): un mensaje por persona con vínculo y preferencia activa
// y algo que mostrar. Sin fila `aviso`. Omitido en feriados generales. Logs: solo ids y conteos.
export async function ejecutarResumenDiario(jobId?: string): Promise<ResultadoResumen> {
  const inicio = Date.now();
  logger.debug({ job: JOB_RESUMEN_DIARIO, job_id: jobId }, 'job iniciado');
  const resultado: ResultadoResumen = { enviados: 0, omitidos: 0, fallidos: 0, feriado: false };
  try {
    const hoy = hoyEnSantiago();
    const [feriado]: unknown[] = await dataSource.query(
      `SELECT 1 FROM feriado WHERE fecha = $1::date AND departamento_id IS NULL`,
      [hoy],
    );
    if (feriado) {
      resultado.feriado = true;
    } else if (!env.TELEGRAM_BOT_TOKEN) {
      logger.info(
        { job: JOB_RESUMEN_DIARIO, job_id: jobId },
        'resumen diario sin token de Telegram',
      );
    } else {
      const usuarios: Destinatario[] = await dataSource.query(
        `SELECT u.id, u.nombre, u.rol, v.chat_id::text AS chat_id
           FROM usuario u
           JOIN vinculo_telegram v ON v.usuario_id = u.id
           LEFT JOIN preferencia_aviso p
             ON p.usuario_id = u.id AND p.evento = 'resumen_diario' AND p.canal = 'telegram'
          WHERE u.activo AND COALESCE(p.activo, $1::boolean)
          ORDER BY u.id`,
        [PREFERENCIAS_POR_DEFECTO.resumen_diario.telegram],
      );
      for (const u of usuarios) {
        try {
          const texto = construirResumen(await cargarMiDia(dataSource.manager, actorDe(u)));
          if (texto === null) {
            resultado.omitidos++;
            continue;
          }
          await enviarMensaje(Number(u.chat_id), texto);
          resultado.enviados++;
        } catch (err) {
          resultado.fallidos++;
          // Nunca el mensaje del error (la URL de Telegram lleva el token): solo el código
          logger.warn(
            {
              job: JOB_RESUMEN_DIARIO,
              job_id: jobId,
              usuario_id: u.id,
              codigo: err instanceof ErrorTelegram ? err.codigo : 'error',
            },
            'no se pudo enviar el resumen diario',
          );
        }
      }
    }
    logger.info(
      { job: JOB_RESUMEN_DIARIO, job_id: jobId, duracion_ms: Date.now() - inicio, ...resultado },
      'job terminado',
    );
    return resultado;
  } catch (err) {
    logger.error(
      { err, job: JOB_RESUMEN_DIARIO, job_id: jobId, duracion_ms: Date.now() - inicio },
      'job fallido',
    );
    throw err;
  }
}

// Cola, worker y programación: 08:30 de lunes a viernes (America/Santiago).
export async function registrarJobResumenDiario(boss: PgBoss): Promise<void> {
  await boss.createQueue(JOB_RESUMEN_DIARIO);
  await boss.work(JOB_RESUMEN_DIARIO, async ([job]) => {
    await ejecutarResumenDiario(job?.id);
  });
  await boss.schedule(JOB_RESUMEN_DIARIO, '30 8 * * 1-5', {}, { tz: ZONA });
}
