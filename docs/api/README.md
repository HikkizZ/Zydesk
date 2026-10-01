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

Errores propios de esta parte: `ARCHIVO_NO_PERMITIDO` (400), `ARCHIVO_MUY_GRANDE` (413), `DEMASIADOS_ARCHIVOS` (400), `CORREO_ILEGIBLE` (400), `TRANSICION_INVALIDA` (409), `TICKET_CERRADO` (409) y `OT_ABIERTA` (409, `detalles.ots` con id, código y etapa de las OT abiertas del ticket; bloquea Resuelto, Descartado y Duplicado). Las rutas de tickets, mensajes, tareas y archivos están en `openapi.json`.

## Órdenes de trabajo

Una OT nace de un ticket (`POST /api/tickets/:id/convertir-en-ot`) y se opera bajo `/api/ots`. Los permisos: `tickets.editar` para convertir, editar, cambiar etapas simples, tareas, mensajes y archivos; `ots.aprobar` para `/aprobar` y `/aprobacion`; `ots.cerrar` para `/cerrar` y `/cancelar`; `ots.facturar` para `/facturar`. Con `Content-Type: application/json` y la cabecera `X-Requested-With: Zydesk` en toda mutación. En Windows, envía los cuerpos con acentos desde un archivo UTF-8 (`--data-binary @cuerpo.json`).

```bash
# Convertir un ticket en OT (201 con la OT en borrador; las tareas pendientes del ticket pasan a ella)
curl -b cookies.txt -H "X-Requested-With: Zydesk" -H "Content-Type: application/json"   -d '{"tipo":"facturable"}' http://localhost:3010/api/tickets/1/convertir-en-ot

# Etapas sin permiso especial: borrador y en_ejecucion (cotizada se alcanza al enviar una cotización)
curl -b cookies.txt -H "X-Requested-With: Zydesk" -H "Content-Type: application/json"   -d '{"etapa":"en_ejecucion"}' http://localhost:3010/api/ots/1/cambiar-etapa

# Cerrar resolviendo el ticket (409 OT_ABIERTA si el ticket tiene otras OT abiertas)
curl -b cookies.txt -H "X-Requested-With: Zydesk" -H "Content-Type: application/json"   -d '{"resolvio_ticket":true,"resumen":"Trabajo terminado y probado"}' http://localhost:3010/api/ots/1/cerrar

# Cerrar sin resolver: el ticket sigue abierto (accion: en_curso | en_espera | nueva_ot)
curl -b cookies.txt -H "X-Requested-With: Zydesk" -H "Content-Type: application/json"   -d '{"resolvio_ticket":false,"resumen":"Falta el repuesto","siguiente":{"accion":"en_espera","responsable_id":2,"espera_de":"repuesto"}}'   http://localhost:3010/api/ots/1/cerrar

# Marcar facturada (solo una OT facturable cerrada y por facturar)
curl -b cookies.txt -H "X-Requested-With: Zydesk" -H "Content-Type: application/json"   -d '{"n_factura":"F-1001"}' http://localhost:3010/api/ots/1/facturar

# Copiar un mensaje de la OT al ticket de origen (una copia por mensaje)
curl -b cookies.txt -H "X-Requested-With: Zydesk" -X POST http://localhost:3010/api/mensajes/1/copiar-al-ticket
```

Otras rutas: `GET /api/ots` (filtros `q`, `ticket_id`, `cliente_id`, `tipo`, `etapa`, `estado_facturacion`, `abiertas`, `responsable_id`, `aprobador_id`), `GET|PATCH /api/ots/:id`, `POST /api/ots/:id/aprobar` (interna), `PUT /api/ots/:id/aprobacion` (aprobación del cliente con respaldo adjunto), `POST /api/ots/:id/cancelar`, `POST /api/ots/:id/archivos`, `GET|POST /api/ots/:id/tareas`, `GET|POST /api/ots/:id/mensajes` y `GET /api/ots/:id/actividad`. Las tareas se editan por `PATCH|DELETE /api/tareas/:id` también en las OT.

