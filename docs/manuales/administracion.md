# Manual de administración

Para las personas con rol **Administración**. Explica cómo dejar la aplicación lista y cómo mantener la configuración sin ayuda del desarrollador. Las capturas de pantalla se agregarán en la Fase 8.

Casi todo se hace en **Configuración** (menú lateral o, en el celular, botón **Más**). Esa sección solo aparece para Administración.

## 1. Primer ingreso y primer usuario

La primera cuenta de Administración no se crea desde la pantalla, porque todavía no hay nadie que pueda ingresar. La crea quien instala la aplicación, una sola vez, con un comando:

1. En el archivo `.env` se escribe la contraseña inicial en la línea `ADMIN_PASSWORD=` (mínimo 10 caracteres, distinta del correo y no una contraseña común).
2. Se ejecuta (cambiando el correo y el nombre por los reales):

   ```
   npm run db:admin -- --correo admin@ejemplo.cl --nombre "Nombre Apellido"
   ```

3. Si falta `ADMIN_PASSWORD`, el comando se detiene con un error y no crea nada.
4. Con ese correo y contraseña se ingresa en la pantalla **Ingresar**. La app pide aceptar los Términos de uso la primera vez. Esta cuenta no obliga a cambiar la contraseña, pero conviene cambiarla desde **Perfil** y borrar después el valor de `ADMIN_PASSWORD` del `.env`.

Desde entonces, las demás cuentas se crean desde la pantalla (sección 2).

## 2. Crear cuentas y roles

En **Configuración → Equipo y permisos**:

1. Pulsa **+ Agregar persona**.
2. Escribe nombre, correo (es el identificador para ingresar; la app **no envía correos**), rol y departamento.
3. La app genera una **contraseña temporal** y la muestra **una sola vez**. Pulsa **Copiar** y entrégasela a la persona por un medio seguro (en persona o por mensaje directo). Si la pierdes, deberás restablecerla (sección 3).
4. La persona, al ingresar, debe aceptar los términos y elegir su propia contraseña.

Para cambiar el rol o el departamento de alguien, usa los selectores de su fila. **Cambiar el rol cierra las sesiones abiertas de esa persona**: tendrá que ingresar de nuevo.

### Qué puede hacer cada rol

| Acción                               | Administración | Coordinación | Técnico | Solo lectura |
| ------------------------------------ | :------------: | :----------: | :-----: | :----------: |
| Crear y editar tickets               |       ✓        |      ✓       |    ✓    |      –       |
| Registrar seguimiento y notas        |       ✓        |      ✓       |    ✓    |      –       |
| Asignar responsables                 |       ✓        |      ✓       |    ✓    |      –       |
| Convertir ticket en OT               |       ✓        |      ✓       |    ✓    |      –       |
| Aprobar cotizaciones y OT internas   |       ✓        |      ✓       |    –    |      –       |
| Cerrar OT                            |       ✓        |      ✓       |    –    |      –       |
| Marcar OT como facturada             |       ✓        |      ✓       |    –    |      –       |
| Ver reportes y montos                |       ✓        |      ✓       |    –    |      ✓       |
| Cambiar configuración (esta sección) |       ✓        |      –       |    –    |      –       |

Algunas de estas acciones llegan en fases posteriores; la matriz ya está aplicada. Todas las personas pueden ver la lista de clientes; Técnicos y Coordinación también pueden agregar contactos a un cliente.

## 3. Restablecer una contraseña

Como no hay correo saliente, si alguien olvida su contraseña:

1. En **Equipo y permisos**, abre el menú `⋯` de su fila y elige **Restablecer contraseña**; confirma.
2. La app muestra una **contraseña temporal una sola vez**. Cópiala y entrégala a la persona.
3. Se cierran todas sus sesiones. Al ingresar con la temporal, **debe crear una contraseña nueva** antes de usar la app.

Nunca pidas ni guardes la contraseña definitiva de nadie: la temporal existe justamente para que nadie más conozca la real.

## 4. Desactivar y reactivar personas

Menú `⋯` de la fila → **Desactivar**. La persona deja de poder ingresar y se cierran sus sesiones; su historial se conserva. Para verla de nuevo en la lista, activa **Mostrar inactivos**, y usa **Reactivar** si vuelve.

