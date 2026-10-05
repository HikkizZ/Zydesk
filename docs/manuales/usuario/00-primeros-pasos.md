# Primeros pasos

Esta guía es para todas las personas que usan Zydesk.

## Ingresar

1. Abre la dirección de la aplicación que te entregó Administración.
2. Escribe tu **correo** y tu **contraseña** y pulsa **Ingresar**.
3. Si marcas **Mantener sesión iniciada en este equipo**, no tendrás que ingresar de nuevo durante varias semanas. Márcalo solo en tu propio equipo, nunca en uno compartido.

Por seguridad, si te equivocas varias veces seguidas la cuenta se bloquea un rato. Espera el tiempo que indica el mensaje e inténtalo otra vez.

## Tu primera contraseña (temporal)

Administración te entrega una **contraseña temporal**. Al ingresar con ella, la app te pedirá crear tu contraseña propia antes de continuar:

- Mínimo 10 caracteres.
- No puede ser igual a tu correo ni una contraseña muy común (como "password" o "1234567890").
- Conviene usar una frase larga que solo tú conozcas.

Al cambiarla se cierran tus otras sesiones abiertas.

## Aceptar los términos

La primera vez (y cada vez que cambien los textos) verás una ventana con los **Términos de uso** y la **Política de privacidad**. Léelos y acéptalos para continuar. Por ahora son borradores y lo dicen de forma visible. También puedes leerlos cuando quieras en `/terminos` y `/privacidad`.

## Tu perfil y tus sesiones

Abre **Perfil** (al pie del menú; en el celular, **Más → Perfil**). Ahí ves tus datos y tus **sesiones activas**: cada navegador o equipo donde has ingresado, con su nombre, desde cuándo y hasta cuándo vale.

