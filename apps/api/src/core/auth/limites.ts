import { dataSource } from '../../config/db.js';
import { ErrorApp } from '../errores/error-app.js';
import { registrarAuditoria } from '../historial/auditoria.js';

const MENSAJE = 'Demasiados intentos. Vuelve a intentarlo más tarde.';
const LIMITE_IP = 20;
const FALLOS_POR_BLOQUEO = 5;
const BLOQUEO_BASE_MIN = 15;
const BLOQUEO_MAX_MIN = 24 * 60;

function bloqueado(hasta: Date): ErrorApp {
  return new ErrorApp('INGRESO_BLOQUEADO', MENSAJE, { reintentar_en: hasta.toISOString() });
}

// Límites de ADR 0013 calculados sobre `auditoria` (ADR 0017/0018): 20 intentos por IP en 15 min y
// bloqueo creciente por cuenta. La respuesta es la misma exista o no la cuenta.
export async function comprobarLimites(correo: string, ip: string): Promise<void> {
  if (ip) {
    const [porIp]: { total: number; reintentar_en: Date | null }[] = await dataSource.query(
      `SELECT count(*)::int AS total, min(creado_en) + interval '15 minutes' AS reintentar_en
         FROM auditoria
        WHERE ip = $1::inet AND accion IN ('ingreso_ok','ingreso_fallido')
          AND creado_en > now() - interval '15 minutes'`,
      [ip],
    );
    if (porIp && porIp.total >= LIMITE_IP && porIp.reintentar_en) {
      throw bloqueado(porIp.reintentar_en);
    }
  }
  const [cuenta]: { hasta: Date | null }[] = await dataSource.query(
    `SELECT max((detalle->>'hasta')::timestamptz) AS hasta
       FROM auditoria
      WHERE accion = 'cuenta_bloqueada' AND detalle->>'correo' = $1
        AND creado_en > COALESCE((SELECT max(creado_en) FROM auditoria
                                   WHERE accion = 'ingreso_ok' AND detalle->>'correo' = $1), '-infinity')
        AND (detalle->>'hasta')::timestamptz > now()`,
    [correo],
  );
  if (cuenta?.hasta) throw bloqueado(cuenta.hasta);
}

// Inserta `ingreso_fallido` y, al llegar a 5 fallos seguidos (y a cada múltiplo de 5), `cuenta_bloqueada`.
export async function registrarFallo(correo: string, userAgent: string | null): Promise<void> {
  await registrarAuditoria(null, {
    accion: 'ingreso_fallido',
    detalle: { correo, user_agent: userAgent },
  });
  const [r]: { fallos: number; bloqueos: number }[] = await dataSource.query(
    `WITH ultimo AS (
       SELECT COALESCE(max(creado_en), '-infinity') AS t FROM auditoria
        WHERE accion = 'ingreso_ok' AND detalle->>'correo' = $1)
     SELECT (SELECT count(*)::int FROM auditoria, ultimo
              WHERE accion = 'ingreso_fallido' AND detalle->>'correo' = $1 AND creado_en > ultimo.t) AS fallos,
            (SELECT count(*)::int FROM auditoria, ultimo
              WHERE accion = 'cuenta_bloqueada' AND detalle->>'correo' = $1 AND creado_en > ultimo.t) AS bloqueos`,
    [correo],
  );
  if (!r || r.fallos === 0 || r.fallos % FALLOS_POR_BLOQUEO !== 0) return;
  const bloqueo_n = r.bloqueos + 1;
  const minutos = Math.min(BLOQUEO_BASE_MIN * 2 ** (bloqueo_n - 1), BLOQUEO_MAX_MIN);
  const [h]: { hasta: Date }[] = await dataSource.query(
    `SELECT now() + ($1::int * interval '1 minute') AS hasta`,
    [minutos],
  );
  await registrarAuditoria(null, {
    accion: 'cuenta_bloqueada',
    detalle: { correo, bloqueo_n, hasta: h!.hasta.toISOString() },
  });
}