Errores propios: `OT_CERRADA` (409, la OT está cerrada o cancelada), `OT_TIPO_BLOQUEADO` (409, el tipo y el cliente solo cambian en Borrador), `MENSAJE_YA_COPIADO` (409) y `TRANSICION_INVALIDA` (409, con `detalles.entidad = 'ot'`).

Un cuerpo JSON mal formado responde `400 VALIDACION` (`detalles.body`).

## Cotizaciones

Una cotización nace de una OT facturable con cliente externo (`POST /api/ots/:id/cotizaciones`) y se opera bajo `/api/cotizaciones`. Su código deriva de la OT (`OT-0218` → `COT-0218`) y se versiona (`version` 1, 2…); la **vigente** es la de mayor versión y es la única que se edita, envía, duplica o elimina. Permisos: `tickets.editar` para toda mutación; cualquier sesión lee, lista y descarga. La API **recalcula los totales** con la función de `shared` y descarta `total`, `neto`, `iva_pct` y `totales` del cuerpo.

```bash
# Crear la v1 en borrador (201; 409 COTIZACION_NO_EDITABLE si ya hay un borrador o una enviada vigente)
curl -b cookies.txt -H "X-Requested-With: Zydesk" -X POST http://localhost:3010/api/ots/1/cotizaciones

# Guardar encabezado y todas las líneas (PUT completo; en UF, valor_uf es obligatorio)
curl -b cookies.txt -H "X-Requested-With: Zydesk" -H "Content-Type: application/json" -X PUT \
  -d '{"contacto_id":1,"fecha_emision":"2026-10-01","validez_dias":30,"moneda":"CLP","valor_uf":null,"aplica_iva":true,"condiciones":"Forma de pago: 30 días.","nota_interna":null,"lineas":[{"tipo":"mano_de_obra","descripcion":"Diagnóstico","cantidad":3,"unidad":"h","precio_unitario":38000,"descuento_pct":0}]}' \
  http://localhost:3010/api/cotizaciones/1

# Importar horas de las tareas (origen: estimadas | reales) o aplicar una plantilla
curl -b cookies.txt -H "X-Requested-With: Zydesk" -H "Content-Type: application/json" -d '{"origen":"estimadas"}' http://localhost:3010/api/cotizaciones/1/importar-horas
curl -b cookies.txt -H "X-Requested-With: Zydesk" -H "Content-Type: application/json" -d '{"plantilla_id":1}' http://localhost:3010/api/cotizaciones/1/aplicar-plantilla

# Marcar como enviada (exige líneas y contacto; la OT pasa a cotizada; la versión enviada anterior queda reemplazada)
curl -b cookies.txt -H "X-Requested-With: Zydesk" -X POST http://localhost:3010/api/cotizaciones/1/enviar

# Duplicar como nueva versión (201; 409 COTIZACION_APROBADA si ya fue aprobada)
curl -b cookies.txt -H "X-Requested-With: Zydesk" -X POST http://localhost:3010/api/cotizaciones/1/duplicar

# Descargar (la cookie basta; attachment "COT-0218_v1.xlsx" o ".pdf", con -BORRADOR si no se envió)
curl -b cookies.txt -OJ http://localhost:3010/api/cotizaciones/1/descargar.xlsx
curl -b cookies.txt -OJ http://localhost:3010/api/cotizaciones/1/descargar.pdf
```

Otras rutas: `GET /api/cotizaciones` (filtros `q`, `estado`, `cliente_id`, `ot_id`, `solo_vigentes`, `orden`), `GET|DELETE /api/cotizaciones/:id` (eliminar solo el borrador vigente), `GET|PUT /api/config/tarifas` (`PUT` con `config.editar`) y `GET|POST /api/config/plantillas-cotizacion`, `PUT /api/config/plantillas-cotizacion/:id`, `PATCH /api/config/plantillas-cotizacion/:id/activo` (mutaciones con `config.editar`). `PUT /api/ots/:id/aprobacion` exige una cotización vigente `enviada` y la deja `aprobada`; `POST /api/ots/:id/cambiar-etapa { "etapa": "borrador" }` desde Cotizada la deja `rechazada`.

