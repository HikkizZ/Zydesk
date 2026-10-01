import { calcularCotizacion, formatearMonto } from '@zydesk/shared';
import { dataSource } from '../../config/db.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import { fechaRelativa, instante, type Tx } from './desarrollo-tickets.js';

// Semillas del cotizador (spec fase 4 §14): plantillas y 4 cotizaciones v1 de los diseños. Idempotentes por
// nombre de plantilla y por (codigo, version). Los totales salen de `calcularCotizacion` (ADR 0007). Las
// cotizaciones llevan los mismos campos y eventos que el flujo real (crear → enviar → aprobar). Los
// primeros números de `creada`/`enviada` son días atrás en Santiago.

type Tipo = 'mano_de_obra' | 'material' | 'servicio' | 'traslado';
type Unidad = 'h' | 'un' | 'km' | 'gl';

interface LineaSemilla {
  tipo: Tipo;
  descripcion: string;
  cantidad: number;
  unidad: Unidad;
  precio_unitario: number;
  descuento_pct?: number;
}

interface CotizacionSemilla {
  ot: string; // código de la OT
  estado: 'enviada' | 'aprobada';
  creada: [dia: number, hora: string];
  enviada: [dia: number, hora: string];
  nota_interna?: string;
  lineas: LineaSemilla[];
}

const horas = (descripcion: string, cantidad: number, precio_unitario: number): LineaSemilla => ({
  tipo: 'mano_de_obra',
  descripcion,
  cantidad,
  unidad: 'h',
  precio_unitario,
});
const servicio = (
  descripcion: string,
  precio_unitario: number,
  descuento_pct = 0,
): LineaSemilla => ({
  tipo: 'servicio',
  descripcion,
  cantidad: 1,
  unidad: 'un',
  precio_unitario,
  descuento_pct,
});

// prettier-ignore
const COTIZACIONES: CotizacionSemilla[] = [
  { ot: 'OT-0218', estado: 'enviada', creada: [1, '10:40'], enviada: [1, '10:55'],
    nota_interna: 'Paula pidió detallar el soporte post-implementación por separado.',
    lineas: [
      horas('Diagnóstico y revisión de logs del ERP', 3, 38000),
      horas('Carga de nuevo CAF y pruebas en ambiente QA', 4, 38000),
      horas('Paso a producción y acompañamiento (horario extendido)', 2, 45000),
      horas('Capacitación breve al equipo de facturación', 1, 38000),
      servicio('Soporte remoto post-implementación (7 días)', 90000, 10),
    ] },
  { ot: 'OT-0214', estado: 'enviada', creada: [5, '10:00'], enviada: [5, '10:30'],
    lineas: [servicio('Renovación de plataforma de respaldo (licencias, instalación y migración)', 2150000)] },
  { ot: 'OT-0217', estado: 'aprobada', creada: [4, '10:20'], enviada: [4, '11:00'],
    lineas: [horas('Migración de buzones y alias', 16, 38000), servicio('Validación de dominio y DNS', 632000)] },
  { ot: 'OT-0216', estado: 'aprobada', creada: [9, '10:30'], enviada: [9, '11:00'],
    lineas: [servicio('Mantención preventiva de 12 equipos', 680000)] },
];

interface PlantillaSemilla {
  nombre: string;
  descripcion: string;
  lineas: [tipo: Tipo, descripcion: string, unidad: Unidad][];
}

// Líneas de la pantalla "Configuración → Plantillas" del diseño, todas con `precio_unitario null`.
// prettier-ignore
const PLANTILLAS: PlantillaSemilla[] = [
  { nombre: 'Soporte por horas', descripcion: 'Para incidentes de clientes con contrato de horas.', lineas: [
    ['mano_de_obra', 'Diagnóstico', 'h'], ['mano_de_obra', 'Implementación', 'h'], ['servicio', 'Soporte post-implementación', 'un'] ] },
  { nombre: 'Mantención preventiva', descripcion: 'Visita programada por número de equipos.', lineas: [
    ['servicio', 'Mantención por equipo', 'un'], ['material', 'Materiales de limpieza', 'gl'], ['traslado', 'Traslado', 'km'] ] },
  { nombre: 'Proyecto de instalación', descripcion: 'Cableado, redes o equipos nuevos.', lineas: [
    ['mano_de_obra', 'Levantamiento', 'h'], ['material', 'Materiales', 'gl'], ['mano_de_obra', 'Instalación', 'h'], ['servicio', 'Certificación', 'un'] ] },
];

