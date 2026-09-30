# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Unreleased]

### Añadido

- Fase 1 (base): base de datos con migraciones y roles (`zydesk_owner`, `zydesk_app`); autenticación con sesiones endurecidas (argon2id, límites de intentos, cambio obligatorio de contraseña, sesiones activas, protección CSRF); términos de uso y privacidad (borrador); usuarios, departamentos con horarios y feriados, clientes (contactos, bolsa de horas, tarifas), categorías con plazos, numeración y marca; motor de horas hábiles y `POST /api/plazos/calcular`; auditoría y registro de ingresos; tarea programada de mantención (pg-boss); OpenAPI en `/api/docs` y `docs/api/openapi.json`; semillas de desarrollo; pantallas de Ingreso, Clientes, Configuración y Perfil; navegación móvil con acceso "Más" (ADR 0019); manuales de administración y de primeros pasos, guía de la API y README.
- Fase 0: andamiaje del monorepo, API `/api/salud` con logs estructurados y `req_id`, web con layout y sistema visual.

### Pendientes para la guía de despliegue (Fase 9)

- El rol `zydesk_app` necesita `GRANT CREATE ON DATABASE <base> TO zydesk_app` para que pg-boss pueda crear su esquema al arrancar (en desarrollo lo hace `docker/postgres-init/01-roles.sql`).
- `ua-parser-js` está fijado en la serie 1.x (`^1.0.41`, en `apps/web`) por licencia: la 2.x es AGPL. No actualizar a 2.x sin decidirlo.
- Los textos de `docs/legal/` son borradores con marcadores; deben ser revisados antes de cargar datos reales.
- Verificar los feriados de cada año nuevo contra el listado oficial (ver manual de administración, sección 6).
