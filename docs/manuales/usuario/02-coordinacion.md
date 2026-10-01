# Manual de coordinación: aprobar, cerrar y facturar OT

Esta guía es para quienes tienen rol **Coordinación** o **Administración**. Son las personas que aprueban las órdenes de trabajo (OT), las cierran, las cancelan y las marcan como facturadas. Cómo se crea una OT y cómo se trabaja en ella está en el [manual de tickets para el equipo](01-tecnico.md). Un Técnico ve estos botones ausentes; quien tiene **Solo lectura** puede ver todo pero no cambiar nada.

## Aprobar una OT interna

Una OT **interna** (no se factura) en **Borrador** muestra dos botones:

- **Aprobar e iniciar**: la aprueba y pasa directo a **En ejecución**.
- **Solo aprobar**: la deja **Aprobada**; después se inicia con **Iniciar ejecución**.

Al crear o editar la OT se indica **quién aprueba**: es a quien se le pide, pero **cualquier persona con permiso de aprobar puede hacerlo**. El historial deja registrado quién aprobó realmente.

## Registrar la aprobación del cliente (OT facturable)

Una OT facturable en **Cotizada** espera la aprobación del cliente. Cuando el cliente responde:

1. Pulsa **Registrar aprobación del cliente…**.
2. Elige el **contacto** del cliente que aprobó (debe ser un contacto activo de ese cliente), la **fecha** y la **forma**: orden de compra, correo de aprobación o cotización firmada.
3. Sube el **respaldo** (la orden de compra, el correo o el documento firmado). **Es obligatorio**: sin respaldo no se puede registrar. El archivo queda en **Fotos y archivos** de la OT ("respaldo de aprobación").
4. Opcionalmente marca **iniciar** para pasar de una vez a **En ejecución**. Pulsa registrar.

Una OT solo se aprueba una vez. Si el cliente rechaza la cotización, usa **Volver a borrador**.

## Cerrar una OT

Una OT en **En ejecución** muestra **Cerrar OT…**. El diálogo pregunta:

1. **¿Esta OT resolvió el ticket?**
   - **Sí**: el ticket pasa a **Resuelto**. No está disponible si el ticket tiene otras OT abiertas: el diálogo las nombra; ciérralas o cancélalas primero.
   - **No, o solo en parte**: el ticket sigue abierto y eliges **qué pasa con él**:
     - **Vuelve a En curso**.
     - **Pasa a En espera**: indica de quién se espera (cliente, proveedor, repuesto o aprobación) y un detalle opcional.
     - **Se crea una nueva OT vinculada**: nace en Borrador con el mismo tipo y datos, y recibe las tareas pendientes de la OT que cierras. El ticket vuelve a En curso.

     En los tres casos eliges el **responsable del siguiente paso** (por defecto, el responsable principal del ticket). Pasa a ser el responsable principal del ticket; quien lo era queda como colaborador. Con la nueva OT, es su responsable técnico.
2. **Resumen de cierre** (obligatorio, hasta 5.000 caracteres): qué se hizo y cómo quedó.
3. **Qué va a pasar**: la app te muestra, antes de confirmar, qué le ocurrirá a la OT, al ticket, al historial y a quién se avisará. Léelo: cambia según tus respuestas.

Pulsa **Cerrar OT y resolver ticket** o **Cerrar OT (ticket sigue abierto)**. Todo ocurre junto: si algo falla, no se cambia nada.

Qué queda después:

- La OT queda **Cerrada**. Si es facturable pasa a **Por facturar** (**aunque no haya resuelto el ticket**); si es interna, no se factura. Si no tenía fecha de término, se fija la de hoy.
- El resumen queda como seguimiento de la OT y **también en el ticket** ("Cierre de OT-0218" en su actividad), junto con el registro "OT-0218 cerrada · resolvió el ticket" (o "no resolvió el ticket") en el historial.
- Con la nueva OT, un aviso con enlace te lo indica ("OT-0220 creada").
- Los avisos a responsables y seguidores se activan en una fase posterior: por ahora el diálogo lo dice al pie.

## Cancelar una OT

Mientras una OT no esté cerrada ni cancelada, **Cancelar OT…** pide un **motivo obligatorio**. La OT queda **Cancelada** (se muestra tachada), no se factura aunque fuera facturable, sus tareas pendientes se quedan en ella y el ticket registra "canceló OT-0218" con el motivo. El estado del ticket no cambia. Una OT cancelada ya no cuenta como abierta: deja de impedir que se cierre el ticket.

## Marcar una OT como facturada

Una OT facturable cerrada aparece como **Por facturar** (en la lista, el filtro **Por facturar** las reúne). Cuando emites la factura, abre la OT, pulsa **Marcar facturada…** e ingresa el **N° de factura**. Pasa a **Facturada**, con número, fecha y quién la marcó; el stepper muestra "Facturada" como último paso. Solo se puede marcar una OT que esté por facturar, y solo una vez.

## Resolver un ticket que tiene una OT abierta

Un ticket con una OT abierta no se puede resolver, descartar ni marcar como duplicado directamente: la app muestra la lista de OT abiertas con su etapa. Tienes dos caminos:

- Cierra la OT desde **Cerrar OT…** con **Sí** (resuelve el ticket en el mismo paso).
- O cancela la OT que ya no corresponde y luego cambia el estado del ticket.

## Lo que todavía no está

La cotización no se calcula en la app (se marca a mano que la OT está cotizada), no hay montos ni descargas, y los avisos por correo o en la app llegan en fases posteriores.