La app no deja desactivar tu propia cuenta ni a la última persona con rol Administración, ni quitarle ese rol: siempre debe quedar al menos una.

## 5. Departamentos y horarios

En **Configuración → Departamentos y horarios**. Cada departamento tiene:

- **Horario por día**: entrada, salida, colación (hora de inicio y minutos) y un interruptor para marcar el día como trabajado o libre. La app calcula las horas de cada día y la **jornada semanal**.
- **Horario extendido desde**: desde esa hora se consideran "extendidas" las horas registradas (se cobra tarifa de horario extendido).
- **Tiempo disponible para tickets (%)**: el resto se reserva para reuniones y trabajo interno; se usa para calcular la carga de cada persona.

Qué afecta: el horario, la colación y los feriados se usan para **contar los plazos en horas hábiles**.

Un departamento solo se puede **eliminar** si no tiene personas (activas o inactivas); si las tiene, el botón aparece deshabilitado.

## 6. Feriados

En la tarjeta **Feriados** del mismo lugar. Hay dos tipos:

- **General**: vale para todos los departamentos.
- **Solo este departamento**: marca la casilla al agregarlo.

Los feriados no cuentan como días hábiles en los plazos. La app viene con los feriados legales nacionales de 2026 y 2027.

**Revísalos cada año.** Antes de que termine el año, agrega los del siguiente y compáralos con el listado oficial (como referencia sirve `https://api.boostr.cl/holidays/{año}.json`, cambiando `{año}` por el número, por ejemplo 2028). Los feriados pueden cambiar por ley durante el año, por lo que conviene volver a mirar. Si no hay feriados cargados para un año, los plazos tratarán esos días como hábiles.

## 7. Clientes, contactos, bolsa de horas y tarifas

En el menú **Clientes**. Los clientes y las **áreas internas** (por ejemplo, Marketing) se muestran en grupos separados. Puedes buscar por nombre o por RUT (con o sin puntos y guion).

- **Nuevo cliente** (solo Administración): el nombre es obligatorio y único; el RUT, si se escribe, debe ser válido y no repetirse. En un área interna no se piden RUT, dirección ni condiciones de pago.
- **Desactivar** un cliente lo oculta de la lista (se ve con **Mostrar inactivos**); los clientes nunca se borran, porque los tickets futuros los usarán.
- **Contactos**: personas del cliente con su área, correo, teléfono y si **aprueban cotizaciones**. Pueden agregarlos Administración, Coordinación y Técnicos.
- **Bolsa de horas** (opcional): un contrato mensual de horas de soporte. Se agrega con **Agregar bolsa** (Administración o Coordinación): horas al mes, fecha desde la que rige y, si corresponde, hasta cuándo y fecha de renovación. Solo puede haber **una vigente a la vez**: si las fechas se solapan con otra, la app avisa. Para renovar, cierra el contrato anterior poniéndole fecha de término y agrega el nuevo. El cálculo de horas usadas llegará junto con las órdenes de trabajo.
- **Tarifas por cliente**: en **Editar tarifas** se fijan valores propios para hora normal, horario extendido, fin de semana/urgencia y traslado por km. Si dejas marcada **Usar tarifa global**, el cliente usará la tarifa general. Los montos se entienden **más IVA**. La aplicación no trae tarifas cargadas: las define cada organización.

## 8. Categorías y plazos

En **Configuración → Categorías y plazos**. Cada categoría (por ejemplo "Correo" o "Redes") tiene:

- **Responsable por defecto**: quién recibe por defecto los tickets de esa categoría (una persona activa).
- **Plazo de primera respuesta**: un solo plazo, en horas o días.
- **Plazo de resolución** para cada prioridad: Urgente, Alta, Media y Baja.

Los plazos se cuentan en **horas hábiles**: el reloj solo corre dentro del horario del departamento, sin la colación y sin feriados ni días libres. Por eso "1 día hábil" no equivale a 24 horas seguidas.

Al crear o editar una categoría, la **vista previa** dice cuándo vencería un ticket de prioridad Alta si entrara ahora. Úsala para comprobar que los plazos tengan sentido. Las categorías no se borran: se **desactivan** (y se ven con **Mostrar inactivas**).

