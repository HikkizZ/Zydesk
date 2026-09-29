# Trazo — Contexto completo de la aplicación

> Documento para entregar a Claude (u otro equipo de desarrollo) junto con el diseño exportado.
> Describe el propósito, las reglas de negocio, las pantallas y el modelo de datos. El diseño (lienzo "Gestión de tickets y OT") es la referencia visual; este documento es la referencia funcional. Si ambos se contradicen, pregunta antes de decidir.
>
> "Trazo" es un nombre provisorio. Todo lo que aparece entre corchetes (`[RUT]`, `[DOMINIO]`, `[TARIFA]`, `[CORREO DE AVISOS]`, etc.) es un dato real pendiente que no debe inventarse.

---

## 1. Propósito

Trazo es una aplicación web interna para un equipo de unas 10 personas que atiende solicitudes (de clientes externos y de áreas internas) que hoy llegan principalmente por correo.

**Problema que resuelve**
- Las solicitudes se pierden o se duplican en bandejas de correo personales.
- Nadie sabe con certeza quién está a cargo de qué, ni en qué estado está cada solicitud.
- El trabajo que se cobra (y el que no) no queda registrado de forma ordenada: horas, cotizaciones, aprobaciones y facturación viven en planillas sueltas.

**Objetivo**: **trazabilidad y transparencia**. Cada solicitud tiene un responsable, un estado, un historial completo de cambios y una línea de tiempo visible para todo el equipo. Cuando una solicitud requiere un trabajo formal, se convierte en una Orden de Trabajo (OT) que puede ser facturable (externa) o interna, con su cotización, aprobación, horas y cierre.

**Principios**
1. **Una sola fuente oficial.** La app web es el registro oficial. Cualquier canal adicional (bot, correo) solo notifica o registra hacia la app.
2. **Todo deja rastro.** Cada cambio de estado, prioridad, responsable, fecha o tipo se guarda en el historial con autor y hora.
3. **Sin conexión al correo de la organización.** Los correos se adjuntan como archivo (.msg / .eml) o se pegan como texto. La app no lee buzones. Sí puede enviar correos de aviso desde una casilla propia.
4. **Simple para 10 personas.** Nada de configuraciones empresariales complejas; los valores por defecto deben funcionar.

---

## 2. Usuarios y roles

Equipo de ~11 personas organizado en **departamentos** (ejemplo: Soporte TI, Terreno, Coordinación). Cada persona pertenece a un departamento y tiene un **rol**.

| Acción | Administración | Coordinación | Técnico | Solo lectura |
|---|:-:|:-:|:-:|:-:|
| Crear y editar tickets | ✓ | ✓ | ✓ | – |
| Registrar seguimiento y notas internas | ✓ | ✓ | ✓ | – |
| Asignar responsables | ✓ | ✓ | ✓ | – |
| Convertir ticket en OT | ✓ | ✓ | ✓ | – |
| Aprobar cotizaciones y OT internas | ✓ | ✓ | – | – |
| Cerrar OT | ✓ | ✓ | – | – |
| Marcar OT como facturada | ✓ | ✓ | – | – |
| Ver reportes y montos | ✓ | ✓ | – | ✓ |
| Cambiar configuración | ✓ | – | – | – |

- Las cuentas las crea Administración (no hay registro abierto).
- Ingreso con cuenta Microsoft de la organización (solo identidad, sin acceso al correo) y, como alternativa, correo y contraseña.

---

## 3. Glosario

