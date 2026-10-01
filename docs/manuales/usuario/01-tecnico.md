# Manual de tickets para el equipo

Esta guía es para quienes crean y atienden tickets (Administración, Coordinación y Técnicos). Quien tiene rol **Solo lectura** puede ver todo, incluidas las notas internas, pero no editar nada.

## Crear un ticket

1. Pulsa **Nuevo ticket** (en el menú o en el Tablero).
2. Completa al menos el **asunto**. El resto ayuda a atender y a calcular plazos: descripción, cliente (o área interna), solicitante, prioridad (por defecto **Media**), categoría, responsables, seguidores, inicio planificado, fecha límite y horas estimadas.
3. Si eliges una categoría y no hay responsable principal, la app **propone** el responsable por defecto de esa categoría; puedes cambiarlo.
4. Si dejas la **fecha límite** vacía y hay categoría y responsable principal con departamento, se calcula sola según los plazos de la categoría (en horas hábiles). Bajo el campo verás "Se calculará: vence el …". Si escribes una fecha, se respeta.
5. Pulsa **Crear ticket**. Te lleva al detalle del ticket nuevo.

Desde la ficha de un cliente, **Nuevo ticket para este cliente** abre el formulario con el cliente ya elegido.

### Crear un ticket desde un correo

En el panel **Adjuntar correo** (a la derecha; en el celular, arriba y plegable):

- **Archivo**: arrastra un `.eml` o un `.msg` (correo guardado desde el programa de correo).
- **Texto pegado**: pega el correo completo, con las líneas De/Para/Asunto, y pulsa **Leer correo**.

Verás una vista previa con De, Para, Fecha, Asunto y cuerpo. Si el correo trae adjuntos, aparecen con una casilla marcada: desmarca los que no quieras guardar (los no permitidos vienen deshabilitados). Pulsa **Usar en el formulario**: se rellenan el asunto, el solicitante y la descripción. Revisa los datos y crea el ticket.

En el detalle queda la tarjeta **Correo original**, con botón **Descargar original**, y los adjuntos que elegiste como archivos del ticket. Si el correo no se puede leer, pega su texto en la otra pestaña.

## Archivos y fotos

Puedes adjuntar fotos y documentos al crear el ticket y en cada seguimiento o nota (en el celular, el botón de cámara abre la cámara). Se aceptan imágenes (JPG, PNG, WebP, HEIC), PDF, Word, Excel, PowerPoint, ZIP, `.eml`, `.msg`, `.txt` y `.csv`; hasta 10 archivos por vez y 20 MB cada uno. Un archivo de otro tipo, o que no es lo que dice su extensión, se rechaza.

## El detalle del ticket

Arriba ves el código, el asunto, el estado, la prioridad, la fecha límite y los botones **Cambiar estado** y **Editar**. Debajo: descripción, correo original, archivos, tareas y la **actividad**. A la derecha (en el celular, debajo) están los datos del ticket: responsables, seguidores, solicitante, cliente, categoría, fechas y primera respuesta. **Seguir** te agrega como seguidor; **Dejar de seguir** te quita.

## Seguimiento o nota interna

El redactor del pie tiene dos modos:

- **Seguimiento**: avance oficial del ticket: qué se hizo, qué se acordó, qué respondió el cliente. El primer seguimiento registra la primera respuesta del ticket.
- **Nota interna**: contexto solo para el equipo. Se ve con fondo ámbar y candado, y no debe incluirse en reportes al cliente.

Ambos se pueden registrar aunque el ticket esté cerrado o archivado (no lo reabren). El texto se guarda tal cual, sin formato.

En **Actividad** hay pestañas con conteos: **Actividad** (todo), **Seguimiento**, **Notas internas** e **Historial** (cambios de estado, prioridad, responsables, fechas y tareas, con quién y cuándo).

## Menciones

Escribe `@` en el redactor y elige a una persona activa de la lista. Su nombre queda resaltado en el mensaje. Por ahora la mención no envía avisos (llegan en una fase posterior).

## Horas desde el redactor

En el redactor puedes indicar las **horas** trabajadas (por ejemplo 1,5). Al guardar, el mensaje muestra "· 1,5 h registradas" y las horas quedan a tu nombre, con la fecha de hoy. La planilla de horas llega en una fase posterior.

## Tareas

La tarjeta **Tareas** es la lista de pasos del ticket, con barra de progreso ("2 de 5"). Cada tarea tiene título, responsable opcional y fecha opcional. Puedes agregar, editar y quitar tareas, y marcarlas como hechas. Una tarea pendiente con fecha pasada se ve en rojo. En un ticket cerrado solo se pueden marcar o desmarcar; para agregar, editar o quitar hay que reabrirlo.

