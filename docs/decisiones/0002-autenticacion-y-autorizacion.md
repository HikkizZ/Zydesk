# ADR 0002 — Autenticación y autorización

**Estado**: sustituida parcialmente por ADR 0013 (identidad Microsoft, recuperación por correo, duración de sesión) · 2026-09-29

## Contexto

Ingreso con cuenta Microsoft de la organización (solo identidad) o correo + contraseña; "mantener sesión"; recuperar contraseña; sin registro abierto (Administración crea las cuentas). Cuatro roles con la matriz de permisos de la spec (sección 2). El bot futuro debe actuar **en nombre de una persona** contra la API.

## Opciones consideradas

**Sesión**
1. JWT de acceso (corto) + refresh token en cookie httpOnly — estándar, pero exige rotación de refresh, lista de revocación y dos flujos de expiración. Para 10 usuarios no aporta nada frente a una sesión en BD.
2. **Sesión opaca en BD** (`sesion(id, token_hash, usuario_id, origen, expira_en, ultimo_uso)`) con el token en cookie httpOnly `SameSite=Lax` — revocación inmediata (desactivar usuario = borrar sesiones), un solo concepto, y el mismo mecanismo sirve para el bot.

**Identidad Microsoft**
- `openid-client` con Authorization Code + PKCE contra Entra ID (tenant único `[TENANT_ID]`). Solo scopes `openid profile email`. La app **nunca** pide permisos de correo.

## Decisión

- **Sesión opaca en Postgres, cookie httpOnly.** Duración 12 h; con "mantener sesión" 30 días (renovación deslizante al usarla). `origen ∈ {web, bot}`. Cierre de sesión = borrar fila.
- **Contraseña**: argon2id. Recuperación: token de un solo uso (hash en BD, 1 h) enviado por correo desde `[CORREO DE AVISOS]`.
- **Microsoft**: al volver del callback se busca el usuario por `correo` (claim `preferred_username`/`email`) y, si existe y está activo, se guarda `microsoft_oid` y se crea sesión. Si no existe → "Tu cuenta no está habilitada; pide a Administración que la cree". **No se crean cuentas automáticamente.** Un usuario puede tener contraseña, Microsoft, o ambos.
- **RBAC**: `packages/shared/permisos.ts` define `Permiso` (enum) y la matriz `PERMISOS_POR_ROL: Record<Rol, Permiso[]>`, copia literal de la tabla de la spec:

| Permiso | admin | coordinacion | tecnico | lectura |
|---|:-:|:-:|:-:|:-:|
| `tickets.editar` (crear/editar, seguimiento, notas, asignar, convertir en OT, tareas, horas propias) | ✓ | ✓ | ✓ | – |
| `ots.aprobar` (registrar aprobación de cotización / aprobar OT interna) | ✓ | ✓ | – | – |
| `ots.cerrar` | ✓ | ✓ | – | – |
| `ots.facturar` (marcar facturada) | ✓ | ✓ | – | – |
| `reportes.ver` (reportes, montos, horas de cualquier persona) | ✓ | ✓ | – | ✓ |
| `config.editar` (equipo, departamentos, categorías, tarifas, plantillas) | ✓ | – | – | – |

  Todo rol autenticado puede **leer** tickets, OT, clientes y su propio registro de horas. Middleware `requiere(permiso)` en la API; el front usa la misma matriz para ocultar acciones (nunca como única barrera).
- **Bot (futuro)**: la vinculación (ADR 0008) crea una `sesion` con `origen = bot` y sin expiración deslizante; el bot envía ese token como `Authorization: Bearer`. Así el bot pasa por las mismas rutas, permisos e historial que la web, con el autor correcto.

## Consecuencias

- Sin JWT no hay claims que verificar en el front: la web pide `GET /api/yo` al cargar y cachea rol y permisos.
- CSRF: cookie `SameSite=Lax` + la API rechaza mutaciones sin cabecera `X-Requested-With` (barato y suficiente al no haber terceros).
- Entra ID necesita un registro de aplicación con redirect URI `https://[DOMINIO]/api/auth/microsoft/callback`; en staging con Cloudflare Tunnel el dominio es público, así que funciona sin túneles adicionales.
- La cookie exige HTTPS en producción (`Secure`); Cloudflare termina TLS y la API confía en `X-Forwarded-Proto` (`trust proxy`).
- Deuda aceptada: no hay 2FA propio; quien lo necesite entra por Microsoft, que ya lo impone.