| Término | Significado |
|---|---|
| **Ticket** (`TK-####`) | Solicitud entrante. Unidad básica de trabajo y trazabilidad. |
| **OT** (`OT-####`) | Orden de trabajo creada desde un ticket cuando el trabajo requiere formalizarse. Puede ser **Facturable · externa** o **Interna · no facturable**. |
| **Cotización** (`COT-####`, con versiones v1, v2…) | Detalle de líneas y montos de una OT facturable. Se descarga como planilla Excel y PDF. |
| **Seguimiento** | Registro oficial del avance de un ticket u OT: qué se hizo, qué se acordó, qué respondió el cliente. Puede incluir fotos y archivos. Puede incluirse en reportes al cliente. |
| **Nota interna** | Contexto solo para el equipo (costos, dudas, opiniones). Nunca se incluye en reportes al cliente. Se distingue visualmente (fondo ámbar claro y candado). |
| **Historial** | Registro automático de cambios (estado, prioridad, responsables, fechas, vínculos a OT). No lo escribe nadie a mano. |
| **Tarea** | Paso concreto dentro de un ticket u OT, con responsable, fecha y (en OT) horas estimadas/reales. |
| **Responsable principal** | El primero de los responsables. Recibe avisos de vencimiento. Un ticket puede tener varios responsables. |
| **Seguidor** | Persona que recibe avisos de un ticket sin ser responsable. |
| **Departamento** | Grupo de personas con un horario común. Define la jornada, horario extendido, capacidad para tickets y feriados. |
| **Bolsa de horas** | Contrato de soporte por horas de un cliente (ej.: 20 h/mes). |

---

## 4. Reglas de negocio

### 4.1 Ticket

**Campos**: asunto, descripción, solicitante (nombre y correo), cliente o área interna, origen (externo / interno), prioridad, categoría, inicio planificado, fecha límite, horas estimadas, responsables (≥1, uno principal), seguidores, correo adjunto (opcional), archivos, tareas.

**Prioridades**: Urgente, Alta, Media, Baja. Se muestran siempre con texto además del color.

**Estados**

| Estado | Significado |
|---|---|
| Nuevo | Recién creado, sin trabajo iniciado. |
| En curso | Alguien está trabajando en él. |
| En espera | Bloqueado por un tercero. Debe indicar **de quién se espera** (cliente, proveedor, repuesto, aprobación). |
| Resuelto | Problema solucionado. |
| Descartado | Cerrado sin resolver porque no corresponde (spam, error, fuera de alcance). Requiere motivo. |
| Duplicado | Cerrado por ser el mismo caso que otro ticket. Requiere indicar el ticket original. |

- Resuelto, Descartado y Duplicado son **estados cerrados**. Los tickets cerrados se **archivan automáticamente 7 días** después de cerrarse (salen del Kanban, siguen en búsqueda y tabla con filtro "Archivados").
- Si se intenta marcar como Resuelto un ticket con una OT abierta, la app debe advertirlo y preguntar si cerrar o cancelar la OT primero.
- Si faltan el inicio planificado o las horas estimadas, se usan los plazos de la categoría contados en horas hábiles del departamento del responsable principal.

**Plazos por categoría** (configurables): cada categoría define un responsable por defecto, un plazo de primera respuesta y un plazo de resolución (por prioridad), expresados en horas o días **hábiles** según el horario del departamento y el calendario de feriados.

### 4.2 Correo adjunto (sin integración con Outlook)

- Al crear un ticket se puede **arrastrar un archivo .msg o .eml** o **pegar el texto** del correo.
- La app extrae: remitente, destinatario, fecha, asunto, cuerpo y archivos adjuntos del correo.
- Con eso **autocompleta** asunto, solicitante (nombre y correo) y descripción; el usuario revisa antes de crear.
- El archivo original queda guardado en el ticket y se puede descargar. Opcionalmente se guardan también los adjuntos internos del correo.
- La app **no** se conecta al buzón de la organización ni lee correos por su cuenta.

### 4.3 Actividad del ticket

La vista de actividad mezcla, en orden cronológico:
- **Seguimientos** (con fotos/archivos opcionales),
- **Notas internas**,
- **Eventos de historial** (automáticos, con valor anterior → nuevo).

Pestañas de filtro: Actividad (todo), Seguimiento, Notas internas, Historial. El redactor alterna entre "Seguimiento" y "Nota interna" y cambia de color según el modo. Se puede mencionar con `@` (genera aviso), adjuntar fotos y registrar horas.

### 4.4 Tareas

