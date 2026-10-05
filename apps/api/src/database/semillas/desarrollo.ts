import { politicaContrasena, type Plazo } from '@zydesk/shared';
import { dataSource } from '../../config/db.js';
import { hashear } from '../../core/auth/contrasena.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import {
  crearBolsa,
  crearCliente,
  crearContacto,
  reemplazarTarifas,
} from '../../modulos/clientes/clientes.service.js';
import { versionTerminosVigente } from '../../modulos/legal/legal.service.js';
import { sembrarPlantillas } from './desarrollo-cotizaciones.js';
import { sembrarAvisos } from './desarrollo-avisos.js';
import { sembrarHoras } from './desarrollo-horas.js';
import { sembrarOts } from './desarrollo-ots.js';
import { sembrarTickets } from './desarrollo-tickets.js';

export class ErrorSemilla extends Error {}

// Semillas de desarrollo (spec §13): idempotentes por correo/nombre; no pisan lo que ya existe.
type Dia = { activo: boolean; entrada: string; salida: string };
const LIBRE: Dia = { activo: false, entrada: '09:00', salida: '13:00' };
const jornada = (entrada: string, salida: string): Dia => ({ activo: true, entrada, salida });

const DEPARTAMENTOS: {
  nombre: string;
  extendida: string;
  capacidad: number;
  dias: Record<number, Dia>; // 0 = domingo
}[] = [
  {
    nombre: 'Soporte TI',
    extendida: '19:00',
    capacidad: 80,
    dias: {
      0: LIBRE,
      1: jornada('08:30', '18:00'),
      2: jornada('08:30', '18:00'),
      3: jornada('08:30', '18:00'),
      4: jornada('08:30', '18:00'),
      5: jornada('08:30', '16:30'),
      6: LIBRE,
    },
  },
  {
    nombre: 'Terreno',
    extendida: '18:00',
    capacidad: 90,
    dias: {
      0: LIBRE,
      1: jornada('08:00', '17:00'),
      2: jornada('08:00', '17:00'),
      3: jornada('08:00', '17:00'),
      4: jornada('08:00', '17:00'),
      5: jornada('08:00', '17:00'),
      6: LIBRE,
    },
  },
  {
    nombre: 'Coordinación',
    extendida: '19:00',
    capacidad: 50,
    dias: {
      0: LIBRE,
      1: jornada('09:00', '18:00'),
      2: jornada('09:00', '18:00'),
      3: jornada('09:00', '18:00'),
      4: jornada('09:00', '18:00'),
      5: jornada('09:00', '17:00'),
      6: LIBRE,
    },
  },
];

type Rol = 'admin' | 'coordinacion' | 'tecnico' | 'lectura';
// prettier-ignore
const PERSONAS: { nombre: string; usuario: string; rol: Rol; departamento: string; color: string }[] = [
  { nombre: 'Hikki', usuario: 'hikki', rol: 'admin', departamento: 'Coordinación', color: '#CFDDF3' },
  { nombre: 'Camila Rojas', usuario: 'crojas', rol: 'coordinacion', departamento: 'Soporte TI', color: '#F2D7C9' },
  { nombre: 'Fernanda Castro', usuario: 'fcastro', rol: 'coordinacion', departamento: 'Coordinación', color: '#F3CFD9' },
  { nombre: 'Diego Muñoz', usuario: 'dmunoz', rol: 'tecnico', departamento: 'Terreno', color: '#CFDDF3' },
  { nombre: 'Valentina Soto', usuario: 'vsoto', rol: 'tecnico', departamento: 'Terreno', color: '#D9EBD3' },
  { nombre: 'Matías Fuentes', usuario: 'mfuentes', rol: 'tecnico', departamento: 'Soporte TI', color: '#EBDDF3' },
  { nombre: 'Javiera Pérez', usuario: 'jperez', rol: 'tecnico', departamento: 'Soporte TI', color: '#F3E7C4' },
  { nombre: 'Sebastián Díaz', usuario: 'sdiaz', rol: 'tecnico', departamento: 'Soporte TI', color: '#CDEBE6' },
  { nombre: 'Tomás Reyes', usuario: 'treyes', rol: 'tecnico', departamento: 'Terreno', color: '#DAD6CF' },
  { nombre: 'Ignacia Morales', usuario: 'imorales', rol: 'tecnico', departamento: 'Soporte TI', color: '#D3E0F0' },
  { nombre: 'Nicolás Vega', usuario: 'nvega', rol: 'lectura', departamento: 'Soporte TI', color: '#E6E2C8' },
];

// responsable, primera respuesta (horas) y resolución alta (días); el resto se deriva.
// prettier-ignore
const CATEGORIAS: { nombre: string; responsable: string; respuesta_h: number; alta_dias: number }[] = [
  { nombre: 'ERP / Facturación', responsable: 'sdiaz', respuesta_h: 2, alta_dias: 1 },
  { nombre: 'Redes y VPN', responsable: 'dmunoz', respuesta_h: 1, alta_dias: 1 },
  { nombre: 'Correo', responsable: 'crojas', respuesta_h: 2, alta_dias: 2 },
  { nombre: 'Hardware y equipos', responsable: 'vsoto', respuesta_h: 4, alta_dias: 3 },
  { nombre: 'Accesos y usuarios', responsable: 'jperez', respuesta_h: 4, alta_dias: 1 },
  { nombre: 'Seguridad y cámaras', responsable: 'treyes', respuesta_h: 4, alta_dias: 3 },
];

