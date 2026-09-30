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
