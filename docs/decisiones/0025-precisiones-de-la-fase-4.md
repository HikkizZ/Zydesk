# ADR 0025 — Precisiones surgidas al especificar e implementar la Fase 4

**Estado**: aceptada · 2026-10-01 · precisa a ADR 0001, 0003, 0004, 0006, 0007, 0010, 0011, 0013, 0014, 0015, 0017, 0020, 0021, 0022 y 0024 (no cambia sus decisiones de fondo) · sustituye el punto 1 de ADR 0023 · precisada por ADR 0027 (Fase 6) · precisada por ADR 0030 (sustituye 0025.24 y 0025.28 en UF)

## Contexto

Al escribir `docs/specs/fase-4.md` (§18 y §20) y al implementar el cotizador aparecieron detalles que las ADR dejaban abiertos: cómo se alcanza la etapa Cotizada ahora que la cotización vive en la app, cómo se versiona, qué registran las descargas, qué bibliotecas generan los documentos y cómo acelerar la suite de tests sin perder cobertura. Las once preguntas de §19 las respondió el usuario el 2026-10-01 aceptando las decisiones de la spec; durante la implementación se tomaron otras menores, y la revisión de seguridad de PLAN §1 dejó tres hallazgos corregidos y uno descartado. Se registran aquí para que las ADR, la spec y el código digan lo mismo.

## Decisión

### Respuestas del usuario (§19)

1. **Desaparece la marca manual "Cotizada"** (precisa ADR 0004; sustituye ADR 0023.1): la OT pasa a `cotizada` solo al marcar una cotización como enviada; `cambiar-etapa` acepta únicamente `borrador` y `en_ejecucion`. La aprobación del cliente exige, además de `AprobacionCliente`, una cotización vigente `enviada`, que queda `aprobada` e inmutable. Sin datos en producción no hay migración; las semillas se corrigieron.
2. **"Marcar como enviada" la hace quien tiene `tickets.editar`** (técnico incluido), el mismo permiso que tenía la marca manual; aprobar sigue siendo de `ots.aprobar`.
3. **Las descargas no se guardan como `archivo` de la OT** (precisa ADR 0017 y 0021): una cotización enviada es inmutable y el documento se regenera igual cada vez. Se registra un `evento` `cotizacion_descargada` en la OT y `auditoria` `exportacion { tipo, entidad: 'cotizacion', entidad_id, ot_id }` (no `descarga_archivo`, porque no hay `archivo`); siguen siendo `attachment`. La galería del diseño que mostraba `COT-0218_v1.xlsx` se omite.
4. **Costo interno con horas registradas** (`registro_horas`), no con `tarea.horas_reales` (precisa ADR 0007): se calcula al vuelo en `cargarOt`, sin IVA, solo si la tarifa `costo_interno` está configurada.
5. **PDF con Roboto** (fuente incluida en pdfmake, Apache 2.0) en lugar de IBM Plex (precisa ADR 0001): `@fontsource` solo trae WOFF/WOFF2, que pdfkit no acepta, y embeber TTF exigiría versionar binarios.
6. **Paralelismo de tests condicional**: F4-T2 solo si F4-T1 no alcanzaba 6 min local. No hizo falta (ver 21).
7. **El ticket no recibe eventos de cotización**: ya muestra la OT vinculada y su etapa.
8. **Lista mínima `/cotizaciones`** como vista de solo lectura (precisa ADR 0011 y 0022): el menú "Cotizador" lleva a ella; muestra solo las versiones vigentes.
9. **Regla mínima de bolsa** (precisa ADR 0015 y 0024.3): `descuenta_bolsa: true` con `contrato_id` ya fijado no vuelve a resolver el contrato en ninguna etapa y no cuenta como cambio; cambiar de contrato exige `false` → `true` (con `ots.aprobar` fuera de Borrador y Cotizada).
10. **Prefijo `COT-` fijo** (precisa ADR 0006 y 0014): `cotizacion.codigo` = `COT-` + los dígitos del código de la OT (`OT-0218 → COT-0218`, `OT-000201 → COT-000201`), materializado sin la versión y sin fila en `contador`. Cambiar el prefijo de OT no altera cotizaciones existentes.
11. **Validez solo 15 o 30 días** (`CHECK`), como la spec funcional §4.7.

### Decisiones de la spec (§18 y §20)

