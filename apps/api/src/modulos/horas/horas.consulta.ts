import {
  diasDeSemana,
  horasJornada,
  iniciales,
  lunesDe,
  type Calendario,
  type TipoMensaje,
} from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import { ErrorApp } from '../../core/errores/error-app.js';
import { cargarCalendario } from '../departamentos/departamentos.service.js';
import { hoyEnSantiago, type PlanillaSemanalDatos } from './horas.tipos.js';

type FilaPlanilla = PlanillaSemanalDatos['filas'][number];
type CeldaPlanilla = FilaPlanilla['celdas'][number];
type RegistroCelda = CeldaPlanilla['registros'][number];
type ClienteDatos = { id: number; nombre: string; es_interno: boolean } | null;

const MS_DIA = 86_400_000;

function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a!, m! - 1, d!) + dias * MS_DIA).toISOString().slice(0, 10);
}

const clienteJson = (alias: string): string =>
  `CASE WHEN ${alias}.id IS NULL THEN NULL
        ELSE json_build_object('id', ${alias}.id, 'nombre', ${alias}.nombre, 'es_interno', ${alias}.es_interno) END`;

interface FilaRegistro {
  id: number;
  usuario_id: number;
  fecha: string;
  ticket_id: number | null;
  ot_id: number | null;
  tarea_id: number | null;
  mensaje_id: number | null;
  descripcion: string | null;
  horas: number;
  fuera_de_horario: boolean;
  creado_en: Date;
  actualizado_en: Date;
  mensaje_tipo: TipoMensaje;
  t_codigo: string | null;
  t_asunto: string | null;
  t_cerrado: boolean | null;
  t_cliente: ClienteDatos;
  o_codigo: string | null;
  o_titulo: string | null;
  o_tipo: 'facturable' | 'interna' | null;
  o_etapa: string | null;
  o_cliente: ClienteDatos;
  ta_titulo: string | null;
  ta_hecha: boolean | null;
  ta_orden: number | null;
}

interface FilaTemporal {
  fila: Omit<FilaPlanilla, 'celdas' | 'total'>;
  registros: Map<string, RegistroCelda[]>;
  orden: number; // tarea.orden; -1 sin tarea
}