## 9. Numeración y marca

En **Configuración → Numeración y marca**.

**Marca**: el nombre visible de la aplicación (aparece en la pantalla de ingreso) y un logo opcional (PNG, JPEG o SVG de hasta 200 KB).

**Numeración** de tickets y órdenes de trabajo (OT): prefijo (por ejemplo `TK-`), número inicial, cantidad de dígitos (de 3 a 8) y, solo para tickets, el modo. Reglas:

- Los cambios **solo afectan a códigos futuros**; nunca se renumera lo ya creado.
- El **número inicial** debe ser mayor que el último usado; si no, la app lo rechaza.
- Si bajas los **dígitos** y algún número existente no cabe, la app lo rechaza. Si un número supera los dígitos, simplemente crece (`TK-123456`).
- **Modo correlativo**: 1000, 1001, 1002…
- **Modo aleatorio** (solo tickets): los números no revelan cuántos tickets hay. La pantalla muestra "usados / capacidad" y advierte al superar el 50 %; al llegar al 95 % no se podrán crear tickets hasta aumentar los dígitos. En este modo, un número mayor no significa un ticket más reciente: se ordena por fecha.
- Las OT siempre son correlativas. Las cotizaciones derivan de su OT (`COT-0218 v1`).

La tarjeta **Historial de cambios de numeración** lista quién cambió qué y cuándo.

## 10. Ingresos y registro de seguridad

En **Equipo y permisos**, el enlace **Ver ingresos y registro de seguridad** abre una tabla con: ingresos correctos y fallidos, cuentas bloqueadas, cierres de sesión, cambios y restablecimientos de contraseña, altas, bajas y cambios de rol de personas, aceptación de términos, y cambios de configuración. Cada fila guarda fecha y hora, persona, dirección IP y un detalle (por ejemplo, el navegador). Nunca se guardan contraseñas.

Puedes filtrar por acción, persona, correo y fechas. **Estos registros se conservan 1 año** y luego se borran automáticamente. No se pueden editar ni borrar desde la app.

Protecciones automáticas: tras 5 intentos fallidos seguidos la cuenta se bloquea un tiempo que va aumentando, y una misma dirección tiene un máximo de 20 intentos cada 15 minutos.

## 11. Términos y privacidad

Los textos están en los archivos `docs/legal/terminos-de-uso.md` y `docs/legal/politica-de-privacidad.md`, y se ven en la app en `/terminos` y `/privacidad`. **Hoy son borradores** con textos marcador (por ejemplo `[RESPONSABLE DEL TRATAMIENTO]`); deben ser revisados por quien corresponda antes de cargar datos reales.

Cada persona acepta una sola vez ambos documentos. Para pedir una nueva aceptación a todo el equipo: edita el texto, cambia la línea `version:` al inicio de `terminos-de-uso.md` y vuelve a iniciar la API. Todas las personas verán el diálogo de aceptación. Más detalles en `docs/legal/README.md`.

## 12. Tickets: archivos, correos y archivado

**Dónde se guardan los archivos.** Las fotos, documentos y correos de los tickets se guardan en disco, en la carpeta indicada por `ARCHIVOS_DIR` en el archivo `.env` (por defecto `./datos/archivos`, dentro del repositorio; también puede ser una ruta absoluta). Dentro se organizan por año y mes (`aaaa/mm/`) con nombres aleatorios: el nombre original solo se guarda en la base de datos. La carpeta `datos/` no se versiona. **Respáldala junto con la base de datos**: si falta un archivo en disco, el ticket sigue existiendo pero la descarga falla. Si cambias `ARCHIVOS_DIR`, mueve antes el contenido y reinicia la API.

**Límites.** Hasta 10 archivos por subida y 20 MB cada uno. Tipos permitidos: JPG, PNG, WebP, HEIC, PDF, Word, Excel, PowerPoint, ZIP, `.eml`, `.msg`, `.txt` y `.csv`. La app revisa el contenido real del archivo, no solo la extensión: un ejecutable renombrado como `.png` se rechaza.

