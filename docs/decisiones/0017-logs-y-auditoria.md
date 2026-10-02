# ADR 0017 — Logs técnicos, auditoría de seguridad e inmutabilidad del historial

**Estado**: aceptada · 2026-09-29 · complementa a ADR 0003 (`evento`) · sustituye parcialmente a ADR 0013 (tabla `intento_ingreso` y su retención de 90 días) · precisada por ADR 0021 (Fase 2), por ADR 0024 (seguridad de la Fase 3) y por ADR 0027 (Fase 6)

## Contexto

Hay tres necesidades distintas que hoy se confunden: (1) el historial de negocio ("todo deja rastro", ADR 0003), (2) saber quién entró, desde dónde y qué cambió en seguridad/configuración, y (3) diagnosticar errores en producción con una API, un bot y jobs corriendo en Docker sin puertos abiertos. Sin Microsoft delante (ADR 0013), la app es la única barrera: la bitácora de seguridad debe ser confiable e inalterable desde la propia app. Las IPs son datos personales, así que cada registro necesita una retención justificada.

## Opciones consideradas

- **Un solo registro para todo** (tabla única o solo logs) — mezcla vidas útiles distintas: el historial es permanente, la seguridad se conserva 1 año y los logs técnicos son efímeros y voluminosos. Descartada.
- **Logs técnicos a archivos propios** (`pino/file`, rotación en la app) — obliga a montar volúmenes y rotar dentro del proceso; en Docker lo natural es stdout.
- **Mantener `intento_ingreso` aparte de `auditoria`** — dos tablas con las mismas columnas (`ip`, `creado_en`, éxito) y dos limpiezas. Se fusionan.
- **Inmutabilidad**: rol de mantención separado vs. función `SECURITY DEFINER` acotada (ver Decisión).

## Decisión

**1. Auditoría de negocio — `evento`** (ADR 0003, sin cambios): misma transacción que el cambio, permanente, vive con su entidad. Incorpora `req_id uuid` para correlacionar con los logs.

**2. Auditoría de seguridad — `auditoria`**: `auditoria(id bigserial, req_id uuid?, usuario_id int? → usuario, ip inet?, accion text, detalle jsonb, creado_en timestamptz)`. Índices: `(creado_en)`, `(usuario_id, creado_en)`, `(accion, creado_en)`, `(ip, creado_en)` y `((detalle->>'correo'), creado_en)` para el bloqueo por cuenta. Acciones (`accion`): `ingreso_ok`, `ingreso_fallido` (`detalle.correo`, `detalle.user_agent`, sin contraseña), `cierre_sesion`, `sesion_cerrada` (por el propio usuario, Administración o cambio de contraseña), `cuenta_bloqueada`, `contrasena_cambiada`, `contrasena_restablecida`, `usuario_creado`, `usuario_desactivado`, `rol_cambiado`, `config_cambiada`, `numeracion_cambiada`, `exportacion` (`detalle.tipo` xlsx|pdf, entidad e id), `descarga_archivo` (`archivo_id`). `detalle` guarda solo ids y valores de configuración, nunca contenido de mensajes, notas ni archivos. Helper `registrarAuditoria(tx | null, { accion, usuario_id?, detalle })`: toma `req_id` e `ip` del contexto de la petición; con `tx` va en la misma transacción que el cambio; sin `tx` (ingreso fallido) inserta directo. **`intento_ingreso` (ADR 0013) desaparece**: el límite por IP / por cuenta consulta `auditoria` con `accion IN ('ingreso_ok','ingreso_fallido')`, y la pantalla Equipo → "Ingresos" lee la misma tabla. Retención **1 año**.

**3. Logs técnicos — pino** (JSON, una línea por evento, stdout). `pino-http` en la API con `req_id`: se toma `X-Request-Id` entrante si es un UUID válido, si no se genera `crypto.randomUUID()`; siempre se devuelve en la respuesta. El id se propaga con `AsyncLocalStorage` (`core/http/contexto.ts`) a todo log de la petición (via `mixin` del logger) y a `evento`/`auditoria`. Esquema fijo:

| Campo | Contenido |
|---|---|
| `time`, `level`, `msg` | ISO 8601 UTC · `error\|warn\|info\|debug` (etiqueta, no número) · texto corto en español |
| `servicio`, `version`, `entorno` | `api` \| `bot` · versión del `package.json` · `NODE_ENV` |
| `req_id`, `usuario_id` | del contexto; ausentes fuera de una petición (jobs llevan `job_id` y `job`) |
| `metodo`, `ruta`, `status`, `duracion_ms`, `ip` | solo en el log de fin de petición; `ruta` es el patrón (`/api/tickets/:id`), no la URL |
| `err` | `{ type, message, stack }` (serializador estándar de pino); `stack` solo en `level = error` |

