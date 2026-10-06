import type { Plazo } from '@zydesk/shared';
import { dataSource } from '../../../config/db.js';
import { hashear } from '../../../core/auth/contrasena.js';
import { enTransaccion } from '../../../core/historial/transaccion.js';
import { versionTerminosVigente } from '../../../modulos/legal/legal.service.js';
import { fechaRelativa, rutConDv, valorUf, type Personas } from './util.js';

// Organización ficticia de la demo (spec fase 9 §11.3): «Servicios Técnicos Patagua». Idempotente por nombre/correo:
// nunca pisa lo que ya existe (la marca, el logo, las tarifas y la numeración solo si siguen en su valor inicial).

export const DOMINIO_DEMO = '@demo.zytech.dev';
export const NOMBRE_APP = 'Zydesk · Demo Patagua';

type Dia = { activo: boolean; entrada: string; salida: string };
const LIBRE: Dia = { activo: false, entrada: '09:00', salida: '13:00' };
const jornada = (entrada: string, salida: string): Dia => ({ activo: true, entrada, salida });
const semana = (lunesAJueves: Dia, viernes: Dia): Record<number, Dia> => ({
  0: LIBRE,
  1: lunesAJueves,
  2: lunesAJueves,
  3: lunesAJueves,
  4: lunesAJueves,
  5: viernes,
  6: LIBRE,
});

const DEPARTAMENTOS = [
  {
    nombre: 'Mesa de ayuda',
    extendida: '19:00',
    capacidad: 80,
    dias: semana(jornada('08:30', '18:00'), jornada('08:30', '16:30')),
  },
  {
    nombre: 'Terreno',
    extendida: '18:00',
    capacidad: 90,
    dias: semana(jornada('08:00', '17:00'), jornada('08:00', '17:00')),
  },
  {
    nombre: 'Coordinación',
    extendida: '19:00',
    capacidad: 50,
    dias: semana(jornada('09:00', '18:00'), jornada('09:00', '17:00')),
  },
];

type Rol = 'admin' | 'coordinacion' | 'tecnico' | 'lectura';
// prettier-ignore
export const PERSONAS: { nombre: string; usuario: string; rol: Rol; departamento: string; color: string; activo?: boolean }[] = [
  { nombre: 'Paula Hidalgo', usuario: 'phidalgo', rol: 'admin', departamento: 'Coordinación', color: '#CFDDF3' },
  { nombre: 'Rodrigo Álamos', usuario: 'ralamos', rol: 'coordinacion', departamento: 'Mesa de ayuda', color: '#F2D7C9' },
  { nombre: 'Carolina Bustos', usuario: 'cbustos', rol: 'coordinacion', departamento: 'Coordinación', color: '#F3CFD9' },
  { nombre: 'Andrés Loyola', usuario: 'aloyola', rol: 'tecnico', departamento: 'Mesa de ayuda', color: '#D9EBD3' },
  { nombre: 'Daniela Pizarro', usuario: 'dpizarro', rol: 'tecnico', departamento: 'Mesa de ayuda', color: '#EBDDF3' },
  { nombre: 'Felipe Carrasco', usuario: 'fcarrasco', rol: 'tecnico', departamento: 'Terreno', color: '#F3E7C4' },
  { nombre: 'Marcela Núñez', usuario: 'mnunez', rol: 'tecnico', departamento: 'Terreno', color: '#CDEBE6' },
  { nombre: 'Joaquín Riquelme', usuario: 'jriquelme', rol: 'tecnico', departamento: 'Terreno', color: '#DAD6CF' },
  { nombre: 'Antonia Sepúlveda', usuario: 'asepulveda', rol: 'tecnico', departamento: 'Mesa de ayuda', color: '#D3E0F0' },
  { nombre: 'Gonzalo Tapia', usuario: 'gtapia', rol: 'tecnico', departamento: 'Mesa de ayuda', color: '#E6E2C8' },
  { nombre: 'Ximena Arrau', usuario: 'xarrau', rol: 'lectura', departamento: 'Coordinación', color: '#E9D3E4' },
  { nombre: 'Ignacio Vera', usuario: 'ivera', rol: 'lectura', departamento: 'Coordinación', color: '#D7E8F7', activo: false },
];

