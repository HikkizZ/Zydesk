# API de Zydesk

La API vive bajo `/api` (en desarrollo, `http://localhost:3010/api`). La referencia completa de rutas está en [`openapi.json`](openapi.json) y, con sesión de Administración, en `/api/docs`. **`openapi.json` es generado: no se edita a mano.**

## Autenticarse con curl

La sesión es una cookie opaca (`sesion` en desarrollo, `__Host-sesion` en producción). Las peticiones que modifican datos (`POST`, `PUT`, `PATCH`, `DELETE`) exigen además la cabecera `X-Requested-With: Zydesk`; sin ella responden `403 CSRF`.

```bash
# 1. Ingresar y guardar la cookie en un archivo
curl -i -c cookies.txt -X POST http://localhost:3010/api/auth/ingresar \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: Zydesk" \
  -d '{"correo":"usuario@ejemplo.cl","contrasena":"<tu contraseña>"}'

# 2. Consultar con la cookie
curl -b cookies.txt http://localhost:3010/api/yo

# 3. Modificar (con la cabecera)
curl -b cookies.txt -X POST http://localhost:3010/api/auth/salir -H "X-Requested-With: Zydesk"
```

Si la cuenta tiene que cambiar la contraseña o aceptar los términos, el resto de la API responde `403` (`CONTRASENA_PENDIENTE` o `TERMINOS_PENDIENTES`) hasta que lo haga (`POST /api/yo/cambiar-contrasena`, `POST /api/yo/aceptar-terminos`). Las sesiones con `Authorization: Bearer <token>` (reservadas para el bot) no necesitan la cabecera CSRF.

## Convenciones (ADR 0010)

- Recursos en plural y en español; ids numéricos. Transiciones como acciones `POST` con verbo en infinitivo (`/desactivar`, `/reactivar`, `/restablecer-contrasena`).
- JSON en `snake_case`; fechas en ISO 8601 UTC.
- Paginación por offset en los listados que la usan: `?pagina=1&por_pagina=50` (máximo 200) y respuesta `{ datos, total, pagina, por_pagina }`.
- Errores siempre con la forma `{ "error": { "codigo": "...", "mensaje": "...", "detalles": {} } }`. Códigos principales: `VALIDACION` (400, `detalles.fieldErrors`), `NO_AUTENTICADO` (401), `SIN_PERMISO` (403), `CSRF` (403), `NO_ENCONTRADO` (404), `CONFLICTO` (409), `INGRESO_BLOQUEADO` (429) e `INTERNO` (500).
- Cada ruta declara su permiso (`sesion`, `tickets.editar`, `config.editar`, etc.); aparece en su descripción en OpenAPI.
- El ingreso se limita por IP (20 intentos por 15 minutos) y por cuenta (5 fallos seguidos).

## Tickets, archivos y correos

Subir archivos es una petición `multipart/form-data` con el campo `archivos` (de 1 a 10 archivos, hasta 20 MB cada uno). Los archivos quedan **pendientes** (sin ticket) hasta que se usan en un ticket o un mensaje, o se eliminan solos a las 24 horas.

```bash
# Subir (responde 201 con [{ id, categoria, nombre_original, ... }])
curl -b cookies.txt -H "X-Requested-With: Zydesk" \
  -F "archivos=@apps/api/test/fixtures/correo.eml" http://localhost:3010/api/archivos

# Leer el correo subido (no guarda nada)
curl -b cookies.txt -H "X-Requested-With: Zydesk" -H "Content-Type: application/json" \
  -d '{"archivo_id":1}' http://localhost:3010/api/correos/parsear

# Crear un ticket usando ese correo (archivo_id pendiente del mismo usuario; los campos opcionales se envían como null)
curl -b cookies.txt -H "X-Requested-With: Zydesk" -H "Content-Type: application/json" \
  -d '{"asunto":"Error al emitir facturas","descripcion":null,"cliente_id":null,"solicitante_nombre":null,"solicitante_correo":null,"origen":"externo","prioridad":"media","categoria_id":null,"inicio_planificado":null,"fecha_limite":null,"horas_estimadas":null,"correo":{"archivo_id":1,"adjuntos_indices":[0]}}' \
  http://localhost:3010/api/tickets

# Cambiar estado (en_espera exige espera_de; descartado exige motivo; duplicado exige duplicado_de_id)
curl -b cookies.txt -H "X-Requested-With: Zydesk" -H "Content-Type: application/json" \
  -d '{"estado":"en_espera","espera_de":"cliente"}' http://localhost:3010/api/tickets/1/cambiar-estado

# Descargar un archivo (la cookie basta; no necesita la cabecera)
curl -b cookies.txt -OJ http://localhost:3010/api/archivos/1
```

Errores propios de esta parte: `ARCHIVO_NO_PERMITIDO` (400), `ARCHIVO_MUY_GRANDE` (413), `DEMASIADOS_ARCHIVOS` (400), `CORREO_ILEGIBLE` (400), `TRANSICION_INVALIDA` (409), `TICKET_CERRADO` (409) y `OT_ABIERTA` (409, reservado para la Fase 3). Las rutas de tickets, mensajes, tareas y archivos están en `openapi.json`.

## Regenerar `openapi.json`

```bash
npm run api:openapi
```

Escribe `docs/api/openapi.json` a partir de las rutas declaradas con `ruta()`. Al repetir el comando sin cambios en las rutas, el archivo no cambia. Hay que regenerarlo y versionarlo cada vez que se agrega o cambia una ruta o un esquema compartido.