Niveles: `error/warn/info` en producción, `debug` en desarrollo (`LOG_LEVEL` manda si está definido). Fin de petición: 5xx → `error`, 4xx → `warn`, resto → `info`. `redact` (valor `[Redactado]`) de `password`, `contrasena`, `cookie`, `set-cookie`, `authorization`, `token`, `codigo` (vinculación) en cualquier nivel del objeto registrado. **Nunca** se registra contenido de mensajes, notas ni archivos: solo ids. `pino-pretty` solo con `NODE_ENV=development` (transport). Se registran arranque (`puerto`, `version`, `entorno`) y apagado, y para cada job de pg-boss inicio, fin (con `duracion_ms`) y error, con `job_id`.

**Almacenamiento de logs**: stdout → Docker (`json-file`). En producción (Fase 9): **Grafana Alloy** (`loki.source.docker`, recolecta todos los contenedores del Compose) → **Loki** (`retention_period: 30d`, compactor con borrado automático, datos en `/srv/data/zydesk/loki`) → **Grafana** (búsqueda por `req_id`, `usuario_id`, `level`; regla de alerta "≥ 5 `level=error` en 5 min" con punto de contacto Telegram usando el mismo bot) en un subdominio detrás de **Cloudflare Access**. Alternativa simple documentada en `despliegue.md`: cron diario en el host `docker compose logs --since 24h api bot | gzip > /srv/data/zydesk/logs/AAAA-MM-DD.json.gz` + `find … -mtime +30 -delete`; se busca con `zgrep`.

**Procesos**: API y bot escriben; pg-boss ejecuta `mantencion.limpiar` a las **03:00 America/Santiago** (`0 3 * * *`): `SELECT limpiar_auditoria()` y `DELETE FROM sesion WHERE expira_en < now()`; Loki aplica su retención por su cuenta.

**Inmutabilidad**: dos roles de Postgres. `zydesk_owner` es dueño del esquema y ejecuta las migraciones (URL usada solo por el comando de migración, no por el proceso). `zydesk_app` es el rol del proceso: sobre `evento` y `auditoria` tiene **solo `SELECT, INSERT`** (sin `UPDATE`/`DELETE`; en el resto de tablas, CRUD normal). La limpieza usa una **función `SECURITY DEFINER`** creada por la migración y propiedad de `zydesk_owner`: `limpiar_auditoria()` sin parámetros, `DELETE FROM auditoria WHERE creado_en < now() - interval '1 year'`, `GRANT EXECUTE … TO zydesk_app`. Se elige sobre un rol `zydesk_mantencion` porque no exige una segunda credencial ni un segundo pool en el proceso: el umbral queda fijo en SQL y la app no puede borrar nada más. Un test de integración verifica que `UPDATE`/`DELETE` sobre `evento` y `auditoria` con `zydesk_app` fallan con `permission denied`.

**Retenciones**: `evento` permanente (es el historial exigido por la spec y no contiene IPs). `auditoria` 1 año: suficiente para investigar un incidente o revisar accesos, y acotado porque `ip` y `user_agent` son datos personales (minimización). Logs 30 días: solo sirven para diagnosticar; conservarlos más solo acumula datos personales sin uso.

## Fases

- **Fase 0**: pino + `req_id` + esquema de campos + `redact` + logs de arranque/apagado (sin BD de auditoría).
- **Fase 1**: `evento`, `auditoria`, roles `zydesk_owner`/`zydesk_app` y permisos, `limpiar_auditoria()`, job `mantencion.limpiar`, pantalla Equipo → "Ingresos".
- **Fase 9**: Alloy + Loki + Grafana + Cloudflare Access + alertas a Telegram (o la alternativa con cron).

## Consecuencias

- Un `req_id` une log técnico, `evento` y `auditoria`: dado un error en Grafana se llega a lo que la app escribió en BD y viceversa.
- ADR 0013 cambia en un punto: los ingresos se ven 1 año (no 90 días) y no existe `intento_ingreso`. El bloqueo por cuenta consulta `auditoria`; el índice sobre `detalle->>'correo'` mantiene esa consulta barata.
- Dos credenciales de BD (owner y app) en `.env` de producción; en desarrollo un `init.sql` del Compose crea ambos roles.
- Sin Loki hasta la Fase 9, `docker compose logs` + `grep req_id` es la herramienta de diagnóstico; el esquema fijo garantiza que las consultas escritas ahora sigan valiendo en Grafana.