Errores propios: `COTIZACION_NO_EDITABLE` (409, no es borrador o no es la vigente), `COTIZACION_APROBADA` (409, lo aprobado está congelado), `COTIZACION_REQUERIDA` (409, la OT necesita una cotización enviada; `detalles.cotizacion`) y `TARIFA_FALTANTE` (409, `detalles.concepto`). Cada descarga deja un `evento` en la OT y una fila `exportacion` en `auditoria`.

## Horas

La planilla semanal vive bajo `/api/horas`. `GET` acepta `semana` (cualquier día; la API la normaliza al lunes; sin ella, la semana actual en Santiago) y `usuario_id` (sin él, la persona de la sesión; otra persona exige `horas.ver_todas`, y la respuesta trae `editable: false`). Las mutaciones exigen `tickets.editar`, registran siempre para la sesión (`usuario_id` del cuerpo se descarta) y solo tocan filas propias. Una fila tiene `ticket_id`, `ot_id` (con `tarea_id` opcional de esa OT) o ninguno de los dos con `descripcion` obligatoria ("Sin ticket"); `horas` entre 0,25 y 24 en pasos de 0,25; `fecha` no posterior a hoy.

```bash
# Planilla de la semana que contiene el 1 de octubre (desde = lunes 28 sep)
curl -b cookies.txt "http://localhost:3010/api/horas?semana=2026-10-01"

# Planilla de otra persona (horas.ver_todas; 403 SIN_PERMISO sin él)
curl -b cookies.txt "http://localhost:3010/api/horas?usuario_id=3&semana=2026-10-01"

# Registrar 1,5 h en una OT contra una tarea (201; 409 CONFLICTO si la celda manual ya existe)
curl -b cookies.txt -H "X-Requested-With: Zydesk" -H "Content-Type: application/json" \
  -d '{"fecha":"2026-10-01","ot_id":1,"tarea_id":4,"horas":1.5}' http://localhost:3010/api/horas

# Registrar trabajo sin ticket (descripcion obligatoria) fuera de horario
curl -b cookies.txt -H "X-Requested-With: Zydesk" -H "Content-Type: application/json" \
  -d '{"fecha":"2026-10-01","descripcion":"Reunión de equipo","horas":1,"fuera_de_horario":true}' http://localhost:3010/api/horas

# Corregir horas, fecha o marca (una fila nacida de un seguimiento sincroniza mensaje.horas)
curl -b cookies.txt -H "X-Requested-With: Zydesk" -H "Content-Type: application/json" -X PATCH \
  -d '{"horas":2,"fecha":"2026-09-30"}' http://localhost:3010/api/horas/1

# Borrar (204; si venía de un seguimiento, el mensaje queda sin horas)
curl -b cookies.txt -H "X-Requested-With: Zydesk" -X DELETE http://localhost:3010/api/horas/1
```

Errores: `VALIDACION` (400: ticket y OT a la vez, tarea sin OT o de otra OT, "Sin ticket" sin descripción, `fecha` futura, destino inexistente), `SIN_PERMISO` (403: planilla ajena sin `horas.ver_todas`, o `PATCH`/`DELETE` de una fila ajena), `NO_ENCONTRADO` (404), `CONFLICTO` (409, `detalles.registro_id`: ya hay una fila manual en esa celda; edítala) y `OT_CERRADA` (409, `detalles.horas`: la OT está cerrada o cancelada; vale para crear, editar y borrar). Una fila no cambia de destino (`ticket_id` y `ot_id` no se aceptan en el `PATCH`): se borra y se crea. Las horas no dejan `evento` ni `auditoria`. `POST /api/cotizaciones/:id/importar-horas` acepta además `{"origen":"registradas"}`.

## Regenerar `openapi.json`

```bash
npm run api:openapi
```

Escribe `docs/api/openapi.json` a partir de las rutas declaradas con `ruta()`. Al repetir el comando sin cambios en las rutas, el archivo no cambia. Hay que regenerarlo y versionarlo cada vez que se agrega o cambia una ruta o un esquema compartido.