// responsable, primera respuesta (horas) y resolución alta (días); el resto se deriva de la alta.
// prettier-ignore
const CATEGORIAS: { nombre: string; responsable: string; respuesta_h: number; alta_dias: number }[] = [
  { nombre: 'ERP y facturación', responsable: 'aloyola', respuesta_h: 2, alta_dias: 1 },
  { nombre: 'Redes y conectividad', responsable: 'fcarrasco', respuesta_h: 1, alta_dias: 1 },
  { nombre: 'Correo y colaboración', responsable: 'dpizarro', respuesta_h: 2, alta_dias: 2 },
  { nombre: 'Equipos y periféricos', responsable: 'mnunez', respuesta_h: 4, alta_dias: 3 },
  { nombre: 'Accesos y cuentas', responsable: 'asepulveda', respuesta_h: 4, alta_dias: 1 },
  { nombre: 'Climatización y energía', responsable: 'jriquelme', respuesta_h: 4, alta_dias: 3 },
  { nombre: 'Proyectos y mejoras', responsable: 'ralamos', respuesta_h: 8, alta_dias: 10 },
];

interface ClienteSemilla {
  nombre: string;
  rut: number | null; // cuerpo del RUT inventado
  interno: boolean;
  direccion?: string;
  condicion_pago?: string;
  exige_oc?: boolean;
  notas?: string;
  dominio?: string;
  contactos?: { nombre: string; area: string; telefono: string; aprueba: boolean }[];
}

// prettier-ignore
export const CLIENTES: ClienteSemilla[] = [
  { nombre: 'Frutícola Valle de Aconcagua SpA', rut: 76412905, interno: false, direccion: 'Camino Los Andes 1450, San Felipe', condicion_pago: '30 días', exige_oc: false, dominio: 'fruticolavalle.test',
    notas: 'Cliente con bolsa de 20 horas mensuales y tarifas pactadas.',
    contactos: [
      { nombre: 'Matilde Lagos', area: 'Administración', telefono: '+56 9 0000 1101', aprueba: true },
      { nombre: 'Esteban Cornejo', area: 'Operaciones', telefono: '+56 9 0000 1102', aprueba: false },
    ] },
  { nombre: 'Clínica Dental Sonrisa Austral Ltda.', rut: 77284163, interno: false, direccion: 'Av. Providencia 2310, oficina 4, Santiago', condicion_pago: '30 días', exige_oc: false, dominio: 'sonrisaaustral.test',
    notas: 'Tarifas pactadas en UF.',
    contactos: [{ nombre: 'Dra. Fernanda Quiroga', area: 'Dirección', telefono: '+56 9 0000 1103', aprueba: true }] },
  { nombre: 'Transportes Río Claro S.A.', rut: 76930518, interno: false, direccion: 'Ruta 5 Sur km 52, Buin', condicion_pago: '45 días', exige_oc: true, dominio: 'rioclaro.test',
    contactos: [
      { nombre: 'Patricio Ibarra', area: 'Gerencia de operaciones', telefono: '+56 9 0000 1104', aprueba: true },
      { nombre: 'Lorena Maturana', area: 'Logística', telefono: '+56 9 0000 1110', aprueba: false },
      { nombre: 'Sergio Vidal', area: 'Bodega Buin', telefono: '+56 9 0000 1111', aprueba: false },
    ] },
  { nombre: 'Colegio Bicentenario Los Aromos', rut: 65118342, interno: false, direccion: 'Calle Los Aromos 880, Rancagua', dominio: 'losaromos.test',
    notas: 'Institución sin fines de lucro; la mayoría de los trabajos son OT internas.',
    contactos: [{ nombre: 'Ana María Peñailillo', area: 'Dirección académica', telefono: '+56 9 0000 1106', aprueba: true }] },
  { nombre: 'Inmobiliaria Cumbres del Maipo', rut: 76705934, interno: false, direccion: 'Av. Las Condes 9100, piso 7, Santiago', condicion_pago: '30 días', dominio: 'cumbresdelmaipo.test',
    contactos: [
      { nombre: 'Cristóbal Echeverría', area: 'Finanzas', telefono: '+56 9 0000 1107', aprueba: true },
      { nombre: 'Valeria Montecinos', area: 'Administración', telefono: '+56 9 0000 1112', aprueba: false },
    ] },
  { nombre: 'Panadería y Pastelería Doña Rosa EIRL', rut: 76589021, interno: false, direccion: 'Av. Independencia 455, Rancagua', condicion_pago: 'Contado', dominio: 'donarosa.test',
    contactos: [{ nombre: 'Rosa Maldonado', area: 'Dueña', telefono: '+56 9 0000 1108', aprueba: true }] },
  { nombre: 'Constructora Puente Alto Norte Ltda.', rut: 77041256, interno: false, direccion: 'Av. Concha y Toro 3100, Puente Alto', condicion_pago: '60 días', exige_oc: true, dominio: 'puentealtonorte.test',
    contactos: [
      { nombre: 'Hernán Zúñiga', area: 'Jefatura de obra', telefono: '+56 9 0000 1105', aprueba: true },
      { nombre: 'Gabriela Soto', area: 'Adquisiciones', telefono: '+56 9 0000 1109', aprueba: false },
    ] },
  { nombre: 'Administración y Finanzas', rut: null, interno: true },
  { nombre: 'Operaciones', rut: null, interno: true },
  { nombre: 'Base Rancagua', rut: null, interno: true },
];

