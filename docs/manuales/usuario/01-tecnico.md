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
| **Resuelto**  | Nada. (Más adelante, no se podrá resolver con una OT abierta.)                         |
| **Descartado** | Un motivo obligatorio (por ejemplo, "No corresponde: publicidad").                    |
| **Duplicado** | El ticket original; no puede ser el mismo ticket ni otro que ya sea duplicado.         |

Desde un ticket abierto puedes ir a cualquier otro estado. Desde uno cerrado (Resuelto, Descartado o Duplicado) solo a **En curso**: el botón se llama **Reabrir**. Un ticket cerrado no se puede editar (asunto, responsables, tareas) hasta reabrirlo.

## Tablero

**Tickets** abre el **Tablero**, una vista de solo lectura con cuatro columnas: **Nuevo**, **En curso**, **En espera** y **Cerrados**. No se arrastra nada: cada tarjeta es un enlace al detalle del ticket, donde se cambia el estado. La tarjeta muestra código, prioridad, asunto, cliente, si tiene correo, de quién se espera (En espera), responsables, fecha límite y cantidad de mensajes. En **Cerrados** cada tarjeta indica el tipo de cierre: Resuelto, Descartado con su motivo, o Duplicado de otro ticket.

Puedes buscar por texto, filtrar por responsable y prioridad, y activar **Solo míos** (tickets donde eres responsable o seguidor). Los filtros quedan en la dirección de la página, así que puedes compartirla. En pantallas angostas las columnas se desplazan hacia el lado.

## Tabla

**Tabla** muestra los mismos tickets en filas. Arriba hay filtros rápidos con contador: **Todos**, **Míos**, **Sin asignar**, **Vencen hoy**, **Vencidos** y **Archivados**. Puedes buscar por código (`1048` o `TK-1048`) o por texto, **agrupar** por prioridad, estado, responsable, cliente o sin agrupar, y ordenar por **Vence**, **Prioridad** o **Actualizado**. También es de solo lectura: cada fila abre el ticket.

## Archivado a los 7 días

Un ticket cerrado se **archiva automáticamente** a los 7 días (una tarea nocturna lo hace). Desaparece del Tablero pero sigue en la Tabla, en el filtro **Archivados**, y se puede abrir y leer. Sigue aceptando seguimientos y notas. Si lo **reabres**, vuelve al Tablero en En curso. El historial muestra "El sistema archivó el ticket".