12. **Estados de versión** `borrador → enviada → aprobada | rechazada | reemplazada` (precisa ADR 0004): **vigente** es la de mayor `version`; a lo sumo un borrador y una aprobada por OT (índices parciales). "Volver a borrador" (rechazo del cliente) marca la vigente `rechazada`; enviar la versión siguiente marca la anterior `reemplazada`. Solo el borrador vigente se elimina; las demás versiones son historial. "Duplicar como vN" solo desde `enviada` o `rechazada` con la OT en Borrador o Cotizada.
13. **"Enviar" = "Marcar como enviada"** (precisa ADR 0013): sin correo saliente, la app registra el hecho; el documento se descarga y se envía fuera.
14. **Edición por `PUT` completo** (encabezado y todas las líneas) con recálculo en la API (precisa ADR 0007 y 0010): `calcularCotizacion` de `shared` es la única implementación; la API descarta `total`, `neto`, `iva_pct` y `totales` del cuerpo. Totales **materializados** en `cotizacion` y `linea_cotizacion.total` para que la lista de OT, el cierre y los documentos no recalculen. `iva_pct` es snapshot al crear y se copia al duplicar; `redondear` usa `Number.EPSILON`; `enClp` y `OtResumen.neto` convierten UF a CLP con `valor_uf`.
15. **Eventos de cotización bajo `entidad = 'ot'`** con `datos.cotizacion_id` y `datos.version` (precisa ADR 0003, criterio de ADR 0021.2): `cotizacion_creada`, `cotizacion_enviada`, `cotizacion_aprobada`, `cotizacion_rechazada`, `cotizacion_lineas_agregadas`, `cotizacion_descargada`, `cotizacion_eliminada`; la edición usa `registrarCambios` por campo (incluye `neto` y `total`). Tras el commit se publica `cotizacion.respondida` (aprobada o rechazada). Tarifas y plantillas registran `auditoria` `config_cambiada { seccion: 'tarifas' | 'plantillas', … }` sin montos.
16. **Importar horas** crea una línea `mano_de_obra` por tarea con horas > 0 del origen elegido (estimadas por defecto o reales), siempre a `hora_normal` (tarifa del cliente, si no la global; B12); el horario extendido se ajusta a mano. **Plantillas con precio opcional**: `null` = tarifa vigente al aplicar (`h → hora_normal`, `km → traslado_km`, `un`/`gl → 0`).
17. **Tarifas globales, IVA y validez en `configuracion` (jsonb)**, clave `tarifas`, no en tabla propia; `GET /api/config/tarifas` abierto a cualquier sesión (el cotizador los necesita; B10), `PUT` con `config.editar`. La clave `cotizacion` prevista en la spec no se siembra: IVA, validez y condiciones por defecto viven en `tarifas`.
18. **Exportadores**: la descripción se escribe siempre como texto en el `.xlsx` (nunca fórmula) y la nota interna no va en ningún documento (precisa ADR 0007 y 0017).
19. **Rutas nuevas** (precisa ADR 0010): `GET /api/cotizaciones`, `POST /api/ots/:id/cotizaciones`, `GET|PUT|DELETE /api/cotizaciones/:id`, `/importar-horas`, `/aplicar-plantilla`, `/enviar`, `/duplicar`, `/descargar.xlsx|pdf`, `GET|PUT /api/config/tarifas`, `GET|POST /api/config/plantillas-cotizacion`, `PUT /:id`, `PATCH /:id/activo`. Códigos nuevos: `COTIZACION_NO_EDITABLE`, `COTIZACION_APROBADA`, `COTIZACION_REQUERIDA`, `TARIFA_FALTANTE` (409).
20. **Dependencias entre módulos** (precisa ADR 0003): `cotizaciones.service` importa de `ots/ots.acceso.ts` y `ots/ots.etapas.service.ts` (`registrarEtapa`, `asignarContactoSiVacio`); `ots.etapas.service` importa de `cotizaciones/cotizaciones.estados.ts` (`aprobarVigenteEnTx`, `rechazarVigenteEnTx`), que solo depende de `shared`, `core` y `ots.acceso.ts`. Así la aprobación y el rechazo cambian la cotización en la misma transacción sin ciclo.
21. **Suite de tests** (precisa ADR 0020): `reiniciarBd` borra con `DELETE` solo las tablas con filas, en orden hijos → padres sobre las FK bloqueantes, y reinicia sus secuencias de identidad (56 ms frente a 750 con `TRUNCATE`); ya no reinicia `migracion_id_seq`. `ingresarComo` crea la sesión directo en BD salvo cuando recibe contraseña (tests que prueban el ingreso real). Los parámetros de argon2 no cambian por entorno. Resultado: 708 s → 334 s local; F4-T2 (paralelismo por worker) no se ejecutó.
22. **Dependencias** (precisa ADR 0001): `exceljs ^4.4` (MIT) y `pdfmake ^0.2` (MIT; fuentes Roboto, Apache 2.0) en `apps/api`. Sin paquetes nuevos en `web` ni en `shared`.

