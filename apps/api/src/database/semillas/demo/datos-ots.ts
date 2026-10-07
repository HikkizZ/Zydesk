// OT y cotizaciones de la demo (spec fase 9 §11.3): 11 OT (6 facturables y 5 internas) y 8 cotizaciones. Los días son
// «días atrás» respecto de la fecha de carga. Los totales de las cotizaciones salen siempre de `calcularCotizacion`.

export type TipoOt = 'facturable' | 'interna';
export type EtapaOt =
  'borrador' | 'cotizada' | 'aprobada' | 'en_ejecucion' | 'cerrada' | 'cancelada';
export type Facturacion = 'no_aplica' | 'pendiente' | 'por_facturar' | 'facturada';
export type FormaAprobacion = 'orden_de_compra' | 'correo' | 'cotizacion_firmada';
type Hora = string;

export interface LineaSemilla {
  tipo: 'mano_de_obra' | 'material' | 'servicio' | 'traslado';
  descripcion: string;
  cantidad: number;
  unidad: 'h' | 'un' | 'km' | 'gl';
  precio: number;
  descuento?: number;
}

export interface CotizacionSemilla {
  version: number;
  estado: 'borrador' | 'enviada' | 'aprobada' | 'rechazada' | 'reemplazada';
  moneda: 'CLP' | 'UF';
  aplica_iva?: boolean; // por defecto true
  creada: [dia: number, hora: Hora];
  enviada?: [dia: number, hora: Hora];
  respondida?: [dia: number, hora: Hora]; // aprobada o rechazada
  desde_version?: number; // duplicada de otra versión
  origen?: 'plantilla' | 'tareas'; // líneas agregadas con una plantilla o con las horas de las tareas
  nota?: string;
  lineas: LineaSemilla[];
}

export interface TareaOtSemilla {
  titulo: string;
  quien: string;
  est: number;
  hecha?: boolean;
  ventana: [desde: number, hasta: number]; // días atrás en que se registran horas en esta tarea
  equipo?: string[]; // quienes registran horas en la tarea (por defecto, solo su responsable)
}

export interface MensajeOtSemilla {
  quien: string;
  texto: string;
  dia: number;
  hora: Hora;
  copiar?: boolean; // «Copiar al ticket»
  tipo?: 'seguimiento' | 'nota_interna';
}

export interface ArchivoOtSemilla {
  nombre: string;
  tipo: 'pdf' | 'xlsx';
  titulo: string;
  lineas: string[];
  dia: number;
  quien: string;
}

export interface OtSemilla {
  n: number;
  ticket: string; // k del ticket
  tipo: TipoOt;
  etapa: EtapaOt;
  fact: Facturacion;
  resp: string;
  titulo: string;
  alcance: string;
  cliente: string; // clave de cliente
  contacto?: string;
  creado: number;
  creador: string;
  inicio?: number;
  termino?: number;
  oc?: string;
  condicion_pago?: string;
  centro_costo?: string;
  area?: string;
  aprobador?: string;
  aprobada?: { quien: string; dia: number }; // internas
  bolsa?: boolean; // descuenta de la bolsa de horas del cliente
  aprobacion?: { forma: FormaAprobacion; quien: string; dia: number; pdf: ArchivoOtSemilla };
  cierre?: { resumen: string; dia: number; quien: string; resolvio: boolean; siguiente?: number };
  cancelacion?: { motivo: string; dia: number; quien: string };
  facturada?: { dia: number; quien: string; n_factura: string };
  horas: number; // horas que la planilla registra en la OT (objetivo; la planilla las reparte por tarea)
  tareas: TareaOtSemilla[];
  mensajes: MensajeOtSemilla[];
  archivos?: ArchivoOtSemilla[];
  cotizaciones: CotizacionSemilla[];
}

const mo = (
  descripcion: string,
  cantidad: number,
  precio: number,
  descuento = 0,
): LineaSemilla => ({
  tipo: 'mano_de_obra',
  descripcion,
  cantidad,
  unidad: 'h',
  precio,
  descuento,
});
const gl = (
  tipo: 'material' | 'servicio',
  descripcion: string,
  precio: number,
  descuento = 0,
): LineaSemilla => ({
  tipo,
  descripcion,
  cantidad: 1,
  unidad: tipo === 'servicio' ? 'un' : 'gl',
  precio,
  descuento,
});