## Estados y qué exige cada uno

Desde el detalle, **Cambiar estado** abre un diálogo. **Es el único lugar donde se cambia el estado**: ni el Tablero ni la Tabla permiten arrastrar o cambiar estados.

| Estado        | Qué pide                                                                               |
| ------------- | -------------------------------------------------------------------------------------- |
| **Nuevo**     | Nada. Es el estado inicial.                                                            |
| **En curso**  | Nada. La primera vez que un ticket pasa a En curso cuenta como primera respuesta.      |
| **En espera** | De quién se espera: cliente, proveedor, repuesto o aprobación, y un detalle opcional.  |
| **Resuelto**  | Nada, pero el ticket no puede tener una OT abierta (ver más abajo).                    |
| **Descartado** | Un motivo obligatorio (por ejemplo, "No corresponde: publicidad"); sin OT abierta.   |
| **Duplicado** | El ticket original (no el mismo ni otro duplicado); sin OT abierta.                    |

**Un ticket con una OT abierta no se puede resolver, descartar ni marcar como duplicado**: la app muestra la lista de OT abiertas (con su etapa y un enlace) y hay que cerrarlas o cancelarlas antes. Desde un ticket abierto puedes ir a cualquier otro estado. Desde uno cerrado (Resuelto, Descartado o Duplicado) solo a **En curso**: el botón se llama **Reabrir**. Un ticket cerrado no se puede editar (asunto, responsables, tareas) hasta reabrirlo.

## Convertir un ticket en OT

Una **orden de trabajo (OT)** es el trabajo formal que sale de un ticket: con alcance, responsable técnico, tareas con horas, fotos y, si se cobra, aprobación del cliente y facturación. Un ticket puede tener varias OT.

1. En el detalle del ticket pulsa **Convertir en OT** (si ya tiene una OT que no está cancelada, el botón dice **Crear otra OT**; también está en la tarjeta **OT vinculadas** del panel). En un ticket cerrado el botón está deshabilitado: reábrelo primero.
2. Elige el **tipo**: **Facturable · externa** (se cobra al cliente) o **Interna · no facturable**.
3. Revisa el **título** (viene del asunto), el **responsable técnico** (viene del responsable principal del ticket) y, si quieres, el **alcance**. Si el cliente tiene una bolsa de horas vigente y la OT es facturable, aparece la casilla **Descuenta de la bolsa**.
4. Pulsa crear. La app te lleva a la OT, que nace en **Borrador**. El estado del ticket no cambia.

## Qué pasa con las tareas

Al convertir, las **tareas pendientes** del ticket **pasan a la OT** (dejan de verse en el ticket). Las tareas **ya hechas se quedan** en el ticket como registro. El aviso del diálogo dice cuántas tareas pasarán. Al cancelar una OT, sus tareas pendientes se quedan en ella.

## La orden de trabajo

Arriba ves el código (`OT-0218`), el título, el tipo, la etapa, el ticket de origen, el responsable y el término (en rojo si ya pasó). Debajo, el avance por **etapas** y las tarjetas de la OT. A la derecha (en el celular, debajo) están la cotización, la aprobación, la facturación, el ticket de origen, las horas, los datos y el historial resumido.

**Etapas.** Una OT facturable pasa por Borrador, Cotizada, Aprobada, En ejecución y Cerrada (y, si se cobra, **Facturada**, que se muestra como último paso). Una interna pasa por Borrador, Aprobada, En ejecución y Cerrada. Desde los botones de la OT puedes:

- **Marcar como cotizada** (facturable en Borrador): por ahora la cotización se hace fuera de la app; el cotizador llega en una fase posterior. Exige que el cliente sea externo.
- **Volver a borrador** (facturable en Cotizada, por ejemplo si el cliente rechaza).
- **Iniciar ejecución** (OT Aprobada). Si la OT no tenía fecha de inicio, queda con la de hoy.

Aprobar, cerrar, cancelar y marcar como facturada requieren permisos de Coordinación o Administración: ver el [manual de coordinación](02-coordinacion.md). Si no tienes permiso, esos botones no aparecen y, en una interna en Borrador, verás "Pendiente de aprobación de …".

**Tipo y datos.** El **tipo** y el **cliente** solo se cambian en **Borrador**. Cambiar el tipo limpia los campos del otro tipo (la app te pide confirmar). Una OT facturable tiene cliente, contacto, N° de orden de compra, condición de pago y la casilla de bolsa ("12,5 / 20 h usadas este mes"); una interna tiene área solicitante, centro de costo y quién aprueba (una persona de Coordinación o Administración). Pulsa **Guardar** para aplicar los cambios. Con la OT cerrada o cancelada todo queda en solo lectura.