// Una consulta de registros, una de feriados y las del calendario (departamento, horario y feriados): sin N+1.
export async function cargarPlanilla(
  m: EntityManager,
  usuario_id: number,
  lunes: string,
  actor_id: number,
  puedeEditar: boolean,
): Promise<PlanillaSemanalDatos> {
  const [u]: {
    id: number;
    nombre: string;
    color_avatar: string;
    activo: boolean;
    departamento_id: number | null;
    departamento_nombre: string | null;
  }[] = await m.query(
    `SELECT u.id, u.nombre, u.color_avatar, u.activo, u.departamento_id, d.nombre AS departamento_nombre
       FROM usuario u LEFT JOIN departamento d ON d.id = u.departamento_id
      WHERE u.id = $1`,
    [usuario_id],
  );
  if (!u) throw new ErrorApp('NO_ENCONTRADO', 'Usuario no encontrado');

  const hoy = hoyEnSantiago();
  const fechas = diasDeSemana(lunes);
  const domingo = fechas[6]!;
  const anios = [...new Set(fechas.map((f) => Number(f.slice(0, 4))))];

  const cal: Calendario | null =
    u.departamento_id === null ? null : await cargarCalendario(m, u.departamento_id, anios);
  const feriados: { fecha: string; nombre: string }[] = await m.query(
    `SELECT fecha::text AS fecha, nombre FROM feriado
      WHERE fecha BETWEEN $1 AND $2 AND (departamento_id IS NULL OR departamento_id = $3::int)
      ORDER BY fecha, departamento_id NULLS LAST`,
    [lunes, domingo, u.departamento_id],
  );
  const nombreFeriado = new Map<string, string>();
  for (const f of feriados) if (!nombreFeriado.has(f.fecha)) nombreFeriado.set(f.fecha, f.nombre);

  const registros: FilaRegistro[] = await m.query(
    `SELECT rh.id, rh.usuario_id, rh.fecha::text AS fecha, rh.ticket_id, rh.ot_id, rh.tarea_id, rh.mensaje_id,
            rh.descripcion, rh.horas::float8 AS horas, rh.fuera_de_horario, rh.creado_en, rh.actualizado_en,
            me.tipo AS mensaje_tipo,
            t.codigo AS t_codigo, t.asunto AS t_asunto, (t.cerrado_en IS NOT NULL) AS t_cerrado,
            ${clienteJson('ct')} AS t_cliente,
            o.codigo AS o_codigo, o.titulo AS o_titulo, o.tipo AS o_tipo, o.etapa AS o_etapa,
            ${clienteJson('co')} AS o_cliente,
            ta.titulo AS ta_titulo, ta.hecha AS ta_hecha, ta.orden AS ta_orden
       FROM registro_horas rh
       LEFT JOIN ticket t ON t.id = rh.ticket_id
       LEFT JOIN cliente ct ON ct.id = t.cliente_id
       LEFT JOIN ot o ON o.id = rh.ot_id
       LEFT JOIN cliente co ON co.id = o.cliente_id
       LEFT JOIN tarea ta ON ta.id = rh.tarea_id
       LEFT JOIN mensaje me ON me.id = rh.mensaje_id
      WHERE rh.usuario_id = $1 AND rh.fecha BETWEEN $2 AND $3
      ORDER BY rh.fecha, rh.id`,
    [usuario_id, lunes, domingo],
  );

  const temporales = new Map<string, FilaTemporal>();
  for (const r of registros) {
    let clave: string;
    let temporal: Omit<FilaTemporal, 'registros'>;
    if (r.ot_id !== null) {
      clave = r.tarea_id === null ? `ot:${r.ot_id}` : `ot:${r.ot_id}:tarea:${r.tarea_id}`;
      const etapa = r.o_etapa as Extract<FilaPlanilla['destino'], { tipo: 'ot' }>['etapa'];
      temporal = {
        fila: {
          clave,
          destino: {
            tipo: 'ot',
            id: r.ot_id,
            codigo: r.o_codigo!,
            titulo: r.o_titulo!,
            tipo_ot: r.o_tipo!,
            etapa,
            cliente: r.o_cliente,
            final: etapa === 'cerrada' || etapa === 'cancelada',
          },
          tarea:
            r.tarea_id === null
              ? null
              : { id: r.tarea_id, titulo: r.ta_titulo!, hecha: r.ta_hecha! },
          facturable: r.o_tipo === 'facturable',
        },
        orden: r.ta_orden ?? -1,
      };
    } else if (r.ticket_id !== null) {
      clave = `ticket:${r.ticket_id}`;
      temporal = {
        fila: {
          clave,
          destino: {
            tipo: 'ticket',
            id: r.ticket_id,
            codigo: r.t_codigo!,
            titulo: r.t_asunto!,
            cliente: r.t_cliente,
            cerrado: r.t_cerrado!,
          },
          tarea: null,
          facturable: false,
        },
        orden: -1,
      };
    } else {
      clave = `sin_ticket:${r.descripcion ?? ''}`;
      temporal = {
        fila: {
          clave,
          destino: { tipo: 'sin_ticket', descripcion: r.descripcion ?? '' },
          tarea: null,
          facturable: false,
        },
        orden: -1,
      };
    }
    let t = temporales.get(clave);
    if (!t) {
      t = { ...temporal, registros: new Map() };
      temporales.set(clave, t);
    }
    const lista = t.registros.get(r.fecha) ?? [];
    lista.push({
      id: r.id,
      usuario_id: r.usuario_id,
      fecha: r.fecha,
      ticket_id: r.ticket_id,
      ot_id: r.ot_id,
      tarea_id: r.tarea_id,
      mensaje_id: r.mensaje_id,
      descripcion: r.descripcion,
      horas: r.horas,
      fuera_de_horario: r.fuera_de_horario,
      creado_en: r.creado_en.toISOString(),
      actualizado_en: r.actualizado_en.toISOString(),
      mensaje: r.mensaje_id === null ? null : { id: r.mensaje_id, tipo: r.mensaje_tipo },
    });
    t.registros.set(r.fecha, lista);
  }

  const rango = (tipo: string): number => (tipo === 'ot' ? 0 : tipo === 'ticket' ? 1 : 2);
  const ordenadas = [...temporales.values()].sort((a, b) => {
    const da = a.fila.destino;
    const db = b.fila.destino;
    if (rango(da.tipo) !== rango(db.tipo)) return rango(da.tipo) - rango(db.tipo);
    if (da.tipo === 'sin_ticket' && db.tipo === 'sin_ticket') {
      return da.descripcion.localeCompare(db.descripcion, 'es');
    }
    if (da.tipo !== 'sin_ticket' && db.tipo !== 'sin_ticket') {
      const c = db.codigo.localeCompare(da.codigo, 'es', { numeric: true });
      if (c !== 0) return c;
    }
    return a.orden - b.orden;
  });

  const totalDia = new Map<string, number>();
  let semana = 0;
  let facturables = 0;
  let fuera = 0;
  const filas: FilaPlanilla[] = ordenadas.map((t) => {
    let totalFila = 0;
    const celdas: CeldaPlanilla[] = fechas.map((fecha) => {
      const regs = t.registros.get(fecha) ?? [];
      const total = regs.reduce((s, r) => s + r.horas, 0);
      totalFila += total;
      totalDia.set(fecha, (totalDia.get(fecha) ?? 0) + total);
      for (const r of regs) if (r.fuera_de_horario) fuera += r.horas;
      return {
        fecha,
        total,
        fuera_de_horario: regs.some((r) => r.fuera_de_horario),
        registros: regs,
      };
    });
    semana += totalFila;
    if (t.fila.facturable) facturables += totalFila;
    return { ...t.fila, celdas, total: totalFila };
  });

  const dias = fechas.map((fecha, i) => ({
    fecha,
    dia_semana: (i + 1) % 7, // 0 = domingo (misma convención que horario_dia)
    jornada: cal ? horasJornada(fecha, cal) : null,
    feriado: nombreFeriado.get(fecha) ?? null,
    hoy: fecha === hoy,
    futuro: fecha > hoy,
    total: totalDia.get(fecha) ?? 0,
  }));
  const jornadaSemanal = cal ? dias.reduce((s, d) => s + (d.jornada ?? 0), 0) : null;

  return {
    usuario: {
      id: u.id,
      nombre: u.nombre,
      iniciales: iniciales(u.nombre),
      color_avatar: u.color_avatar,
      departamento:
        u.departamento_id === null
          ? null
          : { id: u.departamento_id, nombre: u.departamento_nombre! },
      activo: u.activo,
    },
    semana: {
      desde: lunes,
      hasta: domingo,
      anterior: sumarDias(lunes, -7),
      siguiente: sumarDias(lunes, 7),
      actual: lunes === lunesDe(hoy),
    },
    dias,
    filas,
    totales: {
      semana,
      facturables,
      internas: semana - facturables,
      fuera_de_horario: fuera,
      jornada_semanal: jornadaSemanal,
    },
    editable: usuario_id === actor_id && puedeEditar,
  };
}
