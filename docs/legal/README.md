# Documentos legales

- `terminos-de-uso.md`: Términos de uso.
- `politica-de-privacidad.md`: Política de privacidad.

La API los lee una vez al arrancar (si falta alguno, no arranca) y los muestra en `/terminos` y `/privacidad`.

## Encabezado (front matter)

Cada archivo comienza con un bloque entre líneas `---`:

```
---
version: 2026-09-30-borrador-1
titulo: Términos de uso
borrador: true
---
```

- `version`: identifica el texto vigente. Es obligatoria.
- `titulo`: título que se muestra.
- `borrador`: `true` muestra el aviso de borrador.

## Subir una versión

1. Edita el texto.
2. Cambia `version:` en `terminos-de-uso.md` (la versión vigente es la de ese archivo; una sola aceptación cubre términos y privacidad).
3. Reinicia la API. Cada persona verá el diálogo de aceptación la próxima vez que use la app.

Los textos actuales son borradores con marcadores (`[RESPONSABLE DEL TRATAMIENTO]`, `[NOMBRE DE LA ORGANIZACIÓN]`). Deben ser revisados por quien corresponda antes de cargar datos reales.

## Antes de datos reales (pregunta E3, pendiente)

La demo de la Fase 9 (`docs/demo.md`) muestra estos borradores tal cual, con el aviso visible: no hay datos reales. La **instalación definitiva** (`docs/despliegue.md` §5.3) no debe cargar personas ni clientes reales hasta cerrar esto:

1. **Quién decide y quién revisa.** La empresa nombra al **responsable del tratamiento** (E3 en `docs/decisiones/preguntas-abiertas.md`) y a quien revisa los textos (asesoría legal o quien la empresa designe). La decisión se anota en la ADR de cierre que corresponda; `preguntas-abiertas.md` no se edita desde la Fase 9.
2. **Marcadores.** Reemplazar `[NOMBRE DE LA ORGANIZACIÓN]` y `[RESPONSABLE DEL TRATAMIENTO]` en los dos archivos, y revisar el resto del texto (qué datos trata la app: correos, nombres, IPs de ingreso, horas, archivos de tickets; dónde se alojan; cuánto se conservan; respaldos cifrados).
3. **`borrador: false`** en los dos archivos: desaparece el aviso de borrador.
4. **`version` nueva** en `terminos-de-uso.md` (por ejemplo `2026-11-15-1`): es la versión vigente; cada persona vuelve a aceptar la próxima vez que use la app. Cambia también la de `politica-de-privacidad.md` para dejar rastro.
5. **Publicar.** Los textos viajan **dentro de la imagen de la API** (el `Dockerfile` copia `docs/legal`): el cambio exige commit en `main`, etiqueta nueva y despliegue (`docs/despliegue.md` §6). Reiniciar la API no basta en producción.

Mientras `borrador: true`, la app lo dice en pantalla al aceptar; nadie debe interpretar esos textos como revisados.