**Tareas con horas.** La tarjeta **Tareas** de la OT agrega las columnas **Est.** (horas estimadas) y **Real** (horas reales), en pasos de 0,25 h; se guardan al salir del campo. La cabecera suma ("Tareas · 2/4 · 10 h estimadas · 4 h reales"). Las horas que registras en el redactor se suman aparte como **horas registradas**. En una OT cerrada o cancelada solo se pueden marcar y desmarcar tareas, y el redactor no registra horas. En una OT aprobada o en ejecución, la OC del cliente, la condición de pago y "Descuenta de la bolsa" solo las cambia Coordinación o Administración.

**Fotos y archivos.** La tarjeta **Fotos y archivos** junta los archivos de la OT, los de sus seguimientos, el respaldo de la aprobación del cliente y los del ticket de origen, con pestañas **Todo**, **Fotos**, **Documentos** y **Correos**. **Subir fotos** abre la cámara en el celular; **Subir archivo** abre el selector. Se aplican los mismos tipos y límites que en los tickets.

**Seguimiento, notas y copiar al ticket.** La actividad de la OT funciona como la del ticket (Actividad, Seguimiento, Notas internas e Historial). En el redactor, la casilla **Copiar al ticket** envía el mismo mensaje también al ticket de origen ("El avance también queda en TK-1048"). Si no la marcaste, cada mensaje de la OT tiene el botón **Copiar al ticket**; una vez copiado muestra "Copiado al ticket" y no se puede copiar de nuevo. Se copian seguimientos y notas internas, cada uno con su tipo. La copia comparte los archivos del original y no repite las horas ni las menciones. En el ticket, el mensaje copiado indica "Seguimiento · desde OT-0218".

**OT vinculadas.** En el detalle del ticket, la tarjeta **OT vinculadas** lista sus OT con tipo, etapa, facturación y, en las cerradas, si resolvieron o no el ticket. En el Tablero y la Tabla, cada ticket muestra su OT ("OT-0218 · Facturable"): la abierta más reciente o, si no hay, la cerrada más reciente; una OT cancelada no se muestra.

## Lista de órdenes de trabajo

**Órdenes de trabajo** (`/ots`) es una vista de solo lectura de todas las OT, con filtros **Todas**, **Abiertas**, **Por facturar**, **Facturadas** e **Internas** (cada uno con su contador), búsqueda por código, título, cliente o ticket, y paginación. Cada fila abre la OT. Los cambios se hacen desde la OT, no desde la lista. La ficha de cada cliente tiene además una tarjeta con sus OT.

## Tablero

**Tickets** abre el **Tablero**, una vista de solo lectura con cuatro columnas: **Nuevo**, **En curso**, **En espera** y **Cerrados**. No se arrastra nada: cada tarjeta es un enlace al detalle del ticket, donde se cambia el estado. La tarjeta muestra código, prioridad, asunto, cliente, si tiene correo, de quién se espera (En espera), responsables, fecha límite y cantidad de mensajes. En **Cerrados** cada tarjeta indica el tipo de cierre: Resuelto, Descartado con su motivo, o Duplicado de otro ticket.

Puedes buscar por texto, filtrar por responsable, prioridad y **Tipo** (Ticket, OT facturable, OT interna), y activar **Solo míos** (tickets donde eres responsable o seguidor). Los filtros quedan en la dirección de la página, así que puedes compartirla. En pantallas angostas las columnas se desplazan hacia el lado.

## Tabla

**Tabla** muestra los mismos tickets en filas. Arriba hay filtros rápidos con contador: **Todos**, **Míos**, **Sin asignar**, **Vencen hoy**, **Vencidos**, **Con OT** y **Archivados**. Puedes buscar por código (`1048` o `TK-1048`) o por texto, **agrupar** por prioridad, estado, responsable, cliente, tipo o sin agrupar, y ordenar por **Vence**, **Prioridad** o **Actualizado**. También es de solo lectura: cada fila abre el ticket.

## Archivado a los 7 días

Un ticket cerrado se **archiva automáticamente** a los 7 días (una tarea nocturna lo hace). Desaparece del Tablero pero sigue en la Tabla, en el filtro **Archivados**, y se puede abrir y leer. Sigue aceptando seguimientos y notas. Si lo **reabres**, vuelve al Tablero en En curso. El historial muestra "El sistema archivó el ticket".
