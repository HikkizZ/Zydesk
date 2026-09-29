# ADR 0009 — Archivos, fotos y correos adjuntos (.msg / .eml / texto)

**Estado**: aceptada · 2026-09-29

## Contexto

Fotos desde la cámara del celular (terreno), documentos, respaldo obligatorio de aprobación, .xlsx/PDF generados, y correos adjuntados como archivo o texto pegado, de los que se extraen remitente, destinatario, fecha, asunto, cuerpo y adjuntos internos para autocompletar el ticket. El original debe poder descargarse. La app no lee buzones. Volumen esperado: decenas de MB al mes.

## Opciones consideradas

- **Disco local en volumen Docker** detrás de una interfaz — cero dependencias; el respaldo es copiar una carpeta.
- S3/MinIO — más piezas para un beneficio que no existe a esta escala. La interfaz deja la puerta abierta.
- Guardar binarios en Postgres (`bytea`) — simplifica el respaldo pero engorda la BD y complica el streaming; descartado.

## Decisión

- **Almacenamiento**: `Storage { guardar(stream, meta) → clave; abrir(clave) → stream; eliminar(clave) }` con una sola implementación `StorageLocal` en `ARCHIVOS_DIR` (volumen `/srv/data/trazo/archivos`). Clave: `aaaa/mm/<uuid>.<ext>`. Metadatos en `archivo(id, entidad, entidad_id, mensaje_id?, nombre_original, tipo_mime, tamano, clave, subido_por, subido_en, categoria ∈ {foto, documento, correo})`.
- **Subida**: `multer` a disco temporal → validación → `Storage`. Límites: **20 MB por archivo, 10 archivos por petición**; MIME por lista permitida (imágenes, PDF, Office, .msg, .eml, .txt, .csv, .zip) verificando el contenido real (`file-type`), no la extensión. Nombres se guardan tal cual para mostrarlos; en disco nunca se usa el nombre del usuario.
- **Fotos móviles**: `<input type="file" accept="image/*" capture="environment" multiple>`. Antes de subir, el front reduce a máximo 2000 px de lado y calidad 0,8 con `browser-image-compression` (una foto de 8 MB pasa a ~500 KB). El servidor no procesa imágenes; las miniaturas de la galería son la misma imagen con `object-fit` (a este volumen no vale la pena generar thumbnails).
- **Descarga**: siempre por `GET /api/archivos/:id` con sesión y verificación de que el usuario puede ver la entidad; `Content-Disposition: attachment` para descargar, `inline` para imágenes y PDF. Nunca se sirven estáticos desde nginx.
- **Subida en dos pasos**: `POST /api/archivos` sube y devuelve `archivo_id` con `entidad = NULL` (pendiente); al crear el ticket/mensaje/OT se envían los ids y la API los asocia. Un job diario borra pendientes de más de 24 h (ADR 0008). Esto permite subir fotos mientras se escribe y previsualizar el correo antes de crear.
- **Correos**: `POST /api/correos/parsear` recibe un archivo pendiente o `{ texto }` y devuelve `{ de, para, fecha, asunto, cuerpo_texto, adjuntos: [{nombre, tamano, tipo}] }` sin persistir nada más.
  - `.eml` → `mailparser`. `.msg` → `@kenjiuno/msgreader` (cuerpo: texto plano; si solo hay RTF/HTML se convierte a texto con `html-to-text`).
  - Texto pegado → heurística sobre las primeras líneas (`De:/From:`, `Para:/To:`, `Enviado:/Sent:/Fecha:`, `Asunto:/Subject:`); lo que no se reconoce va al cuerpo. Es "mejor esfuerzo": el usuario revisa antes de crear.
  - Al crear el ticket se guarda `correo_adjunto(ticket_id, archivo_id?, de, para, fecha, asunto, cuerpo)`; el archivo original queda con `categoria = correo`. Los **adjuntos internos** se listan en la vista previa con casillas marcadas por defecto; los seleccionados se extraen en el servidor y se guardan como `archivo` normales del ticket (`origen_correo_id`), respetando los mismos límites.
- El cuerpo del correo se guarda como texto plano (no HTML) para evitar renderizar HTML de terceros en la app.

## Consecuencias

- Respaldo = `pg_dump` + copia de `ARCHIVOS_DIR`; sin credenciales de nube.
- Riesgo principal: `.msg` con cuerpos RTF comprimidos o codificaciones raras pueden dar cuerpo vacío; siempre queda el original descargable y el usuario puede pegar el texto.
- 20 MB × 10 usuarios × uso normal cabe holgado en los 100 GB del VPS; se monitorea con `du` en el manual de administración.
