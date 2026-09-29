# Preguntas abiertas y ambigüedades

**Estado (2026-09-29)**: el usuario **aceptó todas las respuestas de A1–A8 y B1–B14** tal como están aquí, con B6 y B9 actualizadas (ADR 0013 y 0015). Quedan pendientes solo los puntos de la sección **E**. Los valores entre corchetes (`[RUT]`, `[TARIFA]`) siguen siendo configuración, nunca inventados; `[DOMINIO]` = `desk.zytech.dev`; `[TENANT_ID]` y `[CORREO DE AVISOS]` ya no aplican.

## A. Contradicciones entre diseño y especificación — aceptadas por el usuario (2026-09-29)

| # | Tema | Qué dice cada fuente | Decisión |
|---|---|---|---|
| A1 | "Facturada" como etapa de OT | Spec 4.5 la lista como etapa; spec 4.6 y el modelo dicen que facturar es independiente (`estado_facturacion`). El listado del diseño muestra etapa "Cerrada" con "Por facturar". | Etapa termina en `cerrada`; "Facturada" es solo `estado_facturacion`. La UI dibuja el sexto paso derivado. (ADR 0004) |
| A2 | Etapas que aparecen en el diseño y no en la spec | Listado de OT: "Esperando aprobación", "Borrador · por aprobar". | No crear etapas nuevas: "Esperando aprobación" = `cotizada` con cotización enviada; "por aprobar" = `borrador` de una interna. Son etiquetas, no estados. |
| A3 | Numeración de cotizaciones | Spec: `COT-####` correlativo propio. Diseño: `COT-0218` para `OT-0218`. | Derivar de la OT (`COT-0218 v1`), sin contador propio. (ADR 0006, confirmado en 0014) |
| A4 | OT cancelada | Spec 4.1 habla de "cancelar la OT primero" pero no hay etapa Cancelada. | Agregar etapa `cancelada` con motivo. (ADR 0004) |
| A5 | Plazos por prioridad | Spec 4.1: plazo de resolución "por prioridad". Diseño (Configuración): un solo plazo de respuesta y uno de resolución por categoría. | Plazo de resolución con **4 valores (uno por prioridad)** y plazo de respuesta único; la pantalla de configuración se amplía con 4 columnas. |
| A6 | Colación | Spec: "entrada, salida y colación". Diseño: solo "60 min". | Guardar `colacion_inicio` (por defecto 13:00) + `colacion_min`, para descontar el bloque correcto al contar horas hábiles. (ADR 0005) |
| A7 | Columna "Cerrados" del Kanban | Tres estados cerrados en una columna. | Arrastrar a "Cerrados" abre un selector (Resuelto / Descartado / Duplicado) con sus campos. |
| A8 | Línea de tiempo | Diseño muestra 10 días (solo L-V). | Escala "2 semanas" = 10 días hábiles del departamento del usuario que mira; "Mes" = días hábiles del mes. Además: agrupar por persona/cliente, aviso de vencidos y ancho mínimo de barra. (ADR 0016) |

## B. Reglas incompletas en la especificación — aceptadas por el usuario (2026-09-29)

| # | Tema | Decisión |
|---|---|---|
| B1 | Resolver un ticket con OT abierta | **Bloquear** (409) hasta cerrar o cancelar la OT. (ADR 0004) |
| B2 | Vencimientos "en 24 h": ¿24 h de reloj o hábiles? | 24 h **de reloj**. El plazo sí se calculó en horas hábiles. |
| B3 | "Se pueden editar hasta el cierre de mes" (horas) | Sin bloqueo en v1; Coordinación exporta a fin de mes. Si hace falta, botón "Cerrar mes". |
| B4 | "Fuera de horario" en la planilla de horas | Marca manual por celda ("fuera de horario") que aplica tarifa extendida. |
| B5 | Horas registradas desde el redactor de seguimiento | Crean una fila de `registro_horas` del autor para ese día y esa entidad. |
| B6 | Bolsa de horas del cliente | **Actualizada**: contrato de bolsa **opcional** por cliente; casilla "Descuenta de la bolsa" en OT facturables vincula `contrato_id`; horas usadas del mes = suma de `registro_horas` solo de esas OT; clientes sin bolsa no ven la sección ni la casilla; sin alertas en v1 (aviso al 80 % es mejora futura). (ADR 0015) |
| B7 | Cambio de responsable principal | No recalcula fechas ya fijadas; solo registra el Evento. |
| B8 | ¿Quién es el "aprobador" de una OT interna? | Un usuario con permiso `ots.aprobar` elegido en la OT; aparece en "Por aprobar" de su Mi día. |
| B9 | Recuperar contraseña | **Actualizada**: no hay correo saliente. Administración restablece la contraseña desde Equipo (temporal, se muestra una vez) y el usuario debe cambiarla al ingresar. (ADR 0013) |
| B10 | Rol Solo lectura | Ve tickets, OT, clientes, reportes y montos, **incluidas notas internas**; no escribe nada ni registra horas. |
| B11 | "N° de mensajes" en tarjeta del Kanban | Seguimientos + notas internas (no eventos). |
| B12 | Tarifas por cliente (`TarifaCliente`) vs tarifas globales | "Importar horas de las tareas" usa la tarifa del cliente si existe para ese concepto; si no, la global. |
| B13 | Múltiples responsables de distintos departamentos | El calendario que manda es el del **responsable principal** (spec 4.1). |
| B14 | Duplicado de un ticket ya duplicado | No permitido; se debe apuntar al original. |