const CLIENTES_EXTERNOS = ['Constructora Andes', 'Clínica Los Robles', 'Transportes Austral'];
const AREAS_INTERNAS = ['Operaciones', 'Administración y Finanzas', 'Marketing', 'Oficina central'];

const fechaIso = (d: Date) => d.toISOString().slice(0, 10);

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
  return ids;
}

async function sembrarPersonas(
  contrasena: string,
  departamentos: Map<string, number>,
): Promise<Map<string, number>> {
  const hash = await hashear(contrasena);
  const version = versionTerminosVigente();
  const ids = new Map<string, number>();
  for (const p of PERSONAS) {
    const correo = `${p.usuario}@zydesk.local`;
    const [existente] = await dataSource.query(`SELECT id FROM usuario WHERE correo = $1`, [
      correo,
    ]);
    if (existente) {
      ids.set(p.usuario, existente.id);
      continue;
    }
    const [{ id }] = await dataSource.query(
      `INSERT INTO usuario (nombre, correo, contrasena_hash, rol, departamento_id, color_avatar,
                            debe_cambiar_contrasena, terminos_version, terminos_aceptados_en)
       VALUES ($1, $2, $3, $4, $5, $6, false, $7, now()) RETURNING id`,
      [p.nombre, correo, hash, p.rol, departamentos.get(p.departamento), p.color, version],
    );
    ids.set(p.usuario, id);
  }
  return ids;
}

async function sembrarCategorias(personas: Map<string, number>): Promise<void> {
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

async function existeCliente(nombre: string): Promise<boolean> {
  const filas: unknown[] = await dataSource.query(`SELECT 1 FROM cliente WHERE nombre = $1`, [
    nombre,
  ]);
  return filas.length > 0;
}

const sinDatos = {
  rut: null,
  direccion: null,
  condicion_pago: null,
  exige_oc: false,
  notas: null,
};

async function sembrarClientes(): Promise<void> {
  if (!(await existeCliente('Viña Santa Clara'))) {
    const { id } = await crearCliente({
      ...sinDatos,
      nombre: 'Viña Santa Clara',
      rut: '76123465-K', // ficticio, con dígito verificador válido
      es_interno: false,
      condicion_pago: '30 días',
      exige_oc: true,
    });
    await crearContacto(id, {
      nombre: 'Paula Herrera',
      area: 'Administración',
      correo: 'pherrera@vinasantaclara.cl',
      telefono: null,
      aprueba_cotizaciones: true,
    });
    const hoy = new Date();
    const primero = (desplazo: number) =>
      fechaIso(new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + desplazo, 1)));
    await crearBolsa(id, {
      horas_mes: 20,
      vigente_desde: primero(0),
      vigente_hasta: null,
      fecha_renovacion: primero(1),
      notas: null,
    });
    await reemplazarTarifas(id, [
      { concepto: 'hora_normal', moneda: 'CLP', valor: 38000 },
      { concepto: 'hora_extendida', moneda: 'CLP', valor: 45000 },
    ]);
  }
  for (const nombre of CLIENTES_EXTERNOS) {
    if (await existeCliente(nombre)) continue;
    const { id } = await crearCliente({ ...sinDatos, nombre, es_interno: false });
    await crearContacto(id, {
      nombre: '[NOMBRE]',
      area: null,
      correo: null,
      telefono: null,
      aprueba_cotizaciones: false,
    });
  }
  for (const nombre of AREAS_INTERNAS) {
    if (await existeCliente(nombre)) continue;
    await crearCliente({ ...sinDatos, nombre, es_interno: true });
  }
}

// Tarifas del diseño (spec fase 4 §14): solo si la clave sigue con los valores de la semilla base.
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
const TARIFAS_DESARROLLO = {
  ...TARIFAS_BASE,
  hora_normal: { moneda: 'CLP', valor: 38000 },
  hora_extendida: { moneda: 'CLP', valor: 45000 },
  costo_interno: 18000, // ficticio, para que OT-0215 muestre costo interno
  condiciones_defecto:
    'Precios en pesos chilenos. Validez según fecha indicada. Forma de pago: 30 días desde la factura. No incluye repuestos ni licencias salvo indicación expresa.',
};

async function sembrarTarifas(): Promise<void> {
  await dataSource.query(
    `UPDATE configuracion SET valor = $2::jsonb WHERE clave = 'tarifas' AND valor = $1::jsonb`,
    [JSON.stringify(TARIFAS_BASE), JSON.stringify(TARIFAS_DESARROLLO)],
  );
}

// Requiere `sembrarBase` previa (marca y contadores) y los documentos legales cargados.
export async function sembrarDesarrollo(contrasena: string | undefined): Promise<void> {
  if (!contrasena || !politicaContrasena(contrasena, 'semilla@zydesk.local').ok) {
    throw new ErrorSemilla('SEMILLA_PASSWORD no definida o inválida');
  }
  const departamentos = await sembrarDepartamentos();
  const personas = await sembrarPersonas(contrasena, departamentos);
  await sembrarCategorias(personas);
  await sembrarClientes();
  await sembrarTickets(personas);
  await sembrarTarifas(); // antes de las OT: las cotizaciones toman de ahí IVA, validez y condiciones
  await sembrarPlantillas();
  await sembrarOts(personas);
  await sembrarHoras(personas);
  await sembrarAvisos(personas);
}