- Un ticket puede tener tareas: título, responsable, fecha, estado hecho/no hecho. Se pueden agregar, marcar y quitar.
- Una OT tiene tareas con además **horas estimadas y horas reales**.
- Al convertir un ticket en OT, **las tareas abiertas del ticket pasan a la OT**.

### 4.5 Orden de trabajo (OT)

- **Siempre nace desde un ticket** ("Convertir en OT"). Queda **vinculada en ambos sentidos**: el ticket muestra sus OT vinculadas y la OT muestra su ticket de origen. El historial del ticket registra la conversión.
- **Un ticket puede tener varias OT** (por ejemplo, si la primera no resolvió el problema).
- **Tipo** (se elige al crear, se puede cambiar mientras está en Borrador):
  - **Facturable · externa**: se cotiza, el cliente aprueba, se ejecuta, se cierra y se factura. Campos: cliente, contacto, N° de OC del cliente, condición de pago, contrato.
  - **Interna · no facturable**: trabajo para la propia organización. Campos: centro de costo, área solicitante, quién aprueba. Se controla en horas y costo interno (horas × tarifa interna), sin IVA ni envío al cliente.
- **Etapas**
  - Facturable: Borrador → Cotizada → Aprobada por cliente → En ejecución → Cerrada → Facturada.
  - Interna: Borrador → Aprobada → En ejecución → Cerrada.
- **Aprobación del cliente** (facturable): se registra quién aprobó (contacto del cliente), la fecha, la forma (orden de compra, correo de aprobación o cotización firmada) y un **respaldo adjunto** obligatorio.
- **Fotos y archivos**: galería con filtros (Fotos, Documentos, Correos). "Subir fotos" abre la cámara en celular.
- **Seguimiento de la OT**: igual que en el ticket (texto, fotos, horas), con la opción "Copiar al ticket" para que el avance también quede en el ticket de origen.
- **Historial de la OT**: automático.

### 4.6 Cierre de una OT (regla clave)

Al cerrar una OT, la app muestra un diálogo que **obliga a responder**: *¿Esta OT resolvió el ticket?*

- **Sí** → la OT pasa a Cerrada y el **ticket pasa a Resuelto**. El resumen de cierre queda como último seguimiento del ticket.
- **No, o solo en parte** → la OT pasa a Cerrada y el **ticket sigue abierto**. Se elige qué pasa con él: vuelve a En curso, pasa a En espera, o se crea una **nueva OT vinculada**. Se elige el responsable del siguiente paso.
- **En ambos casos**:
  - El **resumen de cierre es obligatorio**.
  - Se registra en el historial del ticket: "OT-#### cerrada · resolvió / no resolvió el ticket" con el resumen.
  - Se avisa a los responsables y seguidores del ticket.
  - **Resolver el ticket y facturar son independientes**: una OT facturable cerrada queda **"Por facturar"** aunque no haya resuelto el ticket, porque el trabajo se hizo.

Antes de confirmar, el diálogo muestra un bloque "Qué va a pasar" con el efecto sobre la OT, el ticket, el historial y los avisos.

### 4.7 Cotizador

- Pertenece a una OT facturable. Versionado (v1, v2…); "Duplicar como v2" para cambios después de enviar.
- Encabezado: cliente, contacto, fecha de emisión, validez (15 o 30 días), moneda (CLP; opción UF).
- **Líneas**: tipo (Mano de obra, Material, Servicio, Traslado), descripción, cantidad, unidad (h, un, km, gl), precio unitario, descuento %, total de línea. Se agregan y eliminan líneas; todo se recalcula en vivo.
- **Totales**: subtotal, descuentos, neto, IVA 19% (se puede desactivar para casos exentos), total.
- Condiciones comerciales (texto que sí va en la planilla) y nota interna del cotizador (no va en la planilla).
- "Importar horas de las tareas de la OT" para crear líneas de mano de obra.
- Plantillas de cotización (Configuración) para partir con líneas típicas.
- **Descargas**: planilla Excel (.xlsx) con datos del cliente, líneas, totales con IVA y condiciones; y PDF para el cliente. Cada descarga queda registrada en el historial de la OT.
- Formato de montos: pesos chilenos con punto como separador de miles (`$565.250`).