## C. Datos y decisiones de entorno — resueltos (2026-09-29)

- **Nombre y dominio**: la app es **Zydesk**, en `desk.zytech.dev`. Nombre visible y logo configurables por Administración (ADR 0013).
- **Microsoft Entra**: la organización no permite registrar aplicaciones. Sin OIDC; `[TENANT_ID]`, client id/secret y redirect URI **eliminados**. Ingreso solo con correo + contraseña (ADR 0013).
- **Correo de avisos**: **fuera de v1**. Sin SMTP ni `[CORREO DE AVISOS]`; avisos por app y Telegram; resumen diario por Telegram. El canal `correo` queda como interfaz prevista sin implementar (ADR 0013).
- **Contadores**: prefijo, número inicial y dígitos configurables por tipo desde Configuración; tickets correlativos o aleatorios (ADR 0014). Semilla: `TK-` desde 1000, `OT-` desde 200.
- **Departamentos y horarios**: configurables por Administración (ya previsto en Configuración → Departamentos y horarios; el diseño trae Soporte TI / Terreno / Coordinación como ejemplo).
- **Producción**: el **VPS del usuario**, desplegado con el Docker Compose portable (ADR 0001). Datos en `/srv/data/zydesk/`.
- Siguen siendo configuración a cargar por Administración (no decisiones): `[TARIFA]` de urgencia, traslado por km y costo interno; `[RUT]`, razón social, dirección y logo para el PDF.

## D. Riesgos técnicos principales

1. **Respaldos**: el VPS tiene 1 solo punto de restauración diario. Se necesita `pg_dump` nocturno + copia de `ARCHIVOS_DIR` fuera del VPS (rclone). Va en `despliegue.md`; **destino pendiente** (E2).
2. **Acceso solo con contraseña**: sin Microsoft, la app es la única barrera. Mitigación: sesiones endurecidas y límites de intentos (ADR 0013); el segundo factor está **pendiente** (E1).
3. **Lectura de .msg**: cuerpos RTF/HTML y codificaciones pueden dar texto vacío o sucio. Mitigación: vista previa editable + original descargable + pegar texto.
4. **Motor de horas hábiles**: errores sutiles (cambio de hora, feriados, colación). Mitigación: tabla de casos en tests de `shared` desde el primer día.
5. **Telegram como único canal externo**: quien no vincule el bot solo ve avisos al abrir la app. Mitigación: sugerir la vinculación en el primer ingreso; el bot se adelanta a la Fase 6.
6. **Todo en un proceso** (API + jobs + pg-boss): un job pesado compite con las peticiones. Aceptable a esta escala; `EJECUTAR_JOBS` permite separarlo después.
7. **Kanban táctil**: dnd-kit en móvil es frágil; por eso cada tarjeta tiene menú "Cambiar estado".
8. **Crecimiento de archivos**: la compresión en cliente y el límite de 20 MB lo contienen, pero hay que vigilar el disco (manual de administración).
9. **Sin tiempo real**: avisos y tableros se refrescan por sondeo (30–60 s). Si el equipo lo siente lento, SSE es el siguiente paso barato.

## E. Pendientes de decisión del usuario

| # | Tema | Opciones | Recomendación |
|---|---|---|---|
| E1 | **Segundo factor** de acceso (ADR 0013) | (i) Cloudflare Access (Zero Trust) delante de `desk.zytech.dev`, con OTP por correo o proveedor de identidad; sin código en la app. (ii) TOTP en la app, opcional para todos y obligatorio para Administración. | **Resuelta (2026-09-29): Cloudflare Access (i)**, aceptada por el usuario. |
| E2 | **Destino de los respaldos** fuera del VPS | Almacenamiento de objetos (Backblaze B2 / Cloudflare R2 / S3), un segundo servidor, o disco de la organización. | Objetos con rclone: barato, cifrable y sin mantenimiento. **Postergada por el usuario**; decidir antes del primer dato real. |
| E3 | **Responsable del tratamiento de datos** | ¿La organización del usuario o zytech como proveedor? Define quién figura en la política de privacidad, quién responde a solicitudes de acceso/eliminación y bajo qué ley (datos de contactos de clientes chilenos). | Pendiente de conversación con el usuario; sin esto no se puede redactar la política de privacidad ni el aviso en la app. |
