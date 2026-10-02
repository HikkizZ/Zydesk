import { randomInt } from 'node:crypto';
import { iniciales, type Rol } from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import { dataSource } from '../../config/db.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { cerrarSesionesDeUsuario, crearSesion, hashToken } from '../../core/auth/sesiones.js';
import type { UsuarioSesion } from '../../core/auth/tipos.js';
import { ErrorApp } from '../../core/errores/error-app.js';
import { registrarAuditoria } from '../../core/historial/auditoria.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import type {
  BotVincularEntradaDatos,
  BotVincularSalidaDatos,
  CodigoVinculoSalidaDatos,
  TelegramEstadoSalidaDatos,
} from './telegram.tipos.js';

// Alfabeto de 32 símbolos sin I, O, 0 ni 1 (spec fase 6 §9.2): legible al escribirlo en el celular.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LARGO_CODIGO = 8;
const CODIGOS_POR_VENTANA = 5;
const FALLOS_POR_CHAT = 5;

function generarCodigo(): string {
  let c = '';
  for (let i = 0; i < LARGO_CODIGO; i++) c += ALFABETO[randomInt(ALFABETO.length)];
  return c;
}

export async function obtenerEstado(actor: UsuarioSesion): Promise<TelegramEstadoSalidaDatos> {
  const [v]: {
    telegram_usuario: string | null;
    vinculado_en: Date;
    sesion_activa: boolean;
  }[] = await dataSource.query(
    `SELECT v.telegram_usuario, v.vinculado_en,
            EXISTS (SELECT 1 FROM sesion s WHERE s.id = v.sesion_id
                     AND s.expira_en > now() AND s.expira_max_en > now()) AS sesion_activa
       FROM vinculo_telegram v WHERE v.usuario_id = $1`,
    [actor.id],
  );
  return {
    vinculado: v !== undefined,
    telegram_usuario: v?.telegram_usuario ?? null,
    vinculado_en: v ? v.vinculado_en.toISOString() : null,
    sesion_bot_activa: v?.sesion_activa ?? false,
    bot_usuario: env.TELEGRAM_BOT_USUARIO ?? null,
    disponible: Boolean(env.TELEGRAM_BOT_TOKEN),
  };
}

// Código de un solo uso (ADR 0008): 10 minutos, en BD solo el hash. Exige sesión por cookie: un token de
// bot robado no puede vincular otro chat.
export async function crearCodigo(actor: UsuarioSesion): Promise<CodigoVinculoSalidaDatos> {
  if (actor.autenticado_por !== 'cookie') {
    throw new ErrorApp('SIN_PERMISO', 'Solo puedes pedir el código desde la web');
  }
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new ErrorApp('TELEGRAM_NO_DISPONIBLE', 'Telegram no está configurado en el servidor');
  }
  const { codigo, codigo_id, expira_en } = await enTransaccion(async (tx) => {
    const [r]: { total: number; espera_s: number | null }[] = await tx.query(
      `SELECT count(*)::int AS total,
              ceil(extract(epoch FROM min(creado_en) + interval '15 minutes' - now()))::int AS espera_s
         FROM codigo_vinculo
        WHERE usuario_id = $1 AND creado_en > now() - interval '15 minutes'`,
      [actor.id],
    );
    if (r && r.total >= CODIGOS_POR_VENTANA) {
      throw new ErrorApp(
        'CONFLICTO',
        'Pediste demasiados códigos. Espera un momento e inténtalo de nuevo.',
        { espera_s: Math.max(1, r.espera_s ?? 1) },
      );
    }
    await tx.query(
      `UPDATE codigo_vinculo SET usado_en = now()
        WHERE usuario_id = $1 AND usado_en IS NULL AND expira_en > now()`,
      [actor.id],
    );
    const codigo = generarCodigo();
    const [fila]: { id: number; expira_en: Date }[] = await tx.query(
      `INSERT INTO codigo_vinculo (codigo_hash, usuario_id, expira_en)
       VALUES ($1, $2, now() + interval '10 minutes') RETURNING id, expira_en`,
      [hashToken(codigo), actor.id],
    );
    return { codigo, codigo_id: fila!.id, expira_en: fila!.expira_en };
  });
  // Solo ids: el código no se registra jamás
  logger.info({ usuario_id: actor.id, codigo_id }, 'código de vinculación de Telegram generado');
  return {
    codigo,
    expira_en: expira_en.toISOString(),
    // El enlace lo arma el servidor con el @usuario validado en `env` (nunca un valor libre)
    enlace: env.TELEGRAM_BOT_USUARIO
      ? `https://t.me/${env.TELEGRAM_BOT_USUARIO}?start=${codigo}`
      : null,
  };
}