export async function sembrarPlantillas(): Promise<void> {
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

interface TarifasGuardadas {
  iva_pct: number;
  validez_dias_defecto: 15 | 30;
  condiciones_defecto: string | null;
}

// `evento` de `desarrollo-ots.ts` (se recibe para no crear un ciclo de imports).
type RegistrarEvento = (
  tx: Tx,
  entidad: 'ot',
  entidad_id: number,
  autor: number,
  creado_en: Date,
  accion: string,
  extra: { nuevo?: string; datos?: unknown },
) => Promise<void>;

export interface OtParaCotizar {
  id: number;
  codigo: string;
  contacto_id: number | null;
  aprobada_en: Date | null;
}

// Crea la cotización v1 de la OT (si el diseño le asigna una) con sus líneas y eventos `cotizacion_creada`,
// `cotizacion_enviada` y, si está aprobada, `cotizacion_aprobada`. `sembrarOt` la llama antes de escribir los
// `cambio etapa` para que lleven su `cotizacion_id` (`evento` es solo de inserción). Devuelve su id.
export async function sembrarCotizacion(
  tx: Tx,
  ot: OtParaCotizar,
  personas: Map<string, number>,
  evento: RegistrarEvento,
): Promise<number | null> {
  const c = COTIZACIONES.find((x) => x.ot === ot.codigo);
  if (!c) return null;
  const codigo = `COT-${ot.codigo.replace(/^\D+/, '')}`;
  const existe: unknown[] = await tx.query(
    `SELECT 1 FROM cotizacion WHERE codigo = $1 AND version = 1`,
    [codigo],
  );
  if (existe.length > 0) return null;

  const camila = personas.get('crojas')!;
  const [fila]: { valor: TarifasGuardadas }[] = await tx.query(
    `SELECT valor FROM configuracion WHERE clave = 'tarifas'`,
  );
  const { iva_pct, validez_dias_defecto, condiciones_defecto } = fila!.valor;
  const lineas = c.lineas.map((l) => ({ ...l, descuento_pct: l.descuento_pct ?? 0 }));
  const r = calcularCotizacion(lineas, { moneda: 'CLP', aplica_iva: true, iva_pct });

  const creada_en = await instante(tx, ...c.creada);
  const enviada_en = await instante(tx, ...c.enviada);
  const aprobada_en = c.estado === 'aprobada' ? ot.aprobada_en : null;
  const [{ id }] = await tx.query(
    `INSERT INTO cotizacion (ot_id, version, codigo, estado, contacto_id, fecha_emision, validez_dias, moneda,
                             aplica_iva, iva_pct, condiciones, nota_interna, subtotal, descuentos, neto, iva, total,
                             enviada_en, enviada_por, aprobada_en, creado_por, creado_en, actualizado_en)
     VALUES ($1, 1, $2, $3, $4, $5, $6, 'CLP', true, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $16, $18, $19)
     RETURNING id`,
    [
      ot.id,
      codigo,
      c.estado,
      ot.contacto_id,
      await fechaRelativa(tx, c.enviada[0]),
      validez_dias_defecto,
      iva_pct,
      condiciones_defecto,
      c.nota_interna ?? null,
      r.subtotal,
      r.descuentos,
      r.neto,
      r.iva,
      r.total,
      enviada_en,
      camila,
      aprobada_en,
      creada_en,
      aprobada_en ?? enviada_en,
    ],
  );
  for (const [i, l] of lineas.entries()) {
    await tx.query(
      `INSERT INTO linea_cotizacion (cotizacion_id, orden, tipo, descripcion, cantidad, unidad, precio_unitario,
                                     descuento_pct, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        i + 1,
        l.tipo,
        l.descripcion,
        l.cantidad,
        l.unidad,
        l.precio_unitario,
        l.descuento_pct,
        r.lineas[i],
      ],
    );
  }

  const base = { cotizacion_id: id, codigo, version: 1 };
  const resumen = { ...base, moneda: 'CLP', neto: r.neto, total: r.total };
  const etiqueta = `${codigo} v1 · ${formatearMonto(r.total, 'CLP')}`;
  await evento(tx, 'ot', ot.id, camila, creada_en, 'cotizacion_creada', {
    nuevo: `${codigo} v1`,
    datos: base,
  });
  await evento(tx, 'ot', ot.id, camila, enviada_en, 'cotizacion_enviada', {
    nuevo: etiqueta,
    datos: resumen,
  });
  if (aprobada_en) {
    await evento(tx, 'ot', ot.id, camila, aprobada_en, 'cotizacion_aprobada', {
      nuevo: etiqueta,
      datos: resumen,
    });
  }
  return id;
}
