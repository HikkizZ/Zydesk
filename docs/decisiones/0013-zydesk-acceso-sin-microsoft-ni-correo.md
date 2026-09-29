# ADR 0013 — Zydesk: nombre, dominio y acceso sin Microsoft ni correo saliente

**Estado**: aceptada · 2026-09-29 · sustituye parcialmente a ADR 0002 (identidad Microsoft, recuperación por correo, duración de sesión) y a ADR 0008 (canal `correo`, resumen diario, fase del bot) · sustituida parcialmente por ADR 0017 (tabla `intento_ingreso` y retención de 90 días de los ingresos → `auditoria`, 1 año)

## Contexto

La organización **no permite registrar aplicaciones en Microsoft Entra**. Caen con ello el ingreso OIDC, el 2FA "heredado" de Microsoft y el correo saliente desde una casilla de la organización (SMTP AUTH). El dominio `zytech.dev` no envía correo (SPF `-all`). Sin Microsoft, la app pasa a ser la única barrera de acceso y hay que endurecer contraseña y sesiones. El usuario decidió (2026-09-29) el nombre definitivo y el dominio.

## Decisión

**Identidad**: la app se llama **Zydesk** y se publica en `desk.zytech.dev`. Nombre visible y logo son configurables en Administración → Configuración (claves `nombre_app`, `logo`); "Zydesk" es el valor por defecto y el nombre técnico (paquetes, `/srv/data/zydesk/`, título de la documentación). `[TENANT_ID]` deja de existir.

**Ingreso**: solo correo + contraseña (argon2id, ADR 0002). Se eliminan `openid-client`, la ruta `/api/auth/microsoft/*` y la columna `microsoft_oid`. Administración sigue creando las cuentas.

**Recuperar contraseña sin correo**: Administración la restablece desde Equipo (genera una contraseña temporal que se muestra una sola vez) y marca `usuario.debe_cambiar_contrasena = true`; al ingresar, la app solo permite ir a "Cambiar contraseña" hasta que la cambie. Se elimina el token de recuperación por correo.

**Sin correo saliente en v1**: `CanalCorreo` no se implementa; el valor `correo` permanece en el enum `Canal` y la interfaz `Canal` de ADR 0008 queda tal cual, con las preferencias de correo ocultas en la UI. Si algún día hay un proveedor transaccional con subdominio propio, se agrega la clase sin tocar la lógica. `nodemailer` no se instala en v1. El **resumen diario** (`avisos.resumen_diario`) se envía por Telegram a quien tenga la cuenta vinculada; los avisos van por `app` y `telegram`.

**Bot de Telegram en la Fase 6**, junto con los avisos (antes Fase 8): es el único canal que llega al celular. Su diseño no cambia (ADR 0008). El bot llama a la API por la red interna de Docker (`http://api:3000`), nunca por `desk.zytech.dev`, para no depender del túnel ni de lo que se ponga delante del dominio (ver segundo factor).

**Seguridad de sesiones** (refuerza ADR 0002):
- Token de 256 bits (`crypto.randomBytes(32)`, base64url). En BD solo `sha256(token)`; el token viaja únicamente en la cookie.
- Cookie `__Host-sesion`: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, sin `Domain`. Sigue vigente la cabecera `X-Requested-With` para mutaciones.
- Al ingresar se crea **siempre** una sesión nueva (anti fijación); nunca se reutiliza un id previo.
- Expiración por **inactividad** (12 h; 30 días con "mantener sesión", deslizante) **y** máxima **absoluta** desde la creación (7 días; 90 con "mantener sesión"). Columnas `sesion.creada_en`, `ultimo_uso`.
- Se borran **todas** las sesiones del usuario (web y bot) al cambiar contraseña, rol o al desactivarlo.
- **Limitación de intentos**: tabla `intento_ingreso(correo, ip, exito, user_agent, creado_en)`. Por IP: máx. 20 intentos / 15 min. Por cuenta: 5 fallos seguidos → bloqueo temporal de 15 min, que se duplica en cada bloqueo sucesivo (tope 24 h) y se reinicia con un ingreso exitoso. Respuesta 429 `INGRESO_BLOQUEADO` sin revelar si la cuenta existe.
- **IP real**: la API toma `CF-Connecting-IP` (lo pone `cloudflared`; nginx la reenvía) y, si falta, `X-Forwarded-For` con `trust proxy` igual al número de saltos internos (`PROXY_SALTOS`, variable de entorno). Sin esa cabecera todo llegaría como la IP de nginx y el límite bloquearía a todos.
- **Registro de ingresos**: la misma tabla `intento_ingreso` sirve de bitácora (exitosos y fallidos). Administración la ve en Equipo → "Ingresos" (últimos 90 días; se purga con un job nocturno).
- **Sesiones activas**: pantalla en el perfil con origen, user agent, IP, último uso y botón "Cerrar" por sesión y "Cerrar las demás". `GET/DELETE /api/yo/sesiones`.
- **Contraseñas**: mínimo 10 caracteres, distinta del correo, rechazo de una lista corta de contraseñas comunes; sin reglas de composición. Se valida en `shared` (mismo esquema Zod en API y formulario).

**Segundo factor — PENDIENTE de decisión del usuario.** Dos opciones:
1. **Cloudflare Access (Zero Trust)** delante de `desk.zytech.dev`: código por correo (OTP) o proveedor de identidad; política "correos de la organización". Sin código en la app; gratis hasta 50 usuarios. Exige que el bot y cualquier integración usen la red interna (ya decidido arriba).
2. **TOTP en la app** (`otpauth`): opcional para todos y obligatorio para Administración; secreto cifrado en `usuario`, códigos de respaldo, paso extra en el ingreso.

Recomendación del arquitecto: **opción 1**. Cero código, cubre también la API pública y cualquier pantalla futura, y el equipo ya tiene correo corporativo para el OTP. La opción 2 queda como plan B si Access no puede usarse.

## Consecuencias

- Menos dependencias y ninguna configuración fuera del control del desarrollador; el riesgo 5 de preguntas abiertas desaparece.
- Restablecer contraseñas pasa a ser una tarea de Administración (manual de administración, ADR 0012).
- Sin correo, quien no vincule Telegram solo ve avisos al abrir la app: la vinculación se sugiere en el primer ingreso.
- Todo lo que 0002 y 0008 no mencionado aquí (RBAC, sesión opaca en BD, despachador, pg-boss, vinculación del bot) sigue vigente.