### 4.8 Horas y horarios

- **Horario por departamento** (Configuración → Departamentos y horarios): por cada día, activo/inactivo, entrada, salida y colación. La **jornada semanal se calcula** automáticamente. Además: hora desde la que corre el **horario extendido** (aplica tarifa extendida), **% de la jornada disponible para tickets** (capacidad) y **calendario de feriados** (Chile por defecto).
- Ese horario se usa para: contar plazos en horas hábiles, calcular la carga y capacidad de cada persona, marcar horas fuera de jornada.
- **Registro de horas**: planilla semanal por persona. Filas = ticket u OT (o "Sin ticket" para reuniones/interno); columnas = días; totales por fila, por día (frente a la jornada del día) y por semana. Separa horas **facturables** (en OT facturables), **internas** y **fuera de horario**.
- Las horas registradas en una OT se suman a sus tareas y al informe de facturación. Se pueden editar hasta el cierre de mes.
- Coordinación puede ver las horas de cualquier persona.

### 4.9 Clientes

Ficha de cliente: nombre, RUT, dirección; contrato (ej.: soporte por horas con bolsa mensual, horas usadas vs disponibles, fecha de renovación); condiciones comerciales (tarifas acordadas, condición de pago, si exige OC para facturar); contactos (nombre, área, correo, si aprueba cotizaciones); tickets y OT del cliente. Las **áreas internas** aparecen en la misma lista, separadas.

### 4.10 Avisos

- Centro de avisos con filtros (Todos, Menciones, Asignaciones, Vencimientos), no leídos destacados y "Marcar todo como leído".
- Preferencias por persona, por evento y por canal (en la app / correo):
  - Me asignan un ticket o tarea
  - Me mencionan con @
  - Un ticket mío vence en 24 h / venció
  - Cambia el estado de un ticket que sigo
  - Nuevo seguimiento en un ticket que sigo
  - Cotización aprobada o rechazada
  - OT cerrada y lista para facturar
- Resumen diario por correo (ej.: lunes a viernes 08:30).
- Los correos salen desde `[CORREO DE AVISOS]`; la app solo envía, no lee.

### 4.11 Numeración y formatos

- Prefijos: `TK-`, `OT-`, `COT-` + correlativo de 4 dígitos. Configurables.
- Fechas en español de Chile ("29 sep 2026", "martes 29 de septiembre"). Zona horaria America/Santiago.
- IVA 19%. Moneda CLP.

---

## 5. Pantallas (diseño de referencia)

Todas comparten un menú lateral oscuro: Nuevo ticket · Mi día · Avisos · Tickets (Tablero, Tabla, Línea de tiempo) · Trabajo (Órdenes de trabajo, Cotizador, Horas) · Administración (Reportes, Clientes, Configuración) · usuario.