### Decisiones de la implementación

23. **Al enviar se bloquea primero el ticket**: `enviarCotizacion` llama a `registrarActividadEnTicket`, así que respeta el orden ticket → OT → cotización → tarea/mensaje. El resto de las operaciones de cotización bloquean OT → cotización.
24. **Cotizaciones en UF**: importar horas, o aplicar una plantilla con líneas que toman precio de la tarifa, responde 400 `VALIDACION { moneda }`: las tarifas están en pesos. Si el resultado superaría 100 líneas, 400 `VALIDACION { lineas }`.
25. **Orden de errores en la aprobación del cliente**: 409 `COTIZACION_REQUERIDA` se responde antes que los 400 de contacto y archivo.
26. **Infraestructura**: `registrarCambios` acepta `datos` opcional (para `cotizacion_id`); `contentDisposition` se movió a `core/http/descarga.ts` y lo usan archivos y cotizaciones. Los códigos de error nuevos se declaran en `shared/errores.ts` solo con su status; el mensaje va donde se lanzan.
27. **Configuración**: `PUT`/`PATCH` de una plantilla inexistente → 404; un `PATCH` de `activo` sin cambio no audita; "Ver inactivas" es un `Switch` con "Reactivar", como en Equipo; "Desactivar…" pide confirmación.
28. **Front** (precisa ADR 0011): los descuentos usan guion ASCII (`-$9.000`); "Importar horas" y "Aplicar plantilla" también exigen guardar antes; `CotizacionBreve` no trae `vence_el` ni `contacto` (el panel de la OT los lee con `GET /api/cotizaciones/:id`); en UF, "Agregar línea" deja el precio en 0.

### Revisión de seguridad (F4-T15, commit `44d6c3b`)

29. **F4-SEC-01 (corregido; precisa ADR 0007 y 0017)**: los totales de una cotización tienen tope en 999.999.999.999,99 (`numeric(14,2)`); superarlo responde 400 `VALIDACION { lineas }` en vez de desbordar en Postgres. El manejador de errores registra un `QueryFailedError` sin `query` ni `parameters` (traen contenido y montos).
30. **F4-SEC-02 (corregido; precisa ADR 0003)**: enviar revalida que el contacto sea activo y del cliente **actual** de la OT (pudo cambiar tras guardar el borrador); la escritura en `ot.contacto_id` va por `asignarContactoSiVacio` del módulo `ots`, no por SQL desde `cotizaciones`.
31. **F4-SEC-03 (corregido; precisa ADR 0021)**: `contentDisposition` vuelve a sanear la barra invertida en el nombre del archivo (se perdió al mover la función).
32. **F4-SEC-04 (descartado)**: las descargas son `GET` sin CSRF y dejan `evento` y `auditoria`. Es el mismo patrón ya aceptado para `/api/archivos` (ADR 0021): no filtra datos, solo registra.
33. **Observaciones aceptadas**: el `evento` de la OT guarda `nota_interna` y `condiciones` recortadas a 120 caracteres (spec §5.3); si la nota se restringe por rol en el futuro, revisar. En las semillas, las OT internas no tienen horas registradas, así que su costo interno es $0.

## Consecuencias

- Las ADR citadas mantienen su texto; ante una diferencia, manda esta ADR. ADR 0023.1 queda sustituida por el punto 1.
- Toda vía nueva que toque ticket, OT y cotización respeta el orden de bloqueo ticket → OT → cotización → tarea/mensaje; el cotizador hereda las reglas de ADR 0024.
- La Fase 5 trae la planilla de horas y `tarea_id` en `registro_horas`; la Fase 6 conecta el despachador a `cotizacion.respondida`, la pantalla 10 completa y "Por aprobar" en Mi día; la Fase 9 agrega los datos de la empresa al PDF. El prefijo `COT-` configurable y el correo saliente siguen fuera.
- `preguntas-abiertas.md` no se edita: B10 y B12 quedan aplicadas por los puntos 16 y 17.
