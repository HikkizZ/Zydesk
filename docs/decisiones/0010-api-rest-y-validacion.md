# ADR 0010 — API REST: rutas, paginación, errores, validación y OpenAPI

**Estado**: aceptada · 2026-09-29

## Contexto

Una sola API para la web y el bot futuro. Debe ser predecible, validar con los mismos esquemas Zod que el front y documentarse sin mantener un archivo OpenAPI a mano.

## Opciones consideradas

- REST con JSON — lo que el equipo domina; suficiente para 16 pantallas.
- tRPC — tipado extremo a extremo, pero acopla el bot y la documentación al cliente TS; sin OpenAPI natural.
- GraphQL — sobredimensionado.

## Decisión

**Convenciones**
- Prefijo `/api` sin versión (app interna; si algún día hace falta, `/api/v2` para rutas nuevas). Recursos en plural y en español, ids numéricos: `/api/tickets/:id`, `/api/ots/:id`, `/api/cotizaciones/:id`, `/api/clientes/:id`, `/api/usuarios/:id`, `/api/archivos/:id`, `/api/avisos`, `/api/horas`, `/api/reportes/...`, `/api/config/...`, `/api/yo`.
- Subrecursos: `/api/tickets/:id/mensajes`, `/tareas`, `/actividad`, `/responsables`, `/seguidores`, `/archivos`; `/api/ots/:id/cotizaciones`, `/aprobacion`.
- **Transiciones como acciones** (`POST`, verbo en infinitivo): `/api/tickets/:id/cambiar-estado`, `/api/tickets/:id/convertir-en-ot`, `/api/ots/:id/cerrar`, `/api/ots/:id/cancelar`, `/api/ots/:id/facturar`, `/api/cotizaciones/:id/enviar`, `/duplicar`, `/descargar.xlsx`, `/descargar.pdf`, `/api/mensajes/:id/copiar-al-ticket`. Evita `PATCH` con semántica oculta.
- Edición de campos simples: `PATCH /api/tickets/:id` con cuerpo parcial (Zod `.partial()`); el servicio genera un Evento por campo (ADR 0003).
- **Paginación por offset**: `?pagina=1&por_pagina=50` (máx. 200) → `{ datos, total, pagina, por_pagina }`. Filtros como query planos (`?estado=en_curso&responsable_id=3&solo_mios=true&q=texto`); orden `?orden=-actualizado_en`. Con miles de filas al año, offset es suficiente; el Kanban y "Mi día" piden sin paginar (activos, acotados).
- **Fechas** ISO 8601 UTC; `snake_case` en JSON y BD (menos mapeos mentales; el front lo consume tal cual).
- **Errores**: siempre `{ error: { codigo, mensaje, detalles? } }`. Códigos en `shared/errores.ts`: `VALIDACION` (400, `detalles` = issues de Zod aplanados por campo), `NO_AUTENTICADO` (401), `SIN_PERMISO` (403), `NO_ENCONTRADO` (404), `CONFLICTO` (409, p. ej. `OT_ABIERTA`, `TRANSICION_INVALIDA`, con `detalles` de negocio), `INTERNO` (500, sin detalles). Un único `errorHandler` de Express; los servicios lanzan `ErrorApp(codigo, mensaje, detalles)`.
- **Validación**: cada ruta declara `{ params?, query?, body? }` con esquemas de `packages/shared`; el middleware `validar()` parsea y reemplaza `req` con los datos tipados. Los mismos esquemas alimentan `zodResolver` en React Hook Form. Coerción de query (`z.coerce.number()`) vive en los esquemas de query, no en el front.
- **OpenAPI**: `zod-openapi` registra ruta + esquemas al definirlas (helper `ruta({ metodo, path, permiso, esquemas, handler })`) y `createDocument()` genera `openapi.json` en el arranque. Se sirve con **Scalar** en `/api/docs` (solo con sesión de rol `admin`) y se exporta a `docs/api/openapi.json` con `npm run api:openapi` para versionarlo. Sin este helper una ruta no existe, así que la documentación no puede quedar desactualizada.
- **Seguridad básica**: `helmet`, `express-rate-limit` en `/api/auth/*`, `trust proxy` para el túnel, límite de JSON 1 MB (los archivos van por multipart, ADR 0009).

## Consecuencias

- El bot y cualquier script interno usan la misma API documentada.
- `snake_case` en TS del front puede chocar con hábitos; se acepta a cambio de no mantener mapeadores.
- El helper `ruta()` es la única abstracción "extra" de la API y se justifica porque unifica validación, permiso y documentación en un punto.