**Archivos huérfanos.** Un archivo subido que nunca se usó en un ticket, seguimiento o nota (por ejemplo, alguien abandonó el formulario) se elimina automáticamente a las 24 horas; la tarea corre cada noche a las 04:00 (hora de Santiago).

**Espacio en disco.** Los archivos de tickets no se borran solos. Revisa de vez en cuando el tamaño de `ARCHIVOS_DIR` y el espacio libre del disco.

**Descargas.** Cualquier persona con sesión puede ver y descargar los archivos de los tickets. Las descargas de documentos y correos (no las fotos ni los PDF que se abren en pantalla) quedan en el registro de seguridad.

**Archivado de tickets.** Un ticket cerrado (Resuelto, Descartado o Duplicado) se archiva solo a los 7 días; la tarea corre cada noche a las 03:10 (hora de Santiago). Archivado significa que sale del Tablero y se ve en la Tabla, filtro **Archivados**; no se borra nada y se puede reabrir. El estado de un ticket se cambia únicamente desde su detalle (el Tablero y la Tabla son de solo lectura).

**Crear tickets desde correos.** No hay un buzón conectado: la persona arrastra un `.eml`/`.msg` o pega el texto del correo al crear el ticket (ver el [manual de tickets](usuario/01-tecnico.md)).

## 13. Órdenes de trabajo

**Numeración.** Las OT (`OT-0218`) siempre son correlativas y se configuran en **Configuración → Numeración y marca**, igual que los tickets (sección 9). El número inicial debe ser mayor que el último usado; los cambios solo afectan a códigos futuros. Una conversión que falla no consume número.

**Quién puede qué** (matriz de la sección 2):

- **Convertir un ticket en OT, editarla, cambiar sus etapas simples** (marcar como cotizada, volver a borrador, iniciar ejecución), **gestionar sus tareas, mensajes y archivos**: quien puede editar tickets (Administración, Coordinación y Técnico).
- **Aprobar** (OT interna y aprobación del cliente de una facturable): permiso de aprobar (Administración y Coordinación). La persona elegida como "quién aprueba" debe tener ese permiso; con todo, cualquiera que lo tenga puede aprobar.
- **Cerrar** y **cancelar**: permiso de cerrar OT (Administración y Coordinación). Cancelar se considera una forma de cierre.
- **Marcar como facturada**: permiso de facturar (Administración y Coordinación).
- **Solo lectura** ve todas las OT, sus notas internas y sus archivos, sin poder cambiar nada.

**Ticket y OT.** Mientras un ticket tenga una OT abierta (que no esté Cerrada ni Cancelada) no se puede resolver, descartar ni marcar como duplicado. Si hay que desbloquearlo, se cierra o cancela la OT.

**Facturación.** Una OT facturable cerrada queda **Por facturar** aunque no haya resuelto el ticket; al cancelarla pasa a "No aplica". Marcar como facturada solo registra el número de factura: la app no emite documentos tributarios.

**Bolsa de horas.** La casilla **Descuenta de la bolsa** de una OT solo aparece si el cliente tiene una bolsa vigente (sección 7). La OT muestra las horas usadas en el mes por las OT que descuentan de esa bolsa; la ficha del cliente aún no las muestra.

**Archivos de OT.** Las fotos y documentos de las OT se guardan en la misma carpeta `ARCHIVOS_DIR` y con las mismas reglas que los de los tickets (sección 12): mismos tipos, límites, huérfanos de 24 horas y respaldo. Cualquier persona con sesión puede verlos y descargarlos; las descargas de documentos y correos quedan en el registro de seguridad. Al copiar un mensaje de la OT al ticket no se duplican los archivos.

**Lo que todavía no existe.** Cotizador y montos, planilla de horas, avisos y la pantalla completa de OT con indicadores y exportación llegan en fases posteriores. La lista `/ots` es una vista de solo lectura.

Los manuales de uso son el [manual de tickets](usuario/01-tecnico.md) y el [manual de coordinación](usuario/02-coordinacion.md).

## 14. Referencia de la API

Para integraciones y el bot futuro: con sesión de Administración, abre `/api/docs` (por ejemplo `http://localhost:3010/api/docs`) para ver todas las rutas. La guía de uso está en `docs/api/README.md`.