// prettier-ignore
export const OTS: OtSemilla[] = [
  { n: 300, ticket: 'r1', tipo: 'facturable', etapa: 'cerrada', fact: 'facturada', resp: 'fcarrasco', titulo: 'Reconfiguración del firewall y de la VPN sitio a sitio', cliente: 'fv', contacto: 'Matilde Lagos',
    alcance: 'Revisión de reglas y túneles actuales, reconfiguración del firewall y de la VPN entre la planta de packing y la oficina central, actualización de firmware y pruebas durante dos días hábiles.',
    creado: 45, creador: 'ralamos', inicio: 42, termino: 34, condicion_pago: '30 días', bolsa: true,
    aprobacion: { forma: 'cotizacion_firmada', quien: 'ralamos', dia: 43, pdf: { nombre: 'aprobacion-cot-0300.pdf', tipo: 'pdf', titulo: 'Aprobación cotización COT-0300', dia: 43, quien: 'ralamos',
      lineas: ['Cliente: Frutícola Valle de Aconcagua SpA', 'Contacto que aprueba: Matilde Lagos', 'Cotización aprobada: COT-0300 v1 por $412.000 neto', 'Forma de aprobación: cotización firmada y devuelta por el cliente'] } },
    cierre: { resumen: 'Firewall y VPN reconfigurados y probados durante dos días hábiles sin cortes.', dia: 33, quien: 'fcarrasco', resolvio: true },
    facturada: { dia: 26, quien: 'cbustos', n_factura: 'F-2041' },
    horas: 11,
    tareas: [
      { titulo: 'Levantamiento de reglas y túneles actuales', quien: 'fcarrasco', est: 3, hecha: true, ventana: [42, 41] },
      { titulo: 'Reconfiguración del firewall y de la VPN', quien: 'fcarrasco', est: 6, hecha: true, ventana: [41, 36], equipo: ['fcarrasco', 'mnunez'] },
      { titulo: 'Pruebas y documentación', quien: 'mnunez', est: 2, hecha: true, ventana: [36, 34] },
    ],
    mensajes: [
      { quien: 'fcarrasco', texto: 'Levantamiento terminado: hay tres reglas duplicadas y un túnel que reinicia cada 30 minutos. Seguimos con la reconfiguración.', dia: 41, hora: '17:30' },
      { quien: 'fcarrasco', texto: 'Firewall y VPN reconfigurados y probados durante dos días hábiles sin cortes.', dia: 33, hora: '16:00', copiar: true },
    ],
    cotizaciones: [
      { version: 1, estado: 'aprobada', moneda: 'CLP', creada: [45, '10:20'], enviada: [45, '11:00'], respondida: [43, '11:30'], origen: 'tareas',
        lineas: [
          mo('Levantamiento de reglas y túneles actuales', 3, 36000),
          mo('Reconfiguración del firewall y de la VPN', 6, 36000),
          mo('Pruebas y documentación', 2, 36000),
          gl('servicio', 'Actualización de firmware del router de packing', 16000),
        ] },
    ] },
  { n: 301, ticket: 'cs', tipo: 'facturable', etapa: 'cerrada', fact: 'por_facturar', resp: 'fcarrasco', titulo: 'Ampliación de la red WiFi en las consultas', cliente: 'cs', contacto: 'Dra. Fernanda Quiroga',
    alcance: 'Levantamiento de cobertura, instalación y configuración de cuatro puntos de acceso y cableado de los puntos en el segundo piso, parte en horario extendido para no interrumpir las consultas.',
    creado: 29, creador: 'cbustos', inicio: 24, termino: 10, condicion_pago: '30 días',
    aprobacion: { forma: 'correo', quien: 'cbustos', dia: 25, pdf: { nombre: 'aprobacion-cot-0301.pdf', tipo: 'pdf', titulo: 'Aprobación cotización COT-0301', dia: 25, quien: 'cbustos',
      lineas: ['Cliente: Clínica Dental Sonrisa Austral Ltda.', 'Contacto que aprueba: Dra. Fernanda Quiroga', 'Cotización aprobada: COT-0301 v2 por UF 9,40 neto', 'Forma de aprobación: correo del cliente'] } },
    cierre: { resumen: 'Cuatro puntos de acceso instalados; la señal es estable en todas las consultas.', dia: 9, quien: 'fcarrasco', resolvio: true },
    horas: 10,
    tareas: [
      { titulo: 'Levantamiento de cobertura', quien: 'fcarrasco', est: 3, hecha: true, ventana: [24, 23] },
      { titulo: 'Instalación y configuración de los puntos de acceso', quien: 'fcarrasco', est: 3, hecha: true, ventana: [22, 15], equipo: ['fcarrasco', 'jriquelme'] },
      { titulo: 'Cableado y trabajos en horario extendido', quien: 'jriquelme', est: 3, hecha: true, ventana: [15, 10] },
    ],
    mensajes: [
      { quien: 'fcarrasco', texto: 'Levantamiento de cobertura terminado: hay dos zonas muertas y se necesitan cuatro puntos de acceso.', dia: 23, hora: '17:00' },
      { quien: 'fcarrasco', texto: 'Cuatro puntos de acceso instalados; la señal es estable en todas las consultas.', dia: 9, hora: '16:00', copiar: true },
    ],
    cotizaciones: [
      { version: 1, estado: 'reemplazada', moneda: 'UF', creada: [29, '10:00'], enviada: [29, '10:30'],
        lineas: [
          mo('Levantamiento de cobertura', 3, 0.85),
          mo('Instalación de puntos de acceso', 4, 0.85),
          gl('material', 'Conectores, cable y canalización', 1.15),
        ] },
      { version: 2, estado: 'aprobada', moneda: 'UF', creada: [27, '10:00'], enviada: [26, '10:30'], respondida: [25, '11:30'], desde_version: 1,
        lineas: [
          mo('Levantamiento de cobertura', 3, 0.85),
          mo('Instalación y configuración de cuatro puntos de acceso', 3, 0.85),
          mo('Trabajos en horario extendido (consultas ocupadas)', 3, 1.05),
          gl('material', 'Conectores, cable y canalización', 1.15),
        ] },
    ] },
  { n: 302, ticket: 'e1', tipo: 'facturable', etapa: 'en_ejecucion', fact: 'pendiente', resp: 'fcarrasco', titulo: 'Renovación de la red y del cableado de las tres bodegas', cliente: 'tr', contacto: 'Patricio Ibarra',
    alcance: 'Levantamiento y diseño, cableado estructurado de 210 puntos en tres bodegas, configuración y puesta en marcha de switches y access points, pruebas, certificación y capacitación del personal.',
    creado: 60, creador: 'ralamos', inicio: 55, oc: 'OC-7781', condicion_pago: '45 días',
    aprobacion: { forma: 'orden_de_compra', quien: 'ralamos', dia: 56, pdf: { nombre: 'oc-7781.pdf', tipo: 'pdf', titulo: 'Orden de compra OC-7781', dia: 56, quien: 'ralamos',
      lineas: ['Cliente: Transportes Río Claro S.A.', 'Referencia: COT-0302 v1', 'Descripción: renovación de la red y del cableado de las tres bodegas', 'Condición de pago: 45 días'] } },
    horas: 950,
    tareas: [
      { titulo: 'Levantamiento y diseño de la red de las tres bodegas', quien: 'fcarrasco', est: 80, hecha: true, ventana: [55, 46], equipo: ['fcarrasco', 'jriquelme', 'mnunez'] },
      { titulo: 'Cableado estructurado de las bodegas 1 y 2', quien: 'jriquelme', est: 280, hecha: true, ventana: [47, 24], equipo: ['jriquelme', 'mnunez', 'fcarrasco'] },
      { titulo: 'Cableado estructurado de la bodega 3', quien: 'mnunez', est: 140, hecha: true, ventana: [26, 10], equipo: ['mnunez', 'jriquelme', 'fcarrasco'] },
      { titulo: 'Configuración y puesta en marcha de los equipos de red', quien: 'fcarrasco', est: 160, hecha: true, ventana: [14, 3], equipo: ['fcarrasco', 'gtapia', 'dpizarro', 'mnunez', 'aloyola', 'asepulveda'] },
      { titulo: 'Pruebas, certificación y capacitación', quien: 'mnunez', est: 16, ventana: [4, 0], equipo: ['mnunez', 'fcarrasco', 'asepulveda'] },
    ],
    mensajes: [
      { quien: 'fcarrasco', texto: 'Levantamiento y diseño aprobados por el cliente; partimos con el cableado de la bodega 1.', dia: 49, hora: '17:10' },
      { quien: 'fcarrasco', texto: 'Cableado terminado en las tres bodegas y certificado el 90 % de los puntos. Pasamos a la configuración final de los equipos.', dia: 12, hora: '16:40', copiar: true },
      { quien: 'mnunez', texto: 'Pruebas de WiFi con los terminales de carga en curso; falta la capacitación al personal de bodega.', dia: 1, hora: '12:20' },
    ],
    archivos: [{ nombre: 'levantamiento-bodegas.xlsx', tipo: 'xlsx', titulo: 'Levantamiento de bodegas', dia: 50, quien: 'fcarrasco', lineas: [] }],
    cotizaciones: [
      { version: 1, estado: 'aprobada', moneda: 'CLP', creada: [60, '10:00'], enviada: [59, '11:00'], respondida: [56, '11:30'],
        lineas: [
          mo('Levantamiento y diseño de la red de las tres bodegas', 80, 38000),
          mo('Cableado estructurado de 210 puntos', 420, 38000),
          mo('Configuración y puesta en marcha de los equipos de red', 160, 38000),
          mo('Pruebas, certificación y capacitación', 16, 38000),
          gl('material', 'Cable, canalización y gabinetes', 14500000, 3),
          gl('material', 'Equipos de red (switches y puntos de acceso)', 9800000, 5),
          { tipo: 'traslado', descripcion: 'Traslado a las bodegas', cantidad: 900, unidad: 'km', precio: 450 },
        ] },
    ] },
  { n: 303, ticket: 'w1', tipo: 'facturable', etapa: 'cotizada', fact: 'pendiente', resp: 'fcarrasco', titulo: 'Red adicional y WiFi para la oficina y la bodega de obra', cliente: 'cp', contacto: 'Hernán Zúñiga',
    alcance: 'Cuatro puntos de red adicionales en la oficina de obra y cobertura WiFi en la bodega de materiales.',
    creado: 23, creador: 'ralamos', condicion_pago: '60 días',
    horas: 14,
    tareas: [
      { titulo: 'Visita de levantamiento en la obra', quien: 'fcarrasco', est: 4, hecha: true, ventana: [23, 22] },
      { titulo: 'Elaborar la cotización con el plano de puntos', quien: 'ralamos', est: 2, hecha: true, ventana: [22, 21] },
    ],
    mensajes: [
      { quien: 'fcarrasco', texto: 'Visita realizada: la oficina de obra tiene canalización disponible; la bodega necesita dos puntos de acceso exteriores.', dia: 22, hora: '17:15' },
      { quien: 'ralamos', texto: 'El cliente rechazó la primera versión por el costo del WiFi de bodega. Preparamos la versión 2 con menos alcance y descuento.', dia: 14, hora: '10:30' },
    ],
    cotizaciones: [
      { version: 1, estado: 'rechazada', moneda: 'CLP', creada: [22, '10:00'], enviada: [22, '11:00'], respondida: [15, '10:30'],
        lineas: [
          mo('Visita de levantamiento', 4, 38000),
          mo('Instalación de cuatro puntos de red', 12, 38000),
          mo('Instalación de WiFi de cobertura en la bodega', 16, 38000),
          gl('material', 'Cable, conectores y canalización', 780000),
          gl('material', 'Equipos WiFi de exterior', 1250000),
        ] },
      { version: 2, estado: 'enviada', moneda: 'CLP', creada: [14, '09:30'], enviada: [13, '10:00'], desde_version: 1, nota: 'El cliente lo revisa con Adquisiciones; llamar si no responde.',
        lineas: [
          mo('Instalación de cuatro puntos de red', 12, 38000),
          mo('Instalación de WiFi en la bodega (alcance reducido)', 10, 38000, 8),
          gl('material', 'Cable, conectores y canalización', 780000),
          gl('material', 'Equipos WiFi de exterior', 980000, 8),
        ] },
    ] },
  { n: 304, ticket: 'e2', tipo: 'facturable', etapa: 'borrador', fact: 'pendiente', resp: 'mnunez', titulo: 'Renovación de 20 notebooks: levantamiento y propuesta', cliente: 'ic', contacto: 'Cristóbal Echeverría',
    alcance: 'Inventario de los 20 notebooks actuales, evaluación de su estado y propuesta técnica y económica de reemplazo.',
    creado: 6, creador: 'cbustos', condicion_pago: '30 días',
    horas: 14,
    tareas: [
      { titulo: 'Inventariar los 20 equipos actuales', quien: 'gtapia', est: 8, ventana: [6, 0] },
      { titulo: 'Evaluar el estado de baterías y discos', quien: 'mnunez', est: 4, ventana: [5, 0] },
      { titulo: 'Redactar la propuesta de reemplazo', quien: 'mnunez', est: 3, ventana: [2, 0] },
    ],
    mensajes: [{ quien: 'mnunez', texto: 'Inventario al 70 %. Las horas registradas están listas para importarlas a la cotización.', dia: 3, hora: '12:00' }],
    archivos: [{ nombre: 'inventario-notebooks.xlsx', tipo: 'xlsx', titulo: 'Inventario de notebooks', dia: 4, quien: 'gtapia', lineas: [] }],
    cotizaciones: [
      { version: 1, estado: 'borrador', moneda: 'CLP', creada: [5, '14:00'],
        lineas: [mo('Inventario y evaluación de 20 equipos', 12, 38000), mo('Propuesta técnica y económica', 3, 38000)] },
    ] },
  { n: 305, ticket: 'pd', tipo: 'facturable', etapa: 'cancelada', fact: 'no_aplica', resp: 'ralamos', titulo: 'Punto de venta con boleta electrónica', cliente: 'pd', contacto: 'Rosa Maldonado',
    alcance: 'Visita al local, instalación de un terminal de punto de venta con impresora de boletas y capacitación a la dueña.',
    creado: 19, creador: 'ralamos', condicion_pago: 'Contado',
    cancelacion: { motivo: 'La dueña decidió postergar la compra del sistema por costos.', dia: 11, quien: 'ralamos' },
    horas: 3,
    tareas: [
      { titulo: 'Visita al local y levantamiento de necesidades', quien: 'ralamos', est: 2, hecha: true, ventana: [19, 18] },
      { titulo: 'Preparar la cotización con la plantilla de visita', quien: 'ralamos', est: 1, hecha: true, ventana: [18, 17] },
    ],
    mensajes: [{ quien: 'ralamos', texto: 'Visita realizada; la dueña quiere una opción simple y barata. Preparo la cotización con la plantilla de visita.', dia: 18, hora: '17:40' }],
    cotizaciones: [
      { version: 1, estado: 'enviada', moneda: 'CLP', aplica_iva: false, creada: [18, '10:00'], enviada: [17, '10:30'], origen: 'plantilla',
        nota: 'Cliente exento de IVA en este servicio (dato ficticio de la demo).',
        lineas: [
          mo('Visita y diagnóstico en terreno', 2, 38000),
          { tipo: 'traslado', descripcion: 'Traslado', cantidad: 60, unidad: 'km', precio: 450 },
          gl('servicio', 'Informe técnico', 45000),
        ] },
    ] },
  { n: 306, ticket: 'e3', tipo: 'interna', etapa: 'en_ejecucion', fact: 'no_aplica', resp: 'jriquelme', titulo: 'Instalación de pizarras interactivas', cliente: 'ca',
    alcance: 'Instalar y calibrar seis pizarras interactivas, cablear los puntos de red de las salas y capacitar al personal docente.',
    creado: 20, creador: 'cbustos', inicio: 19, centro_costo: 'Proyecto aulas digitales', area: 'Dirección académica', aprobador: 'cbustos', aprobada: { quien: 'cbustos', dia: 20 },
    horas: 38,
    tareas: [
      { titulo: 'Instalar y calibrar las pizarras de las salas 1 a 3', quien: 'jriquelme', est: 6, hecha: true, ventana: [19, 12] },
      { titulo: 'Cablear los puntos de red de las salas 4 a 6', quien: 'jriquelme', est: 5, ventana: [10, 0] },
      { titulo: 'Instalar y calibrar las pizarras de las salas 4 a 6', quien: 'jriquelme', est: 6, ventana: [5, 0] },
      { titulo: 'Capacitar al personal docente', quien: 'ralamos', est: 2, ventana: [3, 0] },
    ],
    mensajes: [{ quien: 'jriquelme', texto: 'Tres pizarras instaladas y calibradas. Voy con el cableado de las salas 4 a 6.', dia: 12, hora: '17:20' }],
    cotizaciones: [] },
  { n: 307, ticket: 'e4', tipo: 'interna', etapa: 'borrador', fact: 'no_aplica', resp: 'jriquelme', titulo: 'Reemplazo de la UPS de la sala de servidores', cliente: 'op',
    alcance: 'Retirar la UPS antigua con baterías agotadas e instalar y configurar una UPS nueva de mayor capacidad.',
    creado: 2, creador: 'jriquelme', centro_costo: 'Operaciones', area: 'Operaciones', aprobador: 'cbustos',
    horas: 0,
    tareas: [
      { titulo: 'Retirar la UPS antigua', quien: 'jriquelme', est: 3, ventana: [0, 0] },
      { titulo: 'Instalar y configurar la UPS nueva', quien: 'jriquelme', est: 3, ventana: [0, 0] },
    ],
    mensajes: [],
    cotizaciones: [] },
  { n: 308, ticket: 'e5', tipo: 'interna', etapa: 'cerrada', fact: 'no_aplica', resp: 'fcarrasco', titulo: 'Reordenamiento del rack y enlace temporal en Rancagua', cliente: 'br',
    alcance: 'Reordenar y rotular el rack de la base y levantar un enlace temporal por el router de respaldo mientras el proveedor resuelve el enlace principal.',
    creado: 10, creador: 'cbustos', inicio: 9, termino: 8, centro_costo: 'Base Rancagua', area: 'Base Rancagua', aprobador: 'cbustos', aprobada: { quien: 'cbustos', dia: 10 },
    cierre: { resumen: 'Rack reordenado y enlace temporal operativo; falta el cambio de módem del proveedor, por lo que el ticket sigue abierto.', dia: 8, quien: 'fcarrasco', resolvio: false },
    horas: 7,
    tareas: [
      { titulo: 'Reordenar y rotular el rack de la base', quien: 'fcarrasco', est: 4, hecha: true, ventana: [9, 9] },
      { titulo: 'Levantar el enlace temporal por el router de respaldo', quien: 'fcarrasco', est: 3, hecha: true, ventana: [9, 8] },
    ],
    mensajes: [],
    cotizaciones: [] },
  { n: 309, ticket: 'e6', tipo: 'interna', etapa: 'cerrada', fact: 'no_aplica', resp: 'aloyola', titulo: 'Migración de las carpetas de Finanzas a la nube', cliente: 'af',
    alcance: 'Definir la estructura de carpetas y permisos por área y migrar las carpetas del área de Finanzas.',
    creado: 27, creador: 'cbustos', inicio: 26, termino: 10, centro_costo: 'Finanzas', area: 'Administración y Finanzas', aprobador: 'cbustos', aprobada: { quien: 'cbustos', dia: 27 },
    cierre: { resumen: 'Finanzas migrada (180 GB) y accesos validados. Se continúa con Contabilidad y Adquisiciones en una nueva OT.', dia: 10, quien: 'aloyola', resolvio: false, siguiente: 310 },
    horas: 30,
    tareas: [
      { titulo: 'Definir la estructura de carpetas y los permisos', quien: 'aloyola', est: 4, hecha: true, ventana: [26, 22] },
      { titulo: 'Migrar las carpetas de Finanzas', quien: 'aloyola', est: 8, hecha: true, ventana: [21, 12] },
      { titulo: 'Validar los accesos con el área', quien: 'ralamos', est: 2, hecha: true, ventana: [12, 10] },
    ],
    mensajes: [],
    cotizaciones: [] },
  { n: 310, ticket: 'e6', tipo: 'interna', etapa: 'en_ejecucion', fact: 'no_aplica', resp: 'aloyola', titulo: 'Migración de Contabilidad y Adquisiciones a la nube', cliente: 'af',
    alcance: 'Migrar las carpetas de Contabilidad y Adquisiciones y apagar el servidor antiguo una vez validado.',
    creado: 10, creador: 'aloyola', inicio: 9, centro_costo: 'Finanzas', area: 'Administración y Finanzas', aprobador: 'cbustos', aprobada: { quien: 'cbustos', dia: 10 },
    horas: 14,
    tareas: [
      { titulo: 'Migrar las carpetas de Contabilidad', quien: 'aloyola', est: 6, ventana: [9, 0] },
      { titulo: 'Migrar las carpetas de Adquisiciones', quien: 'aloyola', est: 4, ventana: [6, 0] },
      { titulo: 'Apagar el servidor antiguo tras la validación', quien: 'aloyola', est: 2, ventana: [0, 0] },
    ],
    mensajes: [{ quien: 'aloyola', texto: 'Contabilidad al 60 %. Dejamos el servidor antiguo en solo lectura hasta validar con el área.', dia: 3, hora: '17:00' }],
    cotizaciones: [] },
];
