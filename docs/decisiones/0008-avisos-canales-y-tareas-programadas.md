# ADR 0008 — Avisos, canales (app / correo / Telegram futuro) y tareas programadas

**Estado**: sustituida parcialmente por ADR 0013 (canal `correo` sin implementar, resumen diario por Telegram, bot en Fase 6) · 2026-09-29 · precisada por ADR 0021 (Fase 2)

## Contexto

Centro de avisos en la app; preferencias por persona × evento × canal; menciones con `@`; resumen diario 08:30 L-V; avisos de vencimiento 24 h antes y al vencer; archivado de cerrados a 7 días. Telegram llegará después y debe (a) no tocar la lógica de negocio, (b) vincularse a la cuenta con un código de un solo uso y (c) escribir siempre a través de la API. El servidor no expone puertos; la web entra por Cloudflare Tunnel.

## Opciones consideradas

**Ejecución de trabajos**
- `node-cron` en proceso: mínimo, pero sin persistencia ni reintentos; un reinicio a las 08:29 pierde el resumen, y un SMTP caído pierde correos.
- **pg-boss**: cola y cron sobre la misma base Postgres, en el mismo proceso de la API. Reintentos con backoff, jobs con clave única (`singletonKey`) que evitan duplicados, sin Redis.

**Telegram**
- Webhook: exige una ruta pública por el túnel y un secreto; funciona, pero es una superficie más.
- **Long polling** (grammY por defecto): solo conexiones salientes; encaja con el servidor sin puertos entrantes.

## Decisión

**Arquitectura de avisos** (`apps/api/src/avisos/`):
1. Los servicios (ADR 0003) publican **eventos de dominio** tipados (`shared/eventos.ts`) tras el commit: `ticket.asignado`, `tarea.asignada`, `mencion`, `ticket.vence_pronto`, `ticket.vencio`, `ticket.estado_cambiado`, `ticket.seguimiento_nuevo`, `cotizacion.respondida`, `ot.por_facturar`. Un `EventEmitter` tipado en proceso.
2. El **despachador** escucha cada evento, resuelve destinatarios (responsables, seguidores, mencionados, aprobador), consulta `preferencia_aviso(usuario_id, evento, canal, activo)` y crea una fila `aviso` por destinatario (canal `app` siempre se guarda; es lo que muestra el centro de avisos). Para cada canal activo encola un job `aviso.enviar` con `{aviso_id, canal}`.
3. **Canales** implementan una interfaz mínima `Canal { nombre; enviar(aviso, usuario): Promise<void> }`. Hoy: `CanalApp` (no-op, la fila ya existe), `CanalCorreo` (nodemailer). Mañana: `CanalTelegram` (llama a la Bot API `sendMessage` con `usuario.telegram_chat_id`). Agregar un canal = una clase + un valor en el enum `Canal` de `shared` + una columna de preferencia en la UI. **Ningún servicio de negocio conoce los canales.**
4. Preferencias por defecto: las de la pantalla Avisos del diseño (todo en app; correo salvo "cambia estado / nuevo seguimiento de un ticket que sigo"). Idempotencia: `aviso` tiene `clave` única (`vence_pronto:ticket:123`) para no avisar dos veces el mismo vencimiento.

**Menciones**: el redactor inserta `@Nombre Apellido` con un selector; el front envía `mencionados: usuario_id[]` junto al texto. La API guarda `mencion(mensaje_id, usuario_id)` y publica `mencion`. No se parsea texto libre en el servidor.

**Tareas programadas** con pg-boss (`schedule` con cron y zona `America/Santiago`), en el mismo proceso de la API (`worker` se activa con `EJECUTAR_JOBS=true`, por si algún día se separa):
| Job | Cron | Hace |
|---|---|---|
| `tickets.archivar` | `0 3 * * *` | `archivado_en = now()` donde `cerrado_en < now() − 7 días`. |
| `tickets.vencimientos` | `*/30 * * * *` | Publica `vence_pronto` (24 h de reloj antes de `fecha_limite`; ver preguntas abiertas B2) y `vencio`. |
| `avisos.resumen_diario` | `30 8 * * 1-5` | Correo por persona con vencen hoy / por aprobar / menciones sin leer / tareas. |
| `archivos.limpiar_huerfanos` | `0 4 * * *` | Borra subidas sin entidad de más de 24 h (ADR 0009). |
| `aviso.enviar` | cola | Envía por canal; 3 reintentos con backoff; error final queda en `aviso.error`. |

**Bot de Telegram (futuro, `apps/bot`)**: grammY con long polling. Vinculación: en Avisos → "Vincular Telegram" la app genera `codigo_vinculo(codigo 6 caracteres, usuario_id, expira 10 min, usado)`; la persona envía `/vincular ABC123` al bot; el bot llama `POST /api/bot/vincular {codigo, chat_id}` autenticándose con `BOT_API_KEY` (secreto compartido); la API marca el código usado, guarda `telegram_chat_id` y devuelve un token de `sesion` con `origen = bot` (ADR 0002) que el bot guarda cifrado por `chat_id`. Desde entonces cada comando (`/hoy`, `/mis`, `/ticket 1048`, responder un aviso, aprobar) es una llamada normal a la API **como ese usuario**: mismos permisos, mismo historial, mismos avisos. El bot no tiene acceso a la BD ni lógica de negocio propia. Desvincular = borrar la sesión.

## Consecuencias

- pg-boss crea su esquema `pgboss` en la misma BD; se incluye en el respaldo y no requiere infraestructura extra.
- Telegram se agrega sin tocar servicios: canal nuevo + módulo `bot` en la API + app `bot`.
- Correo depende de `[CORREO DE AVISOS]` vía SMTP (`SMTP_HOST/USER/PASS`). Si la casilla es de Microsoft 365, hay que habilitar SMTP AUTH en el tenant (riesgo señalado en preguntas abiertas). El dominio `zytech.dev` del VPS tiene SPF `-all`: **no** se envía desde ese dominio.
