// Tickets de la demo (spec fase 9 §11.3): 36 tickets de las últimas 10 semanas. Todo es ficticio. Los días son
// relativos a la fecha de carga (`creado`/`cerrado`/`archivado`/`act` = días atrás; `vence` = días desde hoy).

export type Estado = 'nuevo' | 'en_curso' | 'en_espera' | 'resuelto' | 'descartado' | 'duplicado';
export type EsperaDe = 'cliente' | 'proveedor' | 'repuesto' | 'aprobacion';
export type Prioridad = 'urgente' | 'alta' | 'media' | 'baja';

export interface MensajeSemilla {
  t: 's' | 'n'; // seguimiento | nota interna
  quien: string;
  texto: string;
  menciona?: string[];
  horas?: number;
  foto?: string; // archivo de `archivos/` adjunto a este mensaje
}

export interface TareaSemilla {
  titulo: string;
  quien: string;
  hecha?: boolean;
  vence?: number; // días desde hoy (negativo = vencida)
}

export interface TicketSemilla {
  k: string;
  n: number;
  asunto: string;
  cliente: string; // clave de CLIENTE_POR_CLAVE
  estado: Estado;
  espera?: { de: EsperaDe; detalle: string };
  prio: Prioridad;
  resp: string[]; // el primero es el principal
  seg?: string[];
  vence: number;
  cat: string;
  creado: number;
  cerrado?: number;
  archivado?: number;
  act?: number; // última actividad (días atrás); por defecto, el cierre o ayer
  motivo?: string;
  dup?: string; // k del original
  est?: number; // horas estimadas
  correo?: { archivo: string; adjunto?: { archivo: string; nombre: string; mime: string } };
  desc: string;
  msgs: MensajeSemilla[];
  tareas?: TareaSemilla[];
  fotos?: string[]; // adjuntas al ticket
}

export const CLIENTE_POR_CLAVE: Record<string, string> = {
  fv: 'Frutícola Valle de Aconcagua SpA',
  cs: 'Clínica Dental Sonrisa Austral Ltda.',
  tr: 'Transportes Río Claro S.A.',
  ca: 'Colegio Bicentenario Los Aromos',
  ic: 'Inmobiliaria Cumbres del Maipo',
  pd: 'Panadería y Pastelería Doña Rosa EIRL',
  cp: 'Constructora Puente Alto Norte Ltda.',
  af: 'Administración y Finanzas',
  op: 'Operaciones',
  br: 'Base Rancagua',
};

const ERP = 'ERP y facturación';
const RED = 'Redes y conectividad';
const COR = 'Correo y colaboración';
const EQP = 'Equipos y periféricos';
const ACC = 'Accesos y cuentas';
const CLI = 'Climatización y energía';
const PRY = 'Proyectos y mejoras';