| # | Pantalla | Propósito y elementos clave |
|---|---|---|
| 0 | **Ingreso** | Cuenta Microsoft o correo + contraseña, mostrar/ocultar, recuperar contraseña, mantener sesión. Sin registro abierto. Lleva a "Mi día". |
| 1 | **Tablero (Kanban)** | Columnas por estado: Nuevo, En curso, En espera, Cerrados (con archivado a 7 días). Tarjeta: ID, prioridad, asunto, cliente, etiquetas (correo, OT vinculada con tipo, "Espera: …", cierre), responsables, vencimiento, n° de mensajes. Filtros: búsqueda, responsable, prioridad, tipo, "Solo míos", agrupar por. |
| 2 | **Tabla** | Tickets activos agrupados por prioridad (agrupación cambiable). Columnas: ID, asunto + cliente, estado, prioridad, responsables, tipo (Ticket / OT facturable / OT interna), vence, actualizado. Filtros rápidos: Todos, Míos, Sin asignar, Vencen hoy, Con OT. Exportar. |
| 3 | **Línea de tiempo** | "¿En qué está cada uno?". Fila por persona con lo que está haciendo ahora; barras de 2 semanas desde inicio planificado hasta fecha límite; estilo por estado (en curso, planificado, en espera, resuelto) y punto por prioridad; columna de hoy destacada. Escala Día / 2 semanas / Mes. |
| 4 | **Nuevo ticket** | Formulario + panel "Adjuntar correo" (archivo o texto pegado) con vista previa de lo leído y autocompletado. Prioridad, categoría, inicio planificado, fecha límite, horas estimadas, responsables (principal + otros). |
| 5 | **Detalle de ticket** | Encabezado con estado, prioridad, vencimiento y OT vinculada. Correo original. Tareas (agregar, marcar, quitar, progreso). Actividad con pestañas y redactor Seguimiento / Nota interna, con fotos y registro de horas. Panel derecho: estado, prioridad, responsables, seguidores, solicitante, cliente, categoría, fecha límite, inicio planificado, horas estimadas; OT vinculadas y "Crear otra OT". |
| 6 | **Orden de trabajo** | Etapas; tipo facturable/interna (cambia campos y panel); datos; alcance; tareas con horas; fotos y archivos; seguimiento de la OT; panel con cotización (o costo interno), aprobación del cliente, ticket de origen e historial. Acciones: Cerrar OT…, Guardar, enviar cotización / aprobar. |
| 6b | **Cerrar OT** | Diálogo del punto 4.6. |
| 7 | **Cotizador** | Punto 4.7. |
| 8 | **Mi día** | Bandeja personal: cuadros de Vencen hoy, Por aprobar, Te mencionaron, Tus tareas; listas de aprobaciones pendientes, vencimientos, menciones, mis tareas (marcables) y "Detenidos hace días". |
| 9 | **Avisos** | Punto 4.10. |
| 10 | **Órdenes de trabajo (listado)** | Indicadores: por facturar ($), esperando al cliente ($), en ejecución, horas internas del mes. Filtros: Todas, Abiertas, Por facturar, Facturadas, Internas. Columnas: OT, trabajo + cliente + ticket, tipo, etapa, neto u horas, estado de facturación, responsable. "Exportar para facturación (.xlsx)". |
| 11 | **Clientes** | Lista de clientes y áreas internas; ficha del punto 4.9. |
| 12 | **Configuración** | Pestañas: Equipo y permisos (rol y departamento por persona + matriz de permisos), Departamentos y horarios, Categorías y plazos, Tarifas (hora normal, extendida, urgencia, traslado por km, costo interno; IVA; validez; prefijos; logo), Plantillas de cotización. |
| 13 | **Horas** | Punto 4.8. |
| 14 | **Reportes** | Período y departamento. Indicadores: tickets cerrados (resueltos vs descartados/duplicados), resolución promedio (días hábiles), % cerrados dentro de plazo, % horas facturables. Gráficos: horas por semana (facturables vs internas), carga por persona vs capacidad, resolución por prioridad vs objetivo. Tabla por cliente: abiertos, cerrados, horas, facturado, por facturar. Exportar (.xlsx). |

**Datos de ejemplo del diseño**: todos los nombres de personas, clientes (Viña Santa Clara, Constructora Andes, Clínica Los Robles, Transportes Austral), montos, tarifas ($38.000 / $45.000 por hora) y cifras de reportes son **ficticios** y sirven solo para ilustrar. El caso que recorre el diseño es TK-1048 "Error al emitir facturas desde el ERP" → OT-0218 facturable → COT-0218 ($475.000 neto, $565.250 con IVA).

---

## 6. Modelo de datos sugerido