- Si ves un dispositivo que no reconoces, o dejaste la sesión abierta en un equipo ajeno, cierra esa sesión desde su fila. La sesión **Bot de Telegram** es la que usa el bot en tu nombre: cerrarla detiene los comandos del bot, pero sigues recibiendo avisos (ver el [manual del bot](04-bot-telegram.md#desvincular)).
- **Cerrar las demás** deja abierta solo la sesión en la que estás.

## Cambiar tu contraseña

En **Perfil → Cambiar contraseña**: escribe la actual y la nueva. Al guardar, se cierran tus sesiones en otros dispositivos.

## Cerrar sesión

Pulsa **Cerrar sesión** al final de tu Perfil (en el celular también está en **Más**). Hazlo siempre que uses un equipo que no es solo tuyo.

## Si olvidaste tu contraseña

La aplicación no envía correos, así que no hay un enlace de recuperación. **Pide a Administración que la restablezca**: te dará una contraseña temporal y al ingresar elegirás una nueva.

## Mi día

**Mi día** es la pantalla con la que abre la app (también en el menú y en la barra inferior). Reúne lo tuyo para hoy:

- **Vencen hoy** y **Vencidos**: tickets abiertos donde eres responsable (principal o colaborador; seguir un ticket no basta) cuya fecha límite es hoy o ya pasó. Los vencidos no repiten los de hoy.
- **Por aprobar**: solo para quien puede aprobar OT internas; se explica en el [manual de coordinación](02-coordinacion.md#por-aprobar-en-mi-día).
- **Te mencionaron**: tus menciones sin leer (hasta 10); **Ver todos** abre Avisos con el filtro Menciones.
- **Tus tareas**: tareas abiertas a tu nombre en tickets y OT que no están cerrados, ordenadas por fecha (en rojo si la fecha pasó). La casilla las marca como hechas al momento; con rol Solo lectura la casilla está deshabilitada.
- **Detenidos hace días**: tickets tuyos abiertos (también En espera) sin ningún cambio en más de 3 días y que no estén ya en Vencen hoy o Vencidos.

Los cuadros de arriba muestran los totales y llevan a cada lista. La pantalla se actualiza sola cada minuto. Si no tienes nada pendiente dice "Nada pendiente por hoy".

## Avisos

**Avisos** (menú o barra inferior; el número rojo indica cuántos no has leído, `99+` desde 100) junta lo que te pasa a ti:

| Aviso                                     | Cuándo llega                                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Me asignan un ticket o una tarea          | Te agregan como responsable de un ticket, como seguidor, te asignan una tarea o te piden aprobar una OT interna |
| Me mencionan con @                        | Alguien te menciona en un seguimiento o una nota interna (de un ticket o una OT)                           |
| Un ticket mío vence en 24 horas           | Eres responsable principal y faltan menos de 24 horas para la fecha límite                                 |
| Un ticket mío venció                      | Eres responsable principal y la fecha límite pasó                                                          |
| Cambia el estado de un ticket que sigo    | Cambia el estado de un ticket donde eres responsable o seguidor; también cuando se cierra o cancela su OT   |
| Nuevo seguimiento en un ticket que sigo   | Alguien registra un seguimiento (no una nota interna) en un ticket donde eres responsable o seguidor       |
| Cotización aprobada o rechazada           | El cliente responde la cotización de una OT de un ticket donde eres responsable o seguidor                 |
| OT cerrada y lista para facturar          | Solo para quien puede marcar OT como facturada                                                             |

Nunca recibes un aviso por algo que hiciste tú (si te asignas un ticket o cambias el estado de uno tuyo, no hay aviso). El aviso dice quién, qué y en qué ticket u OT, pero **nunca** incluye el texto de un mensaje o nota, un motivo ni un monto.

- Los chips **Todos · Menciones · Asignaciones · Vencimientos** y el interruptor **Solo sin leer** filtran la lista; **Cargar más** trae los siguientes.
- Al pulsar un aviso se marca leído y te lleva al ticket, la OT o el mensaje. **Marcar todo como leído** limpia el contador. Entrar a la pantalla no marca nada por sí solo.
- **Preferencias** (a la derecha; en el celular, pestaña **Preferencias**): dos interruptores por cada tipo de aviso, **En la app** y **Telegram**. Apagar **En la app** hace que ese aviso no aparezca ni cuente; **Telegram** solo tiene efecto si vinculaste tu cuenta. El **Resumen diario** (08:30, lunes a viernes) existe solo por Telegram.

### Vincular Telegram

En la tarjeta **Telegram** de Avisos, **Vincular Telegram** te da un código de un solo uso (y un QR en el computador) para unir tu cuenta con el bot de Zydesk en Telegram. Desde ahí recibes los avisos en el celular y puedes usar comandos como `/hoy`, responder un aviso para registrar un seguimiento o aprobar una OT con un botón. Todo está en el [manual del bot de Telegram](04-bot-telegram.md). Si la tarjeta no aparece, Administración aún no configuró el bot.

## Ayuda

**Ayuda** (al pie del menú; en el celular, **Más → Ayuda**) abre estos manuales dentro de la app, con una pestaña por cada manual de tu rol y un índice de la página.

## En el celular

En pantallas pequeñas el menú pasa a una barra inferior con **Mi día**, **Tickets**, **Avisos** y **Nuevo**. El botón **Más** abre el resto: Perfil, Clientes, Horas, Reportes, Configuración (según tu rol), **Ayuda** y **Cerrar sesión**.

## Reportes

**Reportes** (menú lateral; en el celular, **Más → Reportes**) muestra las cifras del equipo por período, departamento, cliente y persona: tickets cerrados, resolución promedio en días hábiles, % dentro de plazo, horas facturables, carga de cada persona y una tabla por cliente con lo facturado y lo por facturar, y permite exportarlo a `.xlsx`. Lo ven Administración, Coordinación y **Solo lectura**, con los montos incluidos; los técnicos no tienen esta pantalla. Qué significa cada indicador está en el [manual de coordinación](02-coordinacion.md#reportes).

## Trabajar con tickets

Crear tickets (también desde un correo), registrar seguimientos y notas, tareas, horas, estados, Tablero y Tabla están explicados en el [manual de tickets para el equipo](01-tecnico.md).