export const NOMBRES_DEMO = {
  frutícola: 'Frutícola Valle de Aconcagua SpA',
  clinica: 'Clínica Dental Sonrisa Austral Ltda.',
  transportes: 'Transportes Río Claro S.A.',
  colegio: 'Colegio Bicentenario Los Aromos',
  inmobiliaria: 'Inmobiliaria Cumbres del Maipo',
  panaderia: 'Panadería y Pastelería Doña Rosa EIRL',
  constructora: 'Constructora Puente Alto Norte Ltda.',
  finanzas: 'Administración y Finanzas',
  operaciones: 'Operaciones',
  rancagua: 'Base Rancagua',
} as const;

const TARIFAS_BASE = {
  hora_normal: null,
  hora_extendida: null,
  hora_urgencia: null,
  traslado_km: null,
  costo_interno: null,
  iva_pct: 19,
  validez_dias_defecto: 30,
  condiciones_defecto: null,
};
const TARIFAS_DEMO = {
  ...TARIFAS_BASE,
  hora_normal: { moneda: 'CLP', valor: 38000 },
  hora_extendida: { moneda: 'CLP', valor: 45000 },
  hora_urgencia: { moneda: 'CLP', valor: 60000 },
  traslado_km: { moneda: 'CLP', valor: 450 },
  costo_interno: 18000,
  condiciones_defecto:
    'Precios netos en pesos chilenos (CLP); el IVA se agrega según corresponda. Forma de pago: a 30 días desde la fecha de la factura. Los trabajos fuera del horario hábil se cobran con la tarifa extendida. No incluye repuestos ni licencias salvo indicación expresa.',
};

// Logo simple (círculo + «P»), SVG de unos 400 bytes.
const LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="30" fill="#1f5fbf"/><text x="32" y="44" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="700" fill="#ffffff">P</text></svg>';