```
Usuario(id, nombre, correo, rol, departamento_id, activo, color_avatar)
Departamento(id, nombre, hora_extendida_desde, capacidad_tickets_pct, calendario_feriados)
HorarioDia(departamento_id, dia_semana, activo, entrada, salida, colacion_min)

Cliente(id, nombre, rut, direccion, es_interno, condicion_pago, exige_oc)
Contacto(id, cliente_id, nombre, area, correo, aprueba_cotizaciones)
Contrato(id, cliente_id, tipo, horas_mes, renovacion)
TarifaCliente(cliente_id, concepto, valor)

Categoria(id, nombre, responsable_defecto_id, plazo_respuesta, plazo_resolucion_por_prioridad)

Ticket(id, codigo, asunto, descripcion, cliente_id, solicitante_nombre, solicitante_correo,
       origen[externo|interno], prioridad, categoria_id, estado, motivo_cierre,
       duplicado_de_id, inicio_planificado, fecha_limite, horas_estimadas,
       creado_por, creado_en, cerrado_en, archivado_en)
TicketResponsable(ticket_id, usuario_id, principal)
TicketSeguidor(ticket_id, usuario_id)
CorreoAdjunto(id, ticket_id, archivo_id, de, para, fecha, asunto, cuerpo)

OT(id, codigo, ticket_id, tipo[facturable|interna], etapa, titulo, alcance,
   responsable_tecnico_id, inicio, termino, oc_cliente, condicion_pago, contrato_id,
   centro_costo, area_solicitante, aprobador_id,
   estado_facturacion[no_aplica|pendiente|por_facturar|facturada], n_factura,
   resolvio_ticket, resumen_cierre, cerrada_en)
AprobacionCliente(id, ot_id, contacto_id, fecha, forma, archivo_id)

Tarea(id, ticket_id?, ot_id?, titulo, responsable_id, fecha, horas_estimadas, hecha)

Cotizacion(id, codigo, ot_id, version, estado, fecha_emision, validez_dias, moneda,
           aplica_iva, condiciones, nota_interna)
LineaCotizacion(id, cotizacion_id, orden, tipo, descripcion, cantidad, unidad,
                precio_unitario, descuento_pct)
PlantillaCotizacion(id, nombre, descripcion) + PlantillaLinea(...)

Mensaje(id, ticket_id?, ot_id?, tipo[seguimiento|nota_interna], autor_id, texto,
        horas, copiado_desde_id, creado_en)
Archivo(id, entidad, entidad_id, mensaje_id?, nombre, tipo_mime, tamano, url, subido_por, subido_en)
Evento(id, entidad, entidad_id, autor_id, accion, campo, valor_anterior, valor_nuevo, creado_en)   ← historial

RegistroHoras(id, usuario_id, fecha, ticket_id?, ot_id?, horas, fuera_de_horario, descripcion)
Aviso(id, usuario_id, tipo, texto, enlace, leido, creado_en)
PreferenciaAviso(usuario_id, evento, en_app, correo)
Mencion(mensaje_id, usuario_id)
Configuracion(clave, valor)   ← IVA, prefijos, validez, logo, correo de avisos
```

Todo cambio sobre Ticket, OT, Cotización y Tarea debe generar un `Evento`.

---

## 7. Sistema visual

- **Estética**: herramienta de trabajo sobria y cálida, alta densidad de información legible. Menú lateral oscuro, fondo de papel cálido, tarjetas blancas.
- **Tipografías** (Google Fonts): *Bricolage Grotesque* 600/700 para títulos; *IBM Plex Sans* 400/500/600 para texto e interfaz; *IBM Plex Mono* 400/500 para IDs, horas y montos.
- **Colores**

