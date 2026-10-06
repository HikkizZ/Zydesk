import { dataSource } from '../../../config/db.js';
import { hoyEnSantiago } from '../../../core/fechas.js';
import { OTS } from './datos-ots.js';
import { TICKETS } from './datos-tickets.js';
import { azar, type Personas } from './util.js';

// Planilla de horas de la demo (spec fase 9 §11.3): 8 semanas de los 7 técnicos y de Rodrigo Álamos, 25 a 40 h por
// semana, mezcla de OT (con su tarea), ticket y «Sin ticket», ~10 % fuera de horario. Nunca hay filas en fechas
// futuras ni en una OT después de su cierre (las horas de una OT salen de las ventanas de sus tareas). Determinista
// para una misma fecha de carga. Solo corre si todavía no hay filas manuales de estas personas.

const SEMANAS = 8;
const MS_DIA = 86_400_000;

// Quién registra horas y cuánto por semana (rango) según su jornada: Mesa de ayuda 41 h, Terreno 40 h.
const PERSONAS_HORAS: { usuario: string; min: number; max: number; diaLV: number; diaV: number }[] =
  [
    { usuario: 'fcarrasco', min: 28, max: 36, diaLV: 8, diaV: 8 },
    { usuario: 'mnunez', min: 28, max: 36, diaLV: 8, diaV: 8 },
    { usuario: 'jriquelme', min: 28, max: 36, diaLV: 8, diaV: 8 },
    { usuario: 'aloyola', min: 25, max: 29, diaLV: 8.5, diaV: 7 },
    { usuario: 'dpizarro', min: 25, max: 29, diaLV: 8.5, diaV: 7 },
    { usuario: 'asepulveda', min: 25, max: 29, diaLV: 8.5, diaV: 7 },
    { usuario: 'gtapia', min: 25, max: 29, diaLV: 8.5, diaV: 7 },
    { usuario: 'ralamos', min: 25, max: 28, diaLV: 8.5, diaV: 7 },
  ];

const SIN_TICKET = [
  'Reunión semanal del equipo',
  'Capacitación y autoestudio',
  'Coordinación con clientes',
  'Documentación interna',
  'Preparación de herramientas y repuestos',
];

interface Fila {
  usuario: string;
  dia: number; // días atrás
  ticket?: number; // número de ticket
  ot?: number;
  tarea?: number; // orden de la tarea dentro de la OT
  horas: number;
  fuera: boolean;
  descripcion?: string;
}

const fechaDe = (hoy: string, dia: number): string =>
  new Date(Date.parse(`${hoy}T00:00:00Z`) - dia * MS_DIA).toISOString().slice(0, 10);
const diaSemana = (hoy: string, dia: number): number =>
  new Date(Date.parse(`${hoy}T00:00:00Z`) - dia * MS_DIA).getUTCDay();
const esHabil = (hoy: string, dia: number): boolean => {
  const d = diaSemana(hoy, dia);
  return d >= 1 && d <= 5;
};
const aMedias = (n: number): number => Math.floor(n * 2) / 2;

