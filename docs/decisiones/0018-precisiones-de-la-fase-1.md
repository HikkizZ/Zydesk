# ADR 0018 — Precisiones surgidas al especificar la Fase 1

**Estado**: aceptada · 2026-09-30 · precisa a ADR 0002, 0009, 0010, 0012, 0013 y 0017 (no cambia sus decisiones de fondo)

## Contexto

Al escribir `docs/specs/fase-1.md` aparecieron detalles que las ADR dejaban abiertos o en los que dos ADR no coincidían. Se registran aquí para que las ADR y la spec digan lo mismo.

## Decisión

1. **Límite de intentos de ingreso** (precisa ADR 0010): no se usa `express-rate-limit`. Los límites de ADR 0013 (20 por IP / 15 min, 5 fallos por cuenta con bloqueo creciente) se calculan sobre la tabla `auditoria` (ADR 0017). Un solo mecanismo, persistente ante reinicios.
2. **Cookie de sesión** (precisa ADR 0002 y 0013): nombre `__Host-sesion` solo en producción (el prefijo exige `Secure` y HTTPS); `sesion` en desarrollo y tests.
3. **Protección CSRF** (precisa ADR 0002): toda mutación con cookie exige la cabecera `X-Requested-With: Zydesk` (valor exacto). Las peticiones con `Authorization: Bearer` (bot) no la requieren.
4. **Acciones de auditoría nuevas** (precisa ADR 0017): `usuario_reactivado` y `terminos_aceptados`. `evento.entidad_id` es `text` (admite ids numéricos y claves como las de `contador`).
5. **Logo de marca** (precisa ADR 0009): se guarda en `configuracion` como base64 (≤ 200 KB), no en `Storage`, porque se necesita en Fase 1 y el almacenamiento de archivos llega en Fase 2. Nombre y logo son públicos para la pantalla de ingreso.
6. **Términos y privacidad**: una sola aceptación cubre ambos documentos. La versión vigente se lee del front matter de `docs/legal/terminos-de-uso.md`; subirla obliga a aceptar de nuevo. Mientras falte la contraseña nueva o la aceptación, la API responde 403 (`CONTRASENA_PENDIENTE` / `TERMINOS_PENDIENTES`), no solo la interfaz.
7. **Ruta de los manuales** (precisa ADR 0012): `docs/manuales/usuario/` y `docs/manuales/administracion.md`, como en el PLAN.
8. **Feriados**: la semilla `feriados-cl.json` se valida contra la API pública de Boostr (`https://api.boostr.cl/holidays/{año}.json`). No es una dependencia en tiempo de ejecución; la tabla sigue siendo editable por Administración (ADR 0005).
9. **Sesiones activas**: el dispositivo se muestra con un nombre legible obtenido con `ua-parser-js` en la web.
10. **Nombres de campos en TypeScript** (precisa ADR 0010): las propiedades de las entidades TypeORM, los esquemas Zod y los DTOs usan `snake_case`, igual que la columna y el JSON (`creado_en`, `entidad_id`); así una entidad se devuelve sin capa de mapeo. `camelCase` queda para variables, funciones, métodos y tipos.

## Consecuencias

- Sin dependencias nuevas en la API para límites; `ua-parser-js` se agrega solo a `apps/web`.
- Las ADR citadas mantienen su texto; ante una diferencia, manda esta ADR.