| Token | Hex | Uso |
|---|---|---|
| fondo | `#F3F1EC` | Fondo general |
| superficie | `#FFFFFF` | Tarjetas, paneles |
| superficie-suave | `#F7F5F1` / `#FBFAF7` | Encabezados de tabla, pies |
| tinta | `#1B1A17` | Texto principal, menú lateral, botones oscuros |
| tinta-2 | `#4A463F` / `#5C574E` | Texto secundario |
| borde | `#E1DDD4` / `#CFC9BE` | Bordes de tarjetas / campos |
| acento | `#2F47C4` | Acción principal, "En curso", hoy, prioridad Media |
| urgente | `#9A1C0E` sobre `#FCE9E4` (punto `#C8321F`) | Prioridad Urgente, vencidos |
| alta | `#7A4300` sobre `#FBEFD9` (punto `#D98A1C`) | Prioridad Alta |
| baja | `#4F4B44` sobre `#EEECE7` | Prioridad Baja, "Nuevo" |
| en espera | `#6E4300` sobre `#F6EEDB` (rayado en línea de tiempo) | En espera |
| facturable / resuelto | `#0E5A3F` sobre `#E1F2EA` | OT facturable, Resuelto |
| interna | `#4E2F99` sobre `#EEE8FA` | OT interna |
| nota interna | fondo `#FBF5E4`, borde `#EBDDB0` | Notas internas |
| gráficos | `#2F47C4` (facturables), `#D98A1C` (internas) | Reportes |

- **Forma**: radios de 6–12 px, bordes de 1 px, sombras mínimas. Íconos de trazo fino (sin emojis).
- **Accesibilidad**: controles reales (`button`, `a`, `input` con `label`), objetivos táctiles ≥ 44 px, contraste ≥ 4,5:1 en texto, el estado y la prioridad nunca se comunican solo con color.
- **Responsive**: el diseño está hecho a 1440 px de ancho. "Mi día", el detalle de ticket, el seguimiento con fotos y la OT deben funcionar en celular para el personal en terreno.

---

## 8. Decisiones pendientes / fuera de alcance

- **Stack y hosting**: no definidos. Requisitos: autenticación con cuenta Microsoft (OpenID Connect) + correo/contraseña, almacenamiento de archivos (fotos, .msg/.eml, PDF), envío de correos, generación de .xlsx y PDF, zona horaria America/Santiago.
- **Lectura de .msg**: requiere una librería específica (no es texto plano como .eml).
- **Bot de mensajería** (Telegram o Teams): deseable como **complemento** para avisos y acciones rápidas (`/hoy`, `/mis`, `/ticket 1048`, responder un aviso para registrar seguimiento, aprobar con un botón, crear ticket reenviando un mensaje). Siempre vinculado a la cuenta de la persona y escribiendo en la app, nunca como sistema paralelo. Canal por decidir.
- **Portal para clientes**: no incluido. Los seguimientos están pensados para poder exportarse o mostrarse al cliente en el futuro; las notas internas nunca.
- **Facturación electrónica**: fuera de alcance. La app marca "Por facturar / Facturada" y exporta la planilla; la factura se emite en el sistema contable.
- Advertencia al resolver un ticket con OT abierta (regla 4.1): definida pero no dibujada.

---

## 9. Orden sugerido de construcción

1. **Base**: ingreso, usuarios, roles, departamentos, clientes, categorías.
2. **Tickets**: crear (con correo adjunto), detalle, seguimiento/notas/historial, tareas, Tablero y Tabla.
3. **OT y cierre**: conversión ticket → OT, etapas, fotos y archivos, seguimiento, cierre con la regla 4.6.
4. **Cotizador**: líneas, totales, versiones, descarga .xlsx/PDF, aprobación del cliente.
5. **Horas y horarios**: horario por departamento, registro semanal, plazos hábiles.
6. **Visibilidad**: Mi día, avisos (app + correo), Línea de tiempo, listado de OT y facturación.
7. **Reportes**.
8. **Extras**: bot de mensajería, versión móvil optimizada.

---

## 10. Cómo usar este documento (para Claude)

- Toma el diseño exportado como referencia visual y este documento como especificación funcional.
- No inventes datos reales: los valores entre corchetes y los datos de ejemplo deben quedar como configurables o semillas de prueba.
- Respeta las reglas 4.1 (estados), 4.5–4.6 (OT y cierre) y 4.8 (horarios): son el núcleo de la trazabilidad.
- Ante una ambigüedad, pregunta antes de decidir; propone la opción más simple que cumpla con la trazabilidad.