export async function sembrarHoras(personas: Personas): Promise<void> {
  const idsPersonas = PERSONAS_HORAS.map((x) => personas.get(x.usuario)!);
  const [{ n }] = await dataSource.query(
    `SELECT count(*)::int AS n FROM registro_horas WHERE mensaje_id IS NULL AND usuario_id = ANY($1::int[])`,
    [idsPersonas],
  );
  if (n > 0) return;

  const hoy = hoyEnSantiago();
  const rnd = azar(Number(hoy.replaceAll('-', '')));
  const diaSem0 = diaSemana(hoy, 0); // 0 = domingo
  const diasDesdeLunes = diaSem0 === 0 ? 6 : diaSem0 - 1;
  const inicio = diasDesdeLunes + (SEMANAS - 1) * 7; // lunes de hace 7 semanas

  // Horas que ya existen (nacidas de un seguimiento): cuentan para el tope diario de cada persona
  const existentes: { usuario_id: number; fecha: string; horas: number }[] = await dataSource.query(
    `SELECT usuario_id, to_char(fecha, 'YYYY-MM-DD') AS fecha, sum(horas)::float8 AS horas
       FROM registro_horas WHERE usuario_id = ANY($1::int[]) GROUP BY 1, 2`,
    [idsPersonas],
  );
  const porDia = new Map<string, number>(); // `${usuario}|${dia atrás}` → horas
  const clave = (u: string, d: number): string => `${u}|${d}`;
  for (const e of existentes) {
    const u = PERSONAS_HORAS.find((x) => personas.get(x.usuario) === e.usuario_id)!.usuario;
    const dia = Math.round(
      (Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${e.fecha}T00:00:00Z`)) / MS_DIA,
    );
    porDia.set(clave(u, dia), (porDia.get(clave(u, dia)) ?? 0) + e.horas);
  }

  const capDia = (u: string, d: number): number => {
    const p = PERSONAS_HORAS.find((x) => x.usuario === u)!;
    return diaSemana(hoy, d) === 5 ? p.diaV : p.diaLV;
  };
  const libre = (u: string, d: number): number => capDia(u, d) - (porDia.get(clave(u, d)) ?? 0);

  const filas = new Map<string, Fila>();
  const agregar = (f: Fila): void => {
    const k = [
      f.usuario,
      f.dia,
      f.ticket ?? '',
      f.ot ?? '',
      f.tarea ?? '',
      f.descripcion ?? '',
    ].join('|');
    const previa = filas.get(k);
    if (previa) previa.horas += f.horas;
    else filas.set(k, { ...f });
    porDia.set(clave(f.usuario, f.dia), (porDia.get(clave(f.usuario, f.dia)) ?? 0) + f.horas);
  };

  // ---- 1. Horas de las tareas de OT (ventanas de cada tarea; nunca después del cierre de la OT) ----
  // Las OT chicas primero: la grande toma lo que queda de la capacidad diaria
  for (const o of [...OTS].sort((x, y) => x.horas - y.horas)) {
    if (o.horas <= 0) continue;
    const peso = (t: { est: number; hecha?: boolean }): number => t.est * (t.hecha ? 1 : 0.5);
    const factor = o.horas / o.tareas.reduce((s, t) => s + peso(t), 0);
    for (const [i, t] of o.tareas.entries()) {
      const dias: number[] = [];
      for (let d = t.ventana[0]; d >= t.ventana[1]; d--)
        if (d >= 0 && esHabil(hoy, d)) dias.push(d);
      // Ventana de fin de semana: el primer día hábil siguiente (sin pasar del cierre de la OT) o, si no, el anterior
      if (dias.length === 0 && o.horas > 0) {
        const limite = o.cierre?.dia ?? o.cancelacion?.dia ?? 0;
        for (let d = t.ventana[1] - 1; d >= limite && dias.length === 0; d--)
          if (esHabil(hoy, d)) dias.push(d);
        for (let d = t.ventana[0] + 1; d <= t.ventana[0] + 3 && dias.length === 0; d++)
          if (esHabil(hoy, d)) dias.push(d);
      }
      if (dias.length === 0) continue;
      const porJornada = (peso(t) * factor) / dias.length;
      const equipo = t.equipo ?? [t.quien];
      for (const [k, d] of dias.entries()) {
        let falta = porJornada;
        for (let j = 0; j < equipo.length && falta >= 0.5; j++) {
          const u = equipo[(k + j) % equipo.length]!;
          if (!PERSONAS_HORAS.some((x) => x.usuario === u)) continue;
          const dar = Math.min(aMedias(falta), aMedias(Math.max(libre(u, d) * 0.9, 0)));
          if (dar < 0.5) continue;
          agregar({ usuario: u, dia: d, ot: o.n, tarea: i + 1, horas: dar, fuera: rnd() < 0.08 });
          falta -= dar;
        }
      }
    }
  }

  // ---- 2. Resto de cada semana: tickets propios y «Sin ticket» hasta la meta semanal de la persona ----
  const elegibles = (u: string, d: number): number[] =>
    TICKETS.filter((t) => t.resp.includes(u) && t.creado >= d && d >= (t.cerrado ?? 0)).map(
      (t) => t.n,
    );

  for (const p of PERSONAS_HORAS) {
    for (let w = 0; w < SEMANAS; w++) {
      const dias: number[] = [];
      for (let d = inicio - w * 7; d > inicio - w * 7 - 7; d--)
        if (d >= 0 && esHabil(hoy, d)) dias.push(d);
      if (dias.length === 0) continue;
      const meta = aMedias((p.min + rnd() * (p.max - p.min)) * (dias.length / 5));
      let hecho = dias.reduce((s, d) => s + (porDia.get(clave(p.usuario, d)) ?? 0), 0);
      // Reunión semanal: una hora el primer día hábil de la semana
      if (libre(p.usuario, dias[0]!) >= 1) {
        agregar({
          usuario: p.usuario,
          dia: dias[0]!,
          horas: 1,
          fuera: false,
          descripcion: SIN_TICKET[0]!,
        });
        hecho += 1;
      }
      for (let intentos = 0; hecho < meta - 0.25 && intentos < 40; intentos++) {
        const tam = Math.min([1, 1.5, 2, 2.5, 3][Math.floor(rnd() * 5)]!, aMedias(meta - hecho));
        if (tam < 0.5) break;
        const posibles = dias.filter((d) => libre(p.usuario, d) >= tam);
        if (posibles.length === 0) break;
        const d = posibles[Math.floor(rnd() * posibles.length)]!;
        const tickets = elegibles(p.usuario, d);
        const fuera = rnd() < 0.1;
        if (tickets.length > 0 && rnd() < 0.72) {
          agregar({
            usuario: p.usuario,
            dia: d,
            ticket: tickets[Math.floor(rnd() * tickets.length)]!,
            horas: tam,
            fuera,
          });
        } else {
          agregar({
            usuario: p.usuario,
            dia: d,
            horas: tam,
            fuera,
            descripcion: SIN_TICKET[1 + Math.floor(rnd() * 4)]!,
          });
        }
        hecho += tam;
      }
    }
  }

  // ---- 3. Inserción (ids de ticket, OT y tarea por número) ----
  const ots: { id: number; numero: number }[] = await dataSource.query(`SELECT id, numero FROM ot`);
  const tareas: { id: number; ot_id: number; orden: number }[] = await dataSource.query(
    `SELECT id, ot_id, orden FROM tarea WHERE ot_id IS NOT NULL`,
  );
  const tickets: { id: number; numero: number }[] = await dataSource.query(
    `SELECT id, numero FROM ticket`,
  );
  const col = <T>(f: (x: Fila) => T): T[] => [...filas.values()].map(f);
  const lista = [...filas.values()];
  const idOt = (f: Fila): number | null =>
    f.ot === undefined ? null : (ots.find((o) => o.numero === f.ot)?.id ?? null);
  await dataSource.query(
    `INSERT INTO registro_horas (usuario_id, fecha, ticket_id, ot_id, tarea_id, horas, fuera_de_horario, descripcion,
                                 creado_en, actualizado_en)
     SELECT x.usuario_id, x.fecha, x.ticket_id, x.ot_id, x.tarea_id, x.horas, x.fuera, x.descripcion,
            LEAST((x.fecha + time '18:30') AT TIME ZONE 'America/Santiago', now() - interval '3 minutes'),
            LEAST((x.fecha + time '18:30') AT TIME ZONE 'America/Santiago', now() - interval '3 minutes')
       FROM unnest($1::int[], $2::date[], $3::int[], $4::int[], $5::int[], $6::numeric[], $7::boolean[], $8::text[])
            AS x(usuario_id, fecha, ticket_id, ot_id, tarea_id, horas, fuera, descripcion)`,
    [
      col((f) => personas.get(f.usuario)!),
      col((f) => fechaDe(hoy, f.dia)),
      col((f) =>
        f.ticket === undefined ? null : (tickets.find((t) => t.numero === f.ticket)?.id ?? null),
      ),
      lista.map(idOt),
      lista.map((f) => {
        const ot = idOt(f);
        return ot === null || f.tarea === undefined
          ? null
          : (tareas.find((t) => t.ot_id === ot && t.orden === f.tarea)?.id ?? null);
      }),
      col((f) => f.horas),
      col((f) => f.fuera),
      col((f) => f.descripcion ?? null),
    ],
  );
}