// prettier-ignore
export const TICKETS: TicketSemilla[] = [
  // ---- Resueltos archivados ----
  { k: 'r2', n: 2000, asunto: 'Impresora de etiquetas no imprime los códigos de barra', cliente: 'fv', estado: 'resuelto', prio: 'media', resp: ['mnunez'], vence: -60, cat: EQP, creado: 66, cerrado: 61, archivado: 50,
    desc: 'Desde el lunes la impresora de etiquetas de la línea de embalaje imprime las etiquetas en blanco. El despacho de cajas a exportación quedó detenido hasta que funcione.',
    msgs: [
      { t: 's', quien: 'mnunez', texto: 'Revisé la impresora en terreno: el cabezal térmico estaba sucio y el controlador había quedado en un modo incorrecto. Se limpió, se reinstaló el controlador y se imprimieron 20 etiquetas de prueba sin problemas.' },
      { t: 'n', quien: 'mnunez', texto: 'Dejé un cabezal de repuesto en bodega con la encargada de embalaje por si vuelve a fallar.' },
    ] },
  { k: 'r3', n: 2002, asunto: 'Casilla de correo para el nuevo gerente comercial', cliente: 'tr', estado: 'resuelto', prio: 'baja', resp: ['dpizarro'], vence: -55, cat: COR, creado: 60, cerrado: 58, archivado: 49,
    desc: 'El cliente incorporó un gerente comercial y necesita su casilla con acceso desde el celular y firma corporativa.',
    msgs: [
      { t: 's', quien: 'dpizarro', texto: 'Casilla creada y configurada en el teléfono del gerente. La firma corporativa quedó aplicada y se dejó la contraseña temporal con su asistente.' },
    ] },
  { k: 'r4', n: 2003, asunto: 'El respaldo nocturno del ERP termina con error', cliente: 'cs', estado: 'resuelto', prio: 'alta', resp: ['aloyola'], vence: -50, cat: ERP, creado: 52, cerrado: 45, archivado: 36, est: 4,
    desc: 'Desde hace tres noches el respaldo automático del ERP de la clínica termina con error y no deja copia. Hay que dejarlo funcionando antes de la auditoría del fin de mes.',
    msgs: [
      { t: 's', quien: 'aloyola', texto: 'El disco de destino del respaldo estaba lleno. Se liberó espacio y se configuró la retención para conservar solo 14 copias.' },
      { t: 'n', quien: 'aloyola', texto: 'Falta una alerta por correo cuando el respaldo falle. Lo dejo para la próxima visita preventiva.', horas: 2 },
      { t: 's', quien: 'aloyola', texto: 'Dos noches seguidas de respaldos correctos. Cierro el ticket y dejo la alerta como mejora aparte.' },
    ] },
  { k: 'r1', n: 2004, asunto: 'Caídas de la VPN entre el packing y la oficina central', cliente: 'fv', estado: 'resuelto', prio: 'alta', resp: ['fcarrasco', 'mnunez'], vence: -37, cat: RED, creado: 47, cerrado: 33, archivado: 26, est: 11,
    desc: 'La conexión entre la planta de packing y la oficina central se corta varias veces al día y el ERP deja de responder. Hay reglas de firewall antiguas que nadie documentó.',
    msgs: [
      { t: 's', quien: 'fcarrasco', texto: 'Levantamos los túneles y las reglas actuales: hay tres reglas duplicadas y un túnel que reinicia cada 30 minutos. Propongo reconfigurar el firewall; armamos la OT con cotización.' },
      { t: 'n', quien: 'mnunez', texto: '@Felipe el router de packing tiene firmware de hace dos años; conviene actualizarlo en la misma ventana.', menciona: ['fcarrasco'] },
      { t: 's', quien: 'fcarrasco', texto: 'Reconfiguración terminada y probada durante dos días hábiles sin cortes. Cerramos con la OT-0300.' },
    ] },
  { k: 'r5', n: 2005, asunto: 'Cuenta de contabilidad bloqueada tras cambio de contraseña', cliente: 'af', estado: 'resuelto', prio: 'media', resp: ['asepulveda'], vence: -37, cat: ACC, creado: 40, cerrado: 39, archivado: 29,
    desc: 'La contadora cambió su contraseña y ahora el ERP y el correo la bloquean cada pocos minutos.',
    msgs: [
      { t: 's', quien: 'asepulveda', texto: 'Había una sesión antigua en el notebook personal con la contraseña vieja que reintentaba y bloqueaba la cuenta. Se cerró la sesión y se desbloqueó.' },
    ] },
  { k: 'r6', n: 2006, asunto: 'Aire acondicionado de la sala de servidores gotea', cliente: 'op', estado: 'resuelto', prio: 'urgente', resp: ['jriquelme'], vence: -33, cat: CLI, creado: 38, cerrado: 35, archivado: 27, est: 5,
    desc: 'El equipo de aire acondicionado de la sala de servidores está goteando sobre la canaleta de cables. Hay riesgo de cortocircuito.',
    msgs: [
      { t: 's', quien: 'jriquelme', texto: 'Se desconectó el equipo, se destapó el desagüe y se reemplazó la manguera de condensado. Sin goteo después de cuatro horas de funcionamiento.' },
      { t: 'n', quien: 'jriquelme', texto: 'El filtro está en mal estado; lo pido en la próxima compra de materiales.' },
    ] },
  // ---- Resueltos recientes ----
  { k: 'cs', n: 2007, asunto: 'Ampliación de la red WiFi en las consultas', cliente: 'cs', estado: 'resuelto', prio: 'media', resp: ['fcarrasco', 'jriquelme'], vence: -7, cat: RED, creado: 30, cerrado: 9, est: 9,
    desc: 'Las consultas del segundo piso no tienen buena señal WiFi y los equipos de rayos pierden conexión con el servidor de imágenes.',
    msgs: [
      { t: 's', quien: 'fcarrasco', texto: 'Hicimos el levantamiento de cobertura con el medidor. Hay dos zonas muertas y se necesitan 4 puntos de acceso adicionales.' },
      { t: 's', quien: 'fcarrasco', texto: 'Instalación terminada. La señal es estable en todas las consultas y los equipos de rayos ya se conectan sin cortes.' },
    ] },
  { k: 'r8', n: 2018, asunto: 'El notebook de gerencia no enciende', cliente: 'cp', estado: 'resuelto', prio: 'alta', resp: ['mnunez'], vence: -4, cat: EQP, creado: 12, cerrado: 6, est: 3,
    desc: 'El notebook del gerente general no enciende desde esta mañana y tiene una presentación el jueves.',
    fotos: ['foto-notebook.png'],
    msgs: [
      { t: 's', quien: 'mnunez', texto: 'La batería estaba descargada por completo y el cargador no entregaba corriente. Se prestó un equipo de reemplazo mientras llega el cargador nuevo.', horas: 1.5 },
      { t: 's', quien: 'mnunez', texto: 'Cargador reemplazado y equipo devuelto con todos sus archivos. Sin otras fallas.' },
    ] },
  { k: 'r9', n: 2021, asunto: 'Licencias de Office vencidas en administración', cliente: 'ic', estado: 'resuelto', prio: 'media', resp: ['dpizarro'], vence: -1, cat: COR, creado: 9, cerrado: 3,
    desc: 'Cinco equipos de administración muestran que la suscripción de Office venció y no permiten editar documentos.',
    msgs: [
      { t: 's', quien: 'dpizarro', texto: 'La suscripción no se había renovado por un cambio de tarjeta. Se pagó desde Administración y se reactivaron las cinco licencias.' },
    ] },
  { k: 'r10', n: 2024, asunto: 'Error al emitir guías de despacho desde el ERP', cliente: 'tr', estado: 'resuelto', prio: 'alta', resp: ['aloyola', 'ralamos'], vence: 0, cat: ERP, creado: 6, cerrado: 0, act: 0, est: 4,
    desc: 'El ERP rechaza las guías de despacho con un error de folio y los camiones no pueden salir con la carga.',
    msgs: [
      { t: 's', quien: 'aloyola', texto: 'El rango de folios de guías estaba agotado. Se solicitó un nuevo rango al SII y se cargó en el ERP.', horas: 2 },
      { t: 'n', quien: 'ralamos', texto: '@Andrés dejemos un aviso automático cuando queden menos de 20 folios; lo agendamos como mejora.', menciona: ['aloyola'] },
      { t: 's', quien: 'aloyola', texto: 'Probado con tres guías reales. Los camiones ya salen con su documentación.' },
    ],
    tareas: [
      { titulo: 'Solicitar nuevo rango de folios de guías', quien: 'aloyola', hecha: true },
      { titulo: 'Configurar aviso de folios por agotarse', quien: 'aloyola', hecha: true },
    ] },
  // ---- Descartados ----
  { k: 'd2', n: 2009, asunto: 'Correo sospechoso reenviado por una usuaria', cliente: 'af', estado: 'descartado', motivo: 'No corresponde: era un correo informativo del proveedor de licencias, no un intento de fraude', prio: 'baja', resp: ['dpizarro'], vence: -23, cat: COR, creado: 25, cerrado: 24,
    desc: 'Una usuaria reenvió un correo con un enlace que le pareció sospechoso y pide revisarlo.',
    msgs: [{ t: 's', quien: 'dpizarro', texto: 'Revisé los encabezados y el enlace: es un aviso legítimo del proveedor de licencias. Se le explicó a la usuaria cómo reconocerlo.' }] },
  { k: 'pd', n: 2012, asunto: 'Cotización de un sistema de punto de venta con boleta electrónica', cliente: 'pd', estado: 'descartado', motivo: 'El cliente desistió de la propuesta (OT-0305 cancelada)', prio: 'media', resp: ['ralamos'], vence: -9, cat: PRY, creado: 20, cerrado: 11,
    desc: 'La panadería quiere reemplazar la caja registradora por un sistema de punto de venta que emita boleta electrónica.',
    msgs: [
      { t: 's', quien: 'ralamos', texto: 'Visitamos el local y levantamos lo necesario: un terminal, impresora de boletas y capacitación. Enviamos la cotización a doña Rosa.' },
      { t: 's', quien: 'ralamos', texto: 'La dueña decidió esperar hasta el próximo año por costos. Cancelamos la OT y cerramos el ticket.' },
    ] },
  { k: 'd3', n: 2014, asunto: 'Solicitud de capacitación en Excel avanzado', cliente: 'af', estado: 'descartado', motivo: 'Fuera del alcance de soporte; se derivó a Recursos Humanos', prio: 'baja', resp: ['asepulveda'], vence: -15, cat: PRY, creado: 18, cerrado: 16,
    desc: 'El área pide una capacitación de Excel avanzado para cuatro personas.',
    msgs: [{ t: 's', quien: 'asepulveda', texto: 'Las capacitaciones no son parte del soporte técnico. Se derivó la solicitud a Recursos Humanos y se compartió una lista de cursos.' }] },
  // ---- Duplicados ----
  { k: 'dup1', n: 2022, asunto: 'Sin internet en la sucursal Rancagua (segundo reporte)', cliente: 'br', estado: 'duplicado', dup: 'e5', prio: 'urgente', resp: ['asepulveda'], vence: -6, cat: RED, creado: 8, cerrado: 7,
    desc: 'Otra persona de la base Rancagua reporta que no hay internet en toda la oficina.',
    msgs: [{ t: 'n', quien: 'asepulveda', texto: 'Es el mismo problema reportado en TK-2019; se cierra como duplicado y se sigue allí.' }] },
  { k: 'dup2', n: 2026, asunto: 'ERP muy lento durante el cierre de mes (reporte de Finanzas)', cliente: 'af', estado: 'duplicado', dup: 'e7', prio: 'media', resp: ['aloyola'], vence: -2, cat: ERP, creado: 5, cerrado: 4,
    desc: 'Finanzas reporta lentitud del ERP al cerrar el mes, el mismo problema que ya está en seguimiento.',
    msgs: [{ t: 'n', quien: 'aloyola', texto: 'Es el mismo reporte de lentitud de TK-2016; se continúa en ese ticket.' }] },
  // ---- En curso ----
  { k: 'e1', n: 2001, asunto: 'Renovación de red y cableado en las tres bodegas', cliente: 'tr', estado: 'en_curso', prio: 'alta', resp: ['fcarrasco', 'jriquelme', 'mnunez'], seg: ['phidalgo', 'xarrau'], vence: 10, cat: PRY, creado: 62, act: 0, est: 6,
    desc: 'Transportes Río Claro renueva la red de sus tres bodegas: cableado estructurado, nuevos switches, WiFi de cobertura completa y respaldo de enlace. Requiere coordinación con las ventanas de carga.',
    fotos: ['foto-canalizacion-bodega.png', 'foto-patch-panel.png'],
    msgs: [
      { t: 's', quien: 'fcarrasco', texto: 'Terminamos el levantamiento de las tres bodegas y la cotización fue aprobada con la orden de compra OC-7781. Partimos con la bodega 1.' },
      { t: 'n', quien: 'jriquelme', texto: '@Felipe la canalización de la bodega 2 pasa por el sector de la cámara frigorífica; hay que coordinar el acceso con Sergio Vidal.', menciona: ['fcarrasco'] },
      { t: 's', quien: 'fcarrasco', texto: 'Bodegas 1 y 2 con cableado terminado y certificado. En la bodega 3 vamos a la mitad de los puntos.' },
      { t: 'n', quien: 'mnunez', texto: 'Quedan pendientes las pruebas de WiFi con los terminales de carga. Las dejo para el jueves.' },
      { t: 's', quien: 'fcarrasco', texto: 'Cableado de la bodega 3 terminado; empezamos la configuración final de los equipos de red y las pruebas.' },
    ] },
  { k: 'e6', n: 2008, asunto: 'Migración del servidor de archivos a la nube', cliente: 'af', estado: 'en_curso', prio: 'media', resp: ['aloyola', 'ralamos'], seg: ['cbustos', 'phidalgo'], vence: 12, cat: PRY, creado: 28, act: 1, est: 14,
    desc: 'Administración y Finanzas quiere dejar de depender del servidor de archivos de la oficina y pasar sus carpetas a la nube con permisos por área.',
    msgs: [
      { t: 's', quien: 'aloyola', texto: 'Se definió la estructura de carpetas y los permisos por área junto a Carolina. Partimos migrando Finanzas.' },
      { t: 'n', quien: 'ralamos', texto: '@Andrés dejemos el servidor antiguo en solo lectura durante dos semanas antes de apagarlo.', menciona: ['aloyola'] },
      { t: 's', quien: 'aloyola', texto: 'Primera etapa migrada: 180 GB de Finanzas. La OT-0309 cerró esa etapa; abrimos la OT-0310 para Contabilidad y Adquisiciones.' },
    ],
    tareas: [
      { titulo: 'Migrar las carpetas de Contabilidad', quien: 'aloyola', vence: 2 },
      { titulo: 'Revisar permisos con el área de Adquisiciones', quien: 'ralamos', vence: 3 },
    ] },
  { k: 'e3', n: 2011, asunto: 'Instalación de pizarras interactivas en seis salas', cliente: 'ca', estado: 'en_curso', prio: 'media', resp: ['jriquelme'], seg: ['cbustos'], vence: 7, cat: PRY, creado: 21, act: 1, est: 6,
    desc: 'El colegio compró seis pizarras interactivas y necesita instalarlas, conectarlas a la red y dejar los equipos de las salas listos antes del inicio del semestre.',
    msgs: [
      { t: 's', quien: 'jriquelme', texto: 'Instaladas tres pizarras (salas 1 a 3). Falta el cableado de los puntos de red de las salas 4 a 6.' },
      { t: 'n', quien: 'cbustos', texto: '@Joaquín el colegio nos pidió terminar antes del viernes de la semana próxima; avísame si necesitas apoyo.', menciona: ['jriquelme'] },
    ],
    tareas: [
      { titulo: 'Cablear los puntos de red de las salas 4 a 6', quien: 'jriquelme', vence: 3 },
      { titulo: 'Instalar y calibrar las pizarras de las salas 4 a 6', quien: 'jriquelme', vence: 6 },
    ] },
  { k: 'e9', n: 2013, asunto: 'Migración de casillas de correo a nuevo proveedor', cliente: 'fv', estado: 'en_curso', prio: 'media', resp: ['dpizarro', 'ralamos', 'cbustos'], vence: 4, cat: COR, creado: 19, act: 5, est: 8,
    desc: 'La frutícola cambia de proveedor de correo y hay que migrar 30 casillas conservando los correos históricos y las reglas.',
    msgs: [
      { t: 's', quien: 'dpizarro', texto: 'Migramos 12 de las 30 casillas. Esperamos que el cliente nos confirme la lista de alias que quiere conservar.' },
      { t: 'n', quien: 'dpizarro', texto: 'Quedó detenido a la espera de la lista de alias; @Rodrigo recuerda pedírsela a Matilde.', menciona: ['ralamos'] },
    ],
    tareas: [
      { titulo: 'Pedir al cliente la lista de alias a conservar', quien: 'ralamos', vence: -1 },
      { titulo: 'Migrar las 18 casillas restantes', quien: 'dpizarro', vence: 4 },
      { titulo: 'Verificar el correo entrante después del cambio de MX', quien: 'dpizarro', vence: 5 },
    ] },
  { k: 'e7', n: 2016, asunto: 'ERP muy lento durante el cierre de mes', cliente: 'af', estado: 'en_curso', prio: 'alta', resp: ['aloyola', 'ralamos', 'cbustos'], seg: ['phidalgo'], vence: -1, cat: ERP, creado: 14, act: 1, est: 18,
    desc: 'Desde hace dos semanas el ERP se vuelve muy lento los días de cierre y los informes tardan más de diez minutos. Finanzas no alcanza a cerrar el mes en el plazo.',
    msgs: [
      { t: 's', quien: 'aloyola', texto: 'Revisé el servidor: la base de datos tiene índices fragmentados y el disco está al 92 %. Voy a reorganizar los índices fuera de horario.', horas: 2.5 },
      { t: 'n', quien: 'ralamos', texto: '@Andrés el cliente pregunta si hay riesgo de perder datos; confírmame el plan de respaldo antes de tocar la base.', menciona: ['aloyola'] },
      { t: 's', quien: 'aloyola', texto: 'Con respaldo completo hecho, reorganicé los índices. Los informes bajaron a menos de dos minutos, pero falta ampliar el disco.' },
      { t: 'n', quien: 'cbustos', texto: 'Finanzas pide que el disco nuevo esté antes del próximo cierre. @Andrés ¿se alcanza?', menciona: ['aloyola'] },
    ],
    tareas: [
      { titulo: 'Cotizar y ampliar el disco del servidor del ERP', quien: 'aloyola', vence: 2 },
      { titulo: 'Confirmar con Finanzas los informes que siguen lentos', quien: 'ralamos', vence: -2 },
      { titulo: 'Reorganizar los índices de la base de datos', quien: 'aloyola', hecha: true },
      { titulo: 'Documentar el plan de respaldo previo a cambios', quien: 'aloyola', hecha: true },
    ] },
  { k: 'e5', n: 2019, asunto: 'Sin internet en la sucursal Rancagua', cliente: 'br', estado: 'en_curso', prio: 'urgente', resp: ['fcarrasco', 'cbustos'], seg: ['phidalgo', 'xarrau'], vence: -2, cat: RED, creado: 11, act: 1, est: 14,
    desc: 'La base Rancagua no tiene internet desde el lunes. El enlace del proveedor funciona, pero el router no entrega salida y el equipo del lugar no puede facturar.',
    fotos: ['foto-rack-rancagua.png', 'foto-router-sin-enlace.png'],
    msgs: [
      { t: 's', quien: 'fcarrasco', texto: 'Estuvimos en terreno: el router principal tiene la interfaz WAN caída y el switch hace bucle por un cable mal terminado en el rack.' },
      { t: 'n', quien: 'cbustos', texto: '@Felipe el segundo reporte del mismo problema ya se marcó como duplicado; mantengamos todo en este ticket.', menciona: ['fcarrasco'] },
      { t: 's', quien: 'fcarrasco', texto: 'Se levantó un enlace temporal por el router de respaldo. Hay que reordenar el rack y recablear; abrimos la OT-0308 para eso.' },
      { t: 's', quien: 'fcarrasco', texto: 'La OT-0308 se cerró sin resolver el problema de fondo: el proveedor debe cambiar el módem. Seguimos en este ticket.' },
    ],
    tareas: [
      { titulo: 'Coordinar el cambio de módem con el proveedor de internet', quien: 'cbustos', vence: -1 },
      { titulo: 'Probar el enlace principal en horario de baja carga', quien: 'fcarrasco', vence: 1 },
      { titulo: 'Reordenar y rotular el rack de la base', quien: 'fcarrasco', hecha: true },
    ] },
  { k: 'e8', n: 2025, asunto: 'Alerta de malware en equipos del área de ventas', cliente: 'tr', estado: 'en_curso', prio: 'urgente', resp: ['asepulveda', 'ralamos', 'cbustos', 'dpizarro'], seg: ['phidalgo', 'xarrau'], vence: 0, cat: ACC, creado: 6, act: 0, est: 6,
    desc: 'El antivirus de la oficina de ventas de Transportes Río Claro detectó un programa malicioso en tres equipos y hay que contener, limpiar y actualizar la protección en los 40 equipos.',
    msgs: [
      { t: 's', quien: 'asepulveda', texto: 'Aislé los tres equipos de la red y los limpié con la herramienta de remoción. No se detectó movimiento hacia el servidor.', horas: 3 },
      { t: 'n', quien: 'asepulveda', texto: '@Rodrigo conviene avisarle al gerente que el origen fue un adjunto de correo; propongo una charla corta con el equipo.', menciona: ['ralamos'] },
      { t: 's', quien: 'asepulveda', texto: 'Actualizados 28 de 40 equipos. Los restantes están en terreno y se actualizarán cuando vuelvan a la red.' },
    ],
    tareas: [
      { titulo: 'Actualizar la protección en los 12 equipos pendientes', quien: 'asepulveda', vence: 0 },
      { titulo: 'Agendar charla de seguridad para ventas', quien: 'ralamos', vence: 0 },
      { titulo: 'Aislar y limpiar los equipos afectados', quien: 'asepulveda', hecha: true },
      { titulo: 'Revisar el servidor de archivos en busca de rastros', quien: 'asepulveda', hecha: true },
    ] },
  { k: 'e2', n: 2023, asunto: 'Levantamiento de equipos para renovar 20 notebooks', cliente: 'ic', estado: 'en_curso', prio: 'media', resp: ['mnunez', 'gtapia'], vence: 1, cat: EQP, creado: 7, act: 1, est: 5,
    desc: 'La inmobiliaria quiere renovar 20 notebooks y necesita un inventario de los equipos actuales, su estado y una propuesta de reemplazo.',
    msgs: [
      { t: 's', quien: 'mnunez', texto: 'Inventariados 14 de los 20 equipos con su antigüedad, memoria y estado de batería. El resto está con los vendedores en terreno.' },
      { t: 'n', quien: 'gtapia', texto: '@Marcela dejé la planilla con los equipos ya revisados en la carpeta del cliente.', menciona: ['mnunez'] },
    ],
    tareas: [
      { titulo: 'Inventariar los 6 notebooks restantes', quien: 'gtapia', vence: 1 },
      { titulo: 'Preparar la propuesta de reemplazo', quien: 'mnunez', vence: 4 },
    ] },
  { k: 'e4', n: 2028, asunto: 'Reemplazo de la UPS de la sala de servidores', cliente: 'op', estado: 'en_curso', prio: 'alta', resp: ['jriquelme', 'cbustos'], vence: 1, cat: CLI, creado: 3, act: 0, est: 6,
    desc: 'La UPS de la sala de servidores emite una alarma de batería agotada y no soporta más de dos minutos de corte. Hay que reemplazarla antes de que falle.',
    fotos: ['foto-ups-alarma.png'],
    msgs: [
      { t: 's', quien: 'jriquelme', texto: 'Las baterías están hinchadas y la UPS no sostiene la carga. Hay que reemplazar el equipo completo; preparo la OT interna para aprobación.' },
      { t: 'n', quien: 'jriquelme', texto: '@Carolina dejé la OT-0307 en borrador con el alcance y las horas; necesito tu aprobación para comprar.', menciona: ['cbustos'] },
    ],
    tareas: [
      { titulo: 'Cotizar UPS de 6 kVA con tres proveedores', quien: 'jriquelme', vence: 1 },
      { titulo: 'Aprobar la OT-0307 y la compra', quien: 'cbustos', vence: 1 },
    ] },
  // ---- En espera ----
  { k: 'w1', n: 2010, asunto: 'Ampliación de red en la oficina de obra y WiFi de bodega', cliente: 'cp', estado: 'en_espera', espera: { de: 'cliente', detalle: 'Respuesta del cliente a la cotización v2' }, prio: 'media', resp: ['fcarrasco', 'ralamos'], seg: ['xarrau'], vence: 9, cat: RED, creado: 24, act: 4, est: 12,
    desc: 'La constructora necesita cuatro puntos de red adicionales en la oficina de obra y cobertura WiFi en la bodega de materiales.',
    msgs: [
      { t: 's', quien: 'fcarrasco', texto: 'Visitamos la obra y levantamos los puntos. Enviamos la cotización; el cliente la rechazó por el costo del WiFi de bodega.' },
      { t: 's', quien: 'ralamos', texto: 'Ajustamos el alcance y enviamos la versión 2 con un descuento. Quedamos esperando la respuesta del cliente.' },
      { t: 'n', quien: 'ralamos', texto: 'Hernán dijo que lo ve con Adquisiciones esta semana; llamo el jueves si no hay respuesta.' },
    ],
    tareas: [{ titulo: 'Llamar al cliente si no responde la cotización v2', quien: 'ralamos', vence: 3 }, { titulo: 'Reservar el equipo de WiFi con el proveedor', quien: 'fcarrasco', vence: 6 }] },
  { k: 'w2', n: 2015, asunto: 'Renovación de las licencias del ERP', cliente: 'tr', estado: 'en_espera', espera: { de: 'proveedor', detalle: 'Cotización del proveedor de licencias' }, prio: 'alta', resp: ['aloyola'], seg: ['xarrau'], vence: 6, cat: ERP, creado: 15, act: 4, est: 10,
    desc: 'Vencen las licencias del ERP de Transportes Río Claro a fin de mes y hay que renovarlas para 25 usuarios.',
    msgs: [
      { t: 's', quien: 'aloyola', texto: 'Pedimos la cotización de renovación al proveedor del ERP para 25 usuarios. Ofrecen un descuento si renovamos por dos años.' },
      { t: 'n', quien: 'aloyola', texto: 'El proveedor respondería mañana; si no, hay que presionar antes del vencimiento.' },
    ],
    tareas: [{ titulo: 'Confirmar con el proveedor el plazo de entrega de licencias', quien: 'aloyola', vence: 2 }, { titulo: 'Programar la ventana de activación', quien: 'aloyola', vence: 5 }] },
  { k: 'w3', n: 2017, asunto: 'Cambio de switch en la bodega de Buin', cliente: 'tr', estado: 'en_espera', espera: { de: 'cliente', detalle: 'Confirmar la ventana de trabajo' }, prio: 'alta', resp: ['fcarrasco', 'jriquelme'], vence: 5, cat: RED, creado: 13, act: 3, est: 8,
    desc: 'El switch principal de la bodega de Buin tiene puertos caídos y debe reemplazarse sin detener la carga de camiones.',
    msgs: [
      { t: 's', quien: 'fcarrasco', texto: 'Propusimos hacer el cambio el sábado temprano, cuando no hay camiones. Esperamos que el cliente confirme.' },
    ],
    tareas: [{ titulo: 'Preparar la configuración del switch nuevo', quien: 'fcarrasco', vence: 3 }] },
  { k: 'w4', n: 2020, asunto: 'Compra de notebooks para el equipo de ventas', cliente: 'af', estado: 'en_espera', espera: { de: 'aprobacion', detalle: 'Aprobación interna de Administración y Finanzas' }, prio: 'baja', resp: ['mnunez'], vence: 8, cat: EQP, creado: 10, act: 4, est: 4,
    desc: 'Ventas pide cinco notebooks nuevos; la compra necesita la aprobación de Administración y Finanzas.',
    msgs: [{ t: 's', quien: 'mnunez', texto: 'Se envió la cotización de tres alternativas a Finanzas. Esperamos su aprobación para comprar.' }],
    tareas: [{ titulo: 'Preparar la imagen de instalación de los notebooks', quien: 'mnunez', vence: 5 }, { titulo: 'Reservar los equipos con el proveedor', quien: 'mnunez', vence: 7 }] },
  // ---- Nuevos ----
  { k: 'n7', n: 2029, asunto: 'Sin acceso a la carpeta compartida de contabilidad', cliente: 'ic', estado: 'nuevo', prio: 'alta', resp: ['asepulveda'], vence: 2, cat: ACC, creado: 3, act: 1, est: 3,
    desc: 'Dos personas de contabilidad perdieron el acceso a la carpeta compartida desde el cambio de servidor. El cierre contable está atrasado.',
    msgs: [{ t: 's', quien: 'asepulveda', texto: 'Recibido. Revisando los permisos de las dos cuentas; te confirmo antes de las 16:00.' }],
    tareas: [{ titulo: 'Revisar los permisos de las cuentas afectadas', quien: 'asepulveda', vence: 1 }, { titulo: 'Confirmar el acceso con el usuario', quien: 'asepulveda', vence: 2 }] },
  { k: 'n6', n: 2030, asunto: 'El proyector de la sala 4 no proyecta', cliente: 'ca', estado: 'nuevo', prio: 'media', resp: ['dpizarro'], vence: 4, cat: EQP, creado: 2, act: 2, est: 2,
    desc: 'El proyector de la sala 4 enciende pero no muestra imagen. Las clases usan esa sala todo el día.',
    msgs: [{ t: 'n', quien: 'dpizarro', texto: 'Probablemente sea el cable HDMI o la lámpara; mañana lo pruebo con otro cable.' }],
    tareas: [{ titulo: 'Diagnosticar el proyector de la sala 4', quien: 'dpizarro', vence: 2 }] },
  { k: 'n4', n: 2031, asunto: 'Cotización de puntos de red adicionales en la oficina de obra', cliente: 'cp', estado: 'nuevo', prio: 'media', resp: [], vence: 5, cat: PRY, creado: 1, act: 1, est: 3,
    correo: { archivo: 'correo-puntos-de-red.eml', adjunto: { archivo: 'planilla-puestos-obra.xlsx', nombre: 'planilla-puestos-obra.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } },
    desc: 'Ticket creado a partir de un correo recibido de la constructora con la lista de puestos que necesitan conexión de red.',
    msgs: [{ t: 'n', quien: 'cbustos', texto: 'Es la misma constructora de la OT-0303; revisar esa propuesta antes de responder.' }] },
  { k: 'n5', n: 2032, asunto: 'Alta de usuario para una nueva contadora', cliente: 'af', estado: 'nuevo', prio: 'baja', resp: ['asepulveda'], vence: 5, cat: ACC, creado: 1, act: 1, est: 1,
    desc: 'Ingresa una contadora el lunes y necesita cuenta de correo, acceso al ERP y a las carpetas de Finanzas.',
    msgs: [{ t: 'n', quien: 'asepulveda', texto: 'Necesito el formulario de alta firmado por Administración antes de crear las cuentas.' }] },
  { k: 'n8', n: 2027, asunto: 'La UPS de la oficina de Rancagua emite una alarma continua', cliente: 'br', estado: 'nuevo', prio: 'urgente', resp: ['jriquelme'], vence: 1, cat: CLI, creado: 4, act: 1, est: 3,
    desc: 'La UPS que protege el rack de la base Rancagua emite un pitido continuo desde ayer. Podría ser la batería o una sobrecarga.',
    msgs: [{ t: 's', quien: 'jriquelme', texto: 'Anotado. Paso mañana temprano a medir la carga y revisar las baterías.' }] },
  { k: 'n1', n: 2033, asunto: 'Solicitud de cotización: cámaras de seguridad en la bodega de embalaje', cliente: 'fv', estado: 'nuevo', prio: 'media', resp: [], vence: 6, cat: PRY, creado: 0, act: 0, est: 4,
    correo: { archivo: 'correo-solicitud-camaras.eml', adjunto: { archivo: 'croquis-bodega.png', nombre: 'croquis-bodega.png', mime: 'image/png' } },
    desc: 'Ticket creado a partir de un correo de la frutícola que pide cotizar seis cámaras con grabador en la bodega de embalaje nueva.',
    msgs: [{ t: 'n', quien: 'ralamos', texto: 'Llegó por correo. Hay que asignar a Terreno la visita de medición; revisar la disponibilidad de Felipe esta semana.' }] },
  { k: 'n2', n: 2034, asunto: 'El GPS de la flota deja de sincronizar con el sistema de rutas', cliente: 'tr', estado: 'nuevo', prio: 'urgente', resp: ['fcarrasco'], vence: 0, cat: RED, creado: 0, act: 0, est: 3,
    desc: 'Los camiones dejaron de reportar su posición al sistema de rutas desde las 08:00 y la central no puede asignar despachos.',
    msgs: [{ t: 's', quien: 'fcarrasco', texto: 'Recibido. Estoy llamando a la central de Transportes para revisar los equipos GPS y el enlace de datos.' }] },
  { k: 'n3', n: 2035, asunto: 'Impresora de recepción sin conexión', cliente: 'cs', estado: 'nuevo', prio: 'baja', resp: ['gtapia'], vence: 3, cat: EQP, creado: 0, act: 0, est: 1,
    desc: 'La impresora de la recepción de la clínica no aparece en la red y no se pueden imprimir las fichas.',
    msgs: [{ t: 's', quien: 'gtapia', texto: 'Recibido. Reviso la impresora de forma remota y, si hace falta, paso por la recepción.' }] },
];

// Tareas ya terminadas de cada ticket (van antes de las tareas abiertas de `TICKETS`, en el orden de la lista).
// prettier-ignore
export const TAREAS_HECHAS: Record<string, { titulo: string; quien: string }[]> = {
  e1: [
    { titulo: 'Visitar las tres bodegas y tomar medidas', quien: 'fcarrasco' },
    { titulo: 'Coordinar con el cliente las ventanas de trabajo', quien: 'jriquelme' },
    { titulo: 'Comprar los materiales de la primera etapa', quien: 'mnunez' },
  ],
  e6: [{ titulo: 'Definir las áreas y los permisos con Carolina', quien: 'aloyola' }],
  e3: [{ titulo: 'Revisar las salas y confirmar los puntos de red', quien: 'jriquelme' }],
  e9: [{ titulo: 'Preparar el nuevo dominio y los registros DNS', quien: 'dpizarro' }],
  e2: [{ titulo: 'Acordar con Administración la lista de equipos', quien: 'mnunez' }],
  r1: [
    { titulo: 'Levantar las reglas del firewall actual', quien: 'fcarrasco' },
    { titulo: 'Documentar la configuración final de la VPN', quien: 'mnunez' },
  ],
  r4: [{ titulo: 'Liberar espacio y probar el respaldo manual', quien: 'aloyola' }],
  w1: [{ titulo: 'Visitar la obra y levantar los puntos', quien: 'fcarrasco' }],
  w2: [{ titulo: 'Pedir la cotización de renovación al proveedor', quien: 'aloyola' }],
  w3: [{ titulo: 'Proponer la fecha de cambio al cliente', quien: 'fcarrasco' }],
};