async function sembrarMarcaYConfiguracion(): Promise<void> {
  await dataSource.query(
    `UPDATE configuracion SET valor = $1::jsonb, actualizado_en = now() WHERE clave = 'nombre_app' AND valor = '"Zydesk"'::jsonb`,
    [JSON.stringify(NOMBRE_APP)],
  );
  await dataSource.query(
    `UPDATE configuracion SET valor = $1::jsonb, actualizado_en = now() WHERE clave = 'logo' AND valor = 'null'::jsonb`,
    [
      JSON.stringify({
        tipo_mime: 'image/svg+xml',
        base64: Buffer.from(LOGO_SVG).toString('base64'),
      }),
    ],
  );
  await dataSource.query(
    `UPDATE configuracion SET valor = $2::jsonb, actualizado_en = now() WHERE clave = 'tarifas' AND valor = $1::jsonb`,
    [JSON.stringify(TARIFAS_BASE), JSON.stringify(TARIFAS_DEMO)],
  );
  // Numeración: TK- desde 2000 (4 dígitos), OT- desde 300; solo mientras el contador no haya avanzado
  await dataSource.query(
    `UPDATE contador SET inicial = 2000, valor = 1999, actualizado_en = now()
      WHERE clave = 'ticket' AND prefijo = 'TK-' AND valor = 999`,
  );
  await dataSource.query(
    `UPDATE contador SET inicial = 300, valor = 299, actualizado_en = now()
      WHERE clave = 'ot' AND prefijo = 'OT-' AND valor = 199`,
  );
}

async function sembrarDepartamentos(): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (const d of DEPARTAMENTOS) {
    const [existente] = await dataSource.query(`SELECT id FROM departamento WHERE nombre = $1`, [
      d.nombre,
    ]);
    if (existente) {
      ids.set(d.nombre, existente.id);
      continue;
    }
    await enTransaccion(async (tx) => {
      const [{ id }] = await tx.query(
        `INSERT INTO departamento (nombre, hora_extendida_desde, capacidad_tickets_pct)
         VALUES ($1, $2, $3) RETURNING id`,
        [d.nombre, d.extendida, d.capacidad],
      );
      for (let dia = 0; dia <= 6; dia++) {
        const h = d.dias[dia]!;
        await tx.query(
          `INSERT INTO horario_dia (departamento_id, dia_semana, activo, entrada, salida, colacion_inicio, colacion_min)
           VALUES ($1, $2, $3, $4, $5, '13:00', $6)`,
          [id, dia, h.activo, h.entrada, h.salida, h.activo ? 60 : 0],
        );
      }
      ids.set(d.nombre, id);
    });
  }
  // Feriado propio de Terreno, dentro de tres semanas (relativo a la fecha de carga; una sola vez por nombre)
  const [propio] = await dataSource.query(`SELECT 1 FROM feriado WHERE nombre = $1`, [
    'Aniversario base Rancagua',
  ]);
  if (!propio) {
    await dataSource.query(
      `INSERT INTO feriado (fecha, nombre, departamento_id) VALUES ($1::date, $2, $3)
       ON CONFLICT (fecha, departamento_id) DO NOTHING`,
      [await fechaRelativa(dataSource, -21), 'Aniversario base Rancagua', ids.get('Terreno')],
    );
  }
  return ids;
}

async function sembrarPersonas(
  contrasena: string,
  departamentos: Map<string, number>,
): Promise<Personas> {
  const hash = await hashear(contrasena);
  const version = versionTerminosVigente();
  const ids: Personas = new Map();
  for (const p of PERSONAS) {
    const correo = `${p.usuario}${DOMINIO_DEMO}`;
    const [existente] = await dataSource.query(`SELECT id FROM usuario WHERE correo = $1`, [
      correo,
    ]);
    if (existente) {
      ids.set(p.usuario, existente.id);
      continue;
    }
    const [{ id }] = await dataSource.query(
      `INSERT INTO usuario (nombre, correo, contrasena_hash, rol, departamento_id, activo, color_avatar,
                            debe_cambiar_contrasena, terminos_version, terminos_aceptados_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, now()) RETURNING id`,
      [
        p.nombre,
        correo,
        hash,
        p.rol,
        departamentos.get(p.departamento),
        p.activo !== false,
        p.color,
        version,
      ],
    );
    ids.set(p.usuario, id);
  }
  return ids;
}