// Borra el vínculo y todas las sesiones del bot de la persona. Idempotente.
export async function desvincular(actor: UsuarioSesion): Promise<void> {
  await enTransaccion(async (tx) => {
    const [borrado] = (await tx.query(
      `DELETE FROM vinculo_telegram WHERE usuario_id = $1 RETURNING usuario_id`,
      [actor.id],
    )) as [unknown[], number];
    await cerrarSesionesDeUsuario(tx, actor.id, 'telegram_desvinculado', undefined, 'bot');
    if (borrado.length > 0) {
      await registrarAuditoria(tx, { accion: 'telegram_desvinculado', usuario_id: actor.id });
    }
  });
}

async function comprobarBloqueoChat(chat_id: number): Promise<void> {
  const [r]: { total: number }[] = await dataSource.query(
    `SELECT count(*)::int AS total FROM auditoria
      WHERE accion = 'telegram_vinculacion_fallida' AND detalle->>'chat_id' = $1
        AND creado_en > now() - interval '15 minutes'`,
    [String(chat_id)],
  );
  if ((r?.total ?? 0) >= FALLOS_POR_CHAT) {
    throw new ErrorApp(
      'VINCULACION_BLOQUEADA',
      'Demasiados intentos. Vuelve a intentarlo más tarde.',
    );
  }
}

const codigoInvalido = () => new ErrorApp('CODIGO_INVALIDO', 'Código inválido o vencido');
const chatEnUso = () =>
  new ErrorApp(
    'TELEGRAM_CHAT_EN_USO',
    'Este chat de Telegram ya está vinculado a otra cuenta. Desvincúlalo allí primero.',
  );

async function vincularEnTx(
  tx: EntityManager,
  e: BotVincularEntradaDatos,
): Promise<BotVincularSalidaDatos> {
  const [c]: {
    id: number;
    usuario_id: number;
    vigente: boolean;
    nombre: string;
    color_avatar: string;
    rol: Rol;
    activo: boolean;
  }[] = await tx.query(
    `SELECT c.id, c.usuario_id, (c.usado_en IS NULL AND c.expira_en > now()) AS vigente,
            u.nombre, u.color_avatar, u.rol, u.activo
       FROM codigo_vinculo c JOIN usuario u ON u.id = c.usuario_id
      WHERE c.codigo_hash = $1 FOR UPDATE OF c`,
    [hashToken(e.codigo)],
  );
  // Inexistente, usado, vencido o de un usuario inactivo: el mismo error
  if (!c || !c.vigente || !c.activo) throw codigoInvalido();

  const [otro]: { usuario_id: number }[] = await tx.query(
    `SELECT usuario_id FROM vinculo_telegram WHERE chat_id = $1`,
    [String(e.chat_id)],
  );
  if (otro && otro.usuario_id !== c.usuario_id) throw chatEnUso();

  await tx.query(`UPDATE codigo_vinculo SET usado_en = now() WHERE id = $1`, [c.id]);
  await tx.query(`SELECT 1 FROM vinculo_telegram WHERE usuario_id = $1 FOR UPDATE`, [c.usuario_id]);
  // Re-vincular reemplaza las sesiones del bot anteriores
  await cerrarSesionesDeUsuario(tx, c.usuario_id, 'telegram_revinculado', undefined, 'bot');
  const sesion = await crearSesion(tx, {
    usuario_id: c.usuario_id,
    origen: 'bot',
    mantener: true,
    ip: null,
    user_agent: 'Telegram',
  });
  await tx.query(
    `INSERT INTO vinculo_telegram (usuario_id, chat_id, telegram_usuario, sesion_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (usuario_id) DO UPDATE
       SET chat_id = EXCLUDED.chat_id, telegram_usuario = EXCLUDED.telegram_usuario,
           sesion_id = EXCLUDED.sesion_id, vinculado_en = now()`,
    [c.usuario_id, String(e.chat_id), e.telegram_usuario, sesion.id],
  );
  await registrarAuditoria(tx, {
    accion: 'telegram_vinculado',
    usuario_id: c.usuario_id,
    detalle: { chat_id: e.chat_id },
  });
  return {
    token: sesion.token,
    usuario: {
      id: c.usuario_id,
      nombre: c.nombre,
      iniciales: iniciales(c.nombre),
      color_avatar: c.color_avatar,
      rol: c.rol,
    },
    expira_en: sesion.expira_en.toISOString(),
  };
}

// `POST /api/bot/vincular` (clave del bot ya validada). El token de sesión sale una sola vez.
export async function vincular(e: BotVincularEntradaDatos): Promise<BotVincularSalidaDatos> {
  await comprobarBloqueoChat(e.chat_id);
  try {
    const salida = await enTransaccion((tx) => vincularEnTx(tx, e));
    logger.info({ usuario_id: salida.usuario.id }, 'Telegram vinculado');
    return salida;
  } catch (err) {
    if (err instanceof ErrorApp && err.codigo === 'CODIGO_INVALIDO') {
      // Fuera de la transacción revertida
      await registrarAuditoria(null, {
        accion: 'telegram_vinculacion_fallida',
        detalle: { chat_id: e.chat_id },
      });
    }
    const pg = (err as { driverError?: { code?: string } }).driverError;
    if (pg?.code === '23505') throw chatEnUso();
    throw err;
  }
}
