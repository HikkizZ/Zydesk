# ADR 0012 — Documentación y manuales

**Estado**: aceptada · 2026-09-29

## Contexto

Diez usuarios en cuatro roles, un administrador técnico (el desarrollador) y un despliegue autoalojado. Hace falta que alguien nuevo pueda usar la app, que Administración pueda operar la configuración sin el desarrollador, que el despliegue sea reproducible y que la API esté documentada para el bot y para futuros integradores.

## Opciones consideradas

- Markdown en el repo (`docs/`) — versionado con el código, editable con cualquier editor, legible en GitHub; se puede servir dentro de la app.
- Wiki externa (Notion, Confluence) — se desincroniza del código y añade otra herramienta.
- Generadores (Docusaurus, MkDocs) — bonito, pero más build por mantener; se puede agregar después sin cambiar el contenido.

## Decisión

Todo en Markdown, en español, dentro de `docs/`, versionado junto al código:

```
docs/
├── especificacion/        contexto-app-trazo.md + diseño de referencia (ya existe)
├── decisiones/            ADRs (este directorio) + README índice + preguntas-abiertas.md
├── manual-usuario/
│   ├── 00-primeros-pasos.md      ingreso (Microsoft / contraseña), Mi día, avisos, celular
│   ├── 01-tecnico.md             tickets, seguimiento vs nota interna, tareas, fotos, horas, convertir en OT
│   ├── 02-coordinacion.md        aprobar, cerrar OT (diálogo 4.6), facturación, cotizador, horas del equipo, reportes
│   ├── 03-solo-lectura.md        qué ve y qué no
│   └── 04-bot-telegram.md        (cuando exista) vincular, comandos
├── manual-administracion.md      equipo y roles, departamentos y horarios, feriados, categorías y plazos,
│                                 tarifas/IVA/prefijos/logo, plantillas, respaldo y restauración, espacio en disco
├── despliegue.md                 variables de entorno, Compose, primer arranque (migraciones + semilla),
│                                 integración con nginx-proxy + Cloudflare Tunnel, registro de app en Entra ID,
│                                 SMTP, actualización, respaldo (pg_dump + archivos), rollback
└── api/
    ├── README.md                 autenticación, convenciones (ADR 0010), ejemplos con curl
    └── openapi.json              generado con `npm run api:openapi` (ADR 0010); no se edita a mano
```

- **Manual de usuario por rol**: cada archivo sigue el orden de la pantalla, con capturas reales (`docs/manual-usuario/img/`) tomadas de la app con datos de semilla ficticios. Se escribe al cerrar cada fase del orden de construcción (sección 9 de la spec), no al final.
- **Dentro de la app**: enlace "Ayuda" en el menú que abre el manual del rol renderizado desde los mismos `.md` (servidos como estáticos por `web`). Sin buscador ni sistema aparte.
- **ADRs**: una decisión por archivo, formato Contexto / Opciones / Decisión / Consecuencias, numeradas, nunca se editan tras aceptarse: se reemplazan con una nueva ADR que marque la anterior como "sustituida por".
- **README.md** raíz: qué es, cómo levantar en desarrollo en 5 comandos, enlaces a `docs/`. **CHANGELOG.md** con versión y fecha por despliegue (formato Keep a Changelog, breve).
- **Referencia de API**: `openapi.json` versionado + Scalar en `/api/docs` para admin. No se escribe documentación de endpoints a mano.
- Código: comentarios solo donde la regla de negocio no es evidente (citar el punto de la spec, p. ej. `// spec 4.6`). Sin JSDoc obligatorio.

## Consecuencias

- La documentación vive en el mismo PR que el cambio; una regla de revisión: si cambia una pantalla, cambia su sección del manual.
- Las capturas envejecen; se aceptan capturas desactualizadas en detalles menores y se renuevan por fase.
- Si más adelante se quiere un sitio de docs, MkDocs se monta encima de esta carpeta sin reescribir nada.