async function sembrarCategorias(personas: Personas): Promise<void> {
  for (const c of CATEGORIAS) {
    const dias = (valor: number): Plazo => ({ valor, unidad: 'dias' });
    await dataSource.query(
      `INSERT INTO categoria (nombre, responsable_defecto_id, plazo_respuesta, plazo_resolucion)
       VALUES ($1, $2, $3::jsonb, $4::jsonb) ON CONFLICT (lower(nombre)) DO NOTHING`,
      [
        c.nombre,
        personas.get(c.responsable),
        JSON.stringify({ valor: c.respuesta_h, unidad: 'horas' }),
        JSON.stringify({
          urgente: dias(Math.max(1, Math.ceil(c.alta_dias / 2))),
          alta: dias(c.alta_dias),
          media: dias(c.alta_dias * 2),
          baja: dias(c.alta_dias * 3),
        }),
      ],
    );
  }
}

async function sembrarClientes(): Promise<void> {
  for (const c of CLIENTES) {
    const [existente] = await dataSource.query(
      `SELECT id FROM cliente WHERE lower(nombre) = lower($1)`,
      [c.nombre],
    );
    if (existente) continue;
    const [{ id }] = await dataSource.query(
      `INSERT INTO cliente (nombre, rut, direccion, es_interno, condicion_pago, exige_oc, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        c.nombre,
        c.rut === null ? null : rutConDv(c.rut),
        c.direccion ?? null,
        c.interno,
        c.condicion_pago ?? null,
        c.exige_oc ?? false,
        c.notas ?? null,
      ],
    );
    for (const k of c.contactos ?? []) {
      await dataSource.query(
        `INSERT INTO contacto (cliente_id, nombre, area, correo, telefono, aprueba_cotizaciones)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, k.nombre, k.area, `${alias(k.nombre)}@${c.dominio}`, k.telefono, k.aprueba],
      );
    }
  }
}

// «Matilde Lagos» → «mlagos»: correo ficticio en un dominio reservado `.test`
const alias = (nombre: string): string => {
  const [primero, ...resto] = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^Dra?\.\s*/, '')
    .toLowerCase()
    .split(/\s+/);
  return `${primero![0]}${resto.at(-1) ?? ''}`;
};

// Bolsa de 20 h/mes de la frutícola y tarifas por cliente (la clínica, en UF). Solo si todavía no existen.
async function sembrarContratosYTarifas(): Promise<void> {
  const mapa = async (nombre: string): Promise<number | null> =>
    (await dataSource.query(`SELECT id FROM cliente WHERE nombre = $1`, [nombre]))[0]?.id ?? null;
  const fruticola = await mapa(NOMBRES_DEMO.frutícola);
  const clinica = await mapa(NOMBRES_DEMO.clinica);
  if (fruticola !== null) {
    const hay =
      (await dataSource.query(`SELECT 1 FROM contrato_bolsa WHERE cliente_id = $1`, [fruticola]))
        .length > 0;
    if (!hay) {
      await dataSource.query(
        `INSERT INTO contrato_bolsa (cliente_id, horas_mes, vigente_desde, vigente_hasta, fecha_renovacion, notas)
         VALUES ($1, 20, (date_trunc('month', (now() AT TIME ZONE 'America/Santiago')::date) - interval '3 months')::date,
                 NULL, (date_trunc('month', (now() AT TIME ZONE 'America/Santiago')::date) + interval '1 month')::date,
                 'Bolsa mensual de soporte; se descuenta de las OT facturables del cliente.')`,
        [fruticola],
      );
    }
    for (const [concepto, valor] of [
      ['hora_normal', 36000],
      ['hora_extendida', 44000],
    ] as const) {
      await dataSource.query(
        `INSERT INTO tarifa_cliente (cliente_id, concepto, valor, moneda) VALUES ($1, $2, $3, 'CLP')
         ON CONFLICT DO NOTHING`,
        [fruticola, concepto, valor],
      );
    }
  }
  if (clinica !== null) {
    for (const [concepto, valor] of [
      ['hora_normal', 0.85],
      ['hora_extendida', 1.05],
    ] as const) {
      await dataSource.query(
        `INSERT INTO tarifa_cliente (cliente_id, concepto, valor, moneda) VALUES ($1, $2, $3, 'UF')
         ON CONFLICT DO NOTHING`,
        [clinica, concepto, valor],
      );
    }
  }
}

