# Bot de Telegram

Esta guía es para todas las personas que usan Zydesk. El bot de Telegram te trae los avisos al celular y te deja hacer, desde el chat, lo mismo que harías en la web con tu propia cuenta: nada más y nada menos. Para que exista, Administración debe haberlo configurado (ver el [manual de administración](../administracion.md#17-bot-de-telegram)); si en **Avisos** no aparece la tarjeta **Telegram**, todavía no está disponible.

## Vincular tu cuenta

La vinculación une tu cuenta de Zydesk con tu chat privado con el bot. Se hace una vez y dura hasta que la deshagas.

1. En Zydesk abre **Avisos** y, en la tarjeta **Telegram**, pulsa **Vincular Telegram**.
2. La app te muestra un **código de 8 caracteres** que vale **10 minutos** y sirve **una sola vez**. Tienes tres formas de usarlo:
   - En el celular, pulsa **Abrir en Telegram**: se abre el chat con el bot y basta con pulsar **Iniciar** (el código viaja solo).
   - En el computador, **escanea el código QR** con la cámara del celular: abre el mismo enlace.
   - O escribe tú en el chat con el bot: `/vincular CÓDIGO` (mayúsculas o minúsculas, da lo mismo; el código no usa las letras I y O ni los dígitos 0 y 1, para que no se confundan).
3. El bot responde "Listo, Nombre: tu cuenta quedó vinculada. Prueba /hoy" y borra tu mensaje con el código. El diálogo de la web se cierra solo.

**No compartas el código ni el QR**: quien lo use antes que tú vincula su chat a tu cuenta. Si se te vence o lo pierdes, cierra el diálogo y pide otro (hasta 5 cada 15 minutos). Si el bot dice "Código inválido o vencido", genera uno nuevo.

Un chat de Telegram solo puede estar vinculado a **una** cuenta de Zydesk. Si el bot responde "Este chat ya está vinculado a otra cuenta", esa cuenta debe desvincularse primero (desde su pantalla de Avisos o con `/desvincular`).

Al vincular, en **Perfil → Sesiones activas** aparece una sesión **Bot de Telegram**. Es la que usa el bot para actuar en tu nombre; vale 30 días sin uso y como máximo 90 días.

## Qué avisos llegan

Llegan los avisos que tengas activados en la columna **Telegram** de **Avisos → Preferencias** (ver [Primeros pasos](00-primeros-pasos.md#avisos)). Por defecto, todos salvo "Cambia el estado de un ticket que sigo" y "Nuevo seguimiento en un ticket que sigo". Cada mensaje dice quién, qué y en qué ticket u OT, con el código en negrita y un enlace **Abrir TK-1048** a la web; nunca incluye el texto de un mensaje o nota, un motivo ni un monto.

Además, con **Resumen diario** activado (solo existe por Telegram), a las **08:30 de lunes a viernes** recibes un mensaje con tus tickets que vencen hoy, los vencidos, las OT por aprobar, cuántas menciones tienes sin leer y tus tareas para hoy. No llega en feriados ni cuando no tienes nada pendiente. Es lo mismo que te muestra `/hoy`.

Los avisos siguen llegando aunque la sesión del bot haya terminado: dependen de la vinculación, no de la sesión.

## Comandos

Escríbelos en el chat con el bot (también aparecen en el menú de comandos de Telegram):

| Comando            | Qué hace                                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/hoy`             | Tu **Mi día** de hoy: Vencen hoy, Vencidos, Por aprobar (si puedes aprobar), Menciones sin leer y Tareas para hoy, hasta 5 por sección y "y N más"; con enlace **Abrir Mi día**. Si no tienes nada, lo dice.                                      |
| `/mis`             | Tus tickets abiertos (donde eres responsable o seguidor), ordenados por fecha límite, hasta 10: código, prioridad, estado, vencimiento y asunto; "y N más" con enlace a la Tabla.                                                                 |
| `/ticket 1048`     | La ficha de un ticket (también vale `/ticket TK-1048`): asunto, estado, prioridad, cliente, responsables, fecha límite, OT vinculadas, los **últimos 3 seguimientos** y el enlace a la web. Las **notas internas nunca** se muestran en Telegram. |
| `/vincular CÓDIGO` | Vincula tu cuenta (sección anterior). También sirve para renovar la sesión del bot cuando termina.                                                                                                                                                |
| `/desvincular`     | Quita la vinculación, con confirmación (más abajo).                                                                                                                                                                                               |
| `/ayuda`           | La lista de comandos y acciones.                                                                                                                                                                                                                  |

Cualquier otro texto recibe "No entendí. Escribe /ayuda". El bot solo responde en tu **chat privado**: si lo agregan a un grupo, no hace nada.

## Responder a un aviso registra un seguimiento

Usa **Responder** (deslizar el mensaje o mantenerlo pulsado → Responder) sobre un aviso del bot o sobre la ficha de `/ticket` (no sobre la lista de `/mis`, que tiene varios tickets) y escribe tu texto. El bot registra un **seguimiento** con ese texto, a tu nombre, en ese ticket u OT, y responde "Seguimiento registrado en TK-1048". Queda igual que si lo hubieras escrito en la web, visible en la actividad del ticket y para quienes lo siguen.

- Se registra siempre como **seguimiento**, nunca como nota interna, sin horas ni archivos. Si necesitas una nota interna, horas o adjuntos, hazlo desde la web.
- Si el mensaje que respondes no es un aviso ni una ficha (por ejemplo, el saludo del bot o la lista de `/mis`), el bot responde "Responde a un aviso o a la ficha de /ticket para registrar un seguimiento" y no registra nada.
- Un texto de más de 20.000 caracteres se recorta y el bot lo avisa.
- Si el ticket está cerrado, o la OT cerrada o cancelada, el bot te muestra el mismo mensaje de error que la web.

## Aprobar una OT desde el botón

Cuando alguien te elige para aprobar una **OT interna**, el aviso llega con dos botones: **Aprobar OT** y **Ver en la web**. **Aprobar OT** la aprueba al momento (sin iniciar la ejecución) y el mensaje cambia a "✓ OT-0219 aprobada por ti el 2 oct 10:15". Solo funciona si tienes permiso de aprobar (Coordinación y Administración) y la OT sigue en Borrador; si no, el bot lo dice. La aprobación del cliente de una OT facturable exige adjuntar el respaldo y se hace solo en la web ([manual de coordinación](02-coordinacion.md#registrar-la-aprobación-del-cliente-ot-facturable)).

## Crear un ticket reenviando un mensaje

Reenvía al bot un **mensaje de texto** de cualquier chat (por ejemplo, el pedido que te mandó alguien por Telegram). El bot pregunta "¿Crear un ticket con este texto?" mostrando la primera línea, que será el asunto, con los botones **Crear ticket** y **Cancelar**. Al confirmar, crea un ticket de origen interno y prioridad Media, con el texto completo como descripción, el nombre del remitente original como solicitante (si Telegram lo muestra) y tú como responsable principal; responde "Ticket TK-1054 creado" con el enlace para completar cliente, categoría y fecha límite en la web.

La pregunta vale 10 minutos; después hay que reenviar de nuevo. Por ahora solo se aceptan **textos**: una foto, un documento o un reenvío sin texto responde "Por ahora solo puedo crear tickets desde mensajes de texto".

## Desvincular

Escribe `/desvincular` y confirma con **Sí, desvincular**. Dejas de recibir avisos en ese chat y se cierra la sesión del bot; el historial de Zydesk no cambia. También puedes hacerlo desde la web, en **Avisos → Telegram → Desvincular**. Para volver, genera un código nuevo y vincula otra vez.

Si solo quieres que el bot **deje de actuar en tu nombre** pero seguir recibiendo avisos, cierra la sesión **Bot de Telegram** desde **Perfil → Sesiones activas**.

## Si el bot dice que tu sesión terminó

"Tu sesión del bot terminó (se cerró, caducó o desvinculaste la cuenta)" aparece cuando la sesión venció (30 días sin usar comandos o 90 días en total), la cerraste desde Sesiones activas, cambiaste tu contraseña, Administración cambió tu rol, o el bot se reinició con otra clave. Sigues recibiendo avisos; para volver a usar los comandos genera un código en **Avisos → Telegram** y envía `/vincular CÓDIGO`. La vinculación se mantiene.

Si la app te pide cambiar la contraseña o aceptar los términos, el bot te dirá que entres a la web primero. Si el bot responde "Zydesk no responde ahora", inténtalo en un momento o avisa a Administración.

## Lo que el bot no hace

Nada que no puedas hacer tú en la web con tu rol: usa tu propia sesión, así que respeta tus mismos permisos y todo lo que hagas queda registrado a tu nombre, igual que desde el navegador. No lee grupos ni canales, no muestra notas internas ni montos, no adjunta fotos ni archivos, no cambia estados de tickets ni registra horas. Para todo eso está la web.