// UF de los últimos 10 días hábiles (fuente `semilla`), crecientes y alrededor de 41 1xx.
async function sembrarIndicadorUf(): Promise<void> {
  let sembrados = 0;
  for (let dias = 0; sembrados < 10 && dias < 20; dias++) {
    const [{ dow }] = await dataSource.query(
      `SELECT extract(dow FROM (now() AT TIME ZONE 'America/Santiago')::date - $1::int)::int AS dow`,
      [dias],
    );
    if (dow === 0 || dow === 6) continue;
    await dataSource.query(
      `INSERT INTO indicador_uf (fecha, valor, fuente)
       VALUES ((now() AT TIME ZONE 'America/Santiago')::date - $1::int, $2, 'semilla') ON CONFLICT (fecha) DO NOTHING`,
      [dias, valorUf(dias)],
    );
    sembrados++;
  }
}

// prettier-ignore
const PLANTILLAS: { nombre: string; descripcion: string; lineas: [string, string, string][] }[] = [
  { nombre: 'Visita técnica estándar', descripcion: 'Visita a terreno con diagnóstico e informe.', lineas: [
    ['mano_de_obra', 'Visita y diagnóstico en terreno', 'h'], ['traslado', 'Traslado', 'km'], ['servicio', 'Informe técnico', 'un'] ] },
  { nombre: 'Soporte por horas', descripcion: 'Para incidentes de clientes con contrato de horas.', lineas: [
    ['mano_de_obra', 'Diagnóstico', 'h'], ['mano_de_obra', 'Implementación', 'h'], ['servicio', 'Soporte post-implementación', 'un'] ] },
  { nombre: 'Proyecto de instalación', descripcion: 'Cableado, redes o equipos nuevos.', lineas: [
    ['mano_de_obra', 'Levantamiento', 'h'], ['material', 'Materiales', 'gl'], ['mano_de_obra', 'Instalación', 'h'], ['servicio', 'Certificación', 'un'] ] },
];

async function sembrarPlantillas(): Promise<void> {
  for (const p of PLANTILLAS) {
    const existe: unknown[] = await dataSource.query(
      `SELECT 1 FROM plantilla_cotizacion WHERE lower(nombre) = lower($1)`,
      [p.nombre],
    );
    if (existe.length > 0) continue;
    await enTransaccion(async (tx) => {
      const [{ id }] = await tx.query(
        `INSERT INTO plantilla_cotizacion (nombre, descripcion) VALUES ($1, $2) RETURNING id`,
        [p.nombre, p.descripcion],
      );
      for (const [i, [tipo, descripcion, unidad]] of p.lineas.entries()) {
        await tx.query(
          `INSERT INTO plantilla_linea (plantilla_id, orden, tipo, descripcion, cantidad, unidad, precio_unitario)
           VALUES ($1, $2, $3, $4, 1, $5, NULL)`,
          [id, i + 1, tipo, descripcion, unidad],
        );
      }
    });
  }
}

// Requiere `sembrarBase` previa y los documentos legales cargados. Devuelve el mapa usuario → id.
export async function sembrarOrganizacion(contrasena: string): Promise<Personas> {
  await sembrarMarcaYConfiguracion();
  const departamentos = await sembrarDepartamentos();
  const personas = await sembrarPersonas(contrasena, departamentos);
  await sembrarCategorias(personas);
  await sembrarClientes();
  await sembrarContratosYTarifas();
  await sembrarIndicadorUf();
  await sembrarPlantillas();
  return personas;
}
