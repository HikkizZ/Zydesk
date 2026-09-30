import {
  jornadaSemanalHoras,
  ZONA,
  type Calendario,
  type DepartamentoEntradaDatos,
  type DepartamentoSalidaDatos,
  type FeriadoEntradaDatos,
  type FeriadosQueryDatos,
  type FeriadoSalidaDatos,
} from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import { dataSource } from '../../config/db.js';
import type { UsuarioSesion } from '../../core/auth/tipos.js';
import { ErrorApp } from '../../core/errores/error-app.js';
import { registrarAuditoria } from '../../core/historial/auditoria.js';
import { enTransaccion } from '../../core/historial/transaccion.js';

interface FilaDepartamento {
  id: number;
  nombre: string;
  hora_extendida_desde: string;
  capacidad_tickets_pct: number;
  personas: number;
  creado_en: Date;
  actualizado_en: Date;
}

interface FilaHorario {
  departamento_id: number;
  dia_semana: number;
  activo: boolean;
  entrada: string;
  salida: string;
  colacion_inicio: string;
  colacion_min: number;
}

const SELECT_DEPARTAMENTO = `SELECT d.id, d.nombre, d.hora_extendida_desde, d.capacidad_tickets_pct,
       (SELECT count(*)::int FROM usuario u WHERE u.departamento_id = d.id AND u.activo) AS personas,
       d.creado_en, d.actualizado_en
  FROM departamento d`;

const esViolacionUnica = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';

function sinDepartamentoId(h: FilaHorario) {
  return {
    dia_semana: h.dia_semana,
    activo: h.activo,
    entrada: h.entrada,
    salida: h.salida,
    colacion_inicio: h.colacion_inicio,
    colacion_min: h.colacion_min,
  };
}

async function cargarVarios(
  m: EntityManager,
  filas: FilaDepartamento[],
): Promise<DepartamentoSalidaDatos[]> {
  if (filas.length === 0) return [];
  const horarios: FilaHorario[] = await m.query(
    `SELECT departamento_id, dia_semana, activo, entrada, salida, colacion_inicio, colacion_min
       FROM horario_dia WHERE departamento_id = ANY($1::int[]) ORDER BY departamento_id, dia_semana`,
    [filas.map((f) => f.id)],
  );
  return filas.map((f) => {
    const horario = horarios.filter((h) => h.departamento_id === f.id).map(sinDepartamentoId);
    return {
      id: f.id,
      nombre: f.nombre,
      hora_extendida_desde: f.hora_extendida_desde,
      capacidad_tickets_pct: f.capacidad_tickets_pct,
      horario,
      jornada_semanal_horas: jornadaSemanalHoras(horario),
      personas: f.personas,
      creado_en: f.creado_en.toISOString(),
      actualizado_en: f.actualizado_en.toISOString(),
    };
  });
}

async function cargar(m: EntityManager, id: number): Promise<DepartamentoSalidaDatos> {
  const filas: FilaDepartamento[] = await m.query(`${SELECT_DEPARTAMENTO} WHERE d.id = $1`, [id]);
  const [salida] = await cargarVarios(m, filas);
  if (!salida) throw new ErrorApp('NO_ENCONTRADO', 'Departamento no encontrado');
  return salida;
}

export async function listarDepartamentos(): Promise<DepartamentoSalidaDatos[]> {
  const filas: FilaDepartamento[] = await dataSource.query(
    `${SELECT_DEPARTAMENTO} ORDER BY d.nombre, d.id`,
  );
  return cargarVarios(dataSource.manager, filas);
}

export function obtenerDepartamento(id: number): Promise<DepartamentoSalidaDatos> {
  return cargar(dataSource.manager, id);
}

async function reemplazarHorario(
  tx: EntityManager,
  id: number,
  horario: DepartamentoEntradaDatos['horario'],
): Promise<void> {
  await tx.query(`DELETE FROM horario_dia WHERE departamento_id = $1`, [id]);
  for (const h of horario) {
    await tx.query(
      `INSERT INTO horario_dia (departamento_id, dia_semana, activo, entrada, salida, colacion_inicio, colacion_min)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, h.dia_semana, h.activo, h.entrada, h.salida, h.colacion_inicio, h.colacion_min],
    );
  }
}

const conflictoNombre = () =>
  new ErrorApp('CONFLICTO', 'Ya existe un departamento con ese nombre', { campo: 'nombre' });

export async function crearDepartamento(
  actor: UsuarioSesion,
  e: DepartamentoEntradaDatos,
): Promise<DepartamentoSalidaDatos> {
  try {
    return await enTransaccion(async (tx) => {
      const [{ id }] = (await tx.query(
        `INSERT INTO departamento (nombre, hora_extendida_desde, capacidad_tickets_pct)
         VALUES ($1, $2, $3) RETURNING id`,
        [e.nombre, e.hora_extendida_desde, e.capacidad_tickets_pct],
      )) as [{ id: number }];
      await reemplazarHorario(tx, id, e.horario);
      await registrarAuditoria(tx, {
        accion: 'config_cambiada',
        usuario_id: actor.id,
        detalle: { seccion: 'departamento', departamento_id: id, accion: 'creado' },
      });
      return cargar(tx, id);
    });
  } catch (err) {
    if (esViolacionUnica(err)) throw conflictoNombre();
    throw err;
  }
}

export async function editarDepartamento(
  actor: UsuarioSesion,
  id: number,
  e: DepartamentoEntradaDatos,
): Promise<DepartamentoSalidaDatos> {
  try {
    return await enTransaccion(async (tx) => {
      const [, cantidad] = (await tx.query(
        `UPDATE departamento SET nombre = $2, hora_extendida_desde = $3, capacidad_tickets_pct = $4,
                actualizado_en = now() WHERE id = $1`,
        [id, e.nombre, e.hora_extendida_desde, e.capacidad_tickets_pct],
      )) as [unknown, number];
      if (cantidad === 0) throw new ErrorApp('NO_ENCONTRADO', 'Departamento no encontrado');
      await reemplazarHorario(tx, id, e.horario);
      await registrarAuditoria(tx, {
        accion: 'config_cambiada',
        usuario_id: actor.id,
        detalle: { seccion: 'departamento', departamento_id: id, accion: 'editado' },
      });
      return cargar(tx, id);
    });
  } catch (err) {
    if (esViolacionUnica(err)) throw conflictoNombre();
    throw err;
  }
}

export async function eliminarDepartamento(actor: UsuarioSesion, id: number): Promise<void> {
  await enTransaccion(async (tx) => {
    const existe: unknown[] = await tx.query(
      `SELECT 1 FROM departamento WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (existe.length === 0) throw new ErrorApp('NO_ENCONTRADO', 'Departamento no encontrado');
    const usuarios: unknown[] = await tx.query(
      `SELECT 1 FROM usuario WHERE departamento_id = $1 LIMIT 1`,
      [id],
    );
    if (usuarios.length > 0) {
      throw new ErrorApp('CONFLICTO', 'El departamento tiene personas asignadas', {
        motivo: 'con_personas',
      });
    }
    await tx.query(`DELETE FROM departamento WHERE id = $1`, [id]);
    await registrarAuditoria(tx, {
      accion: 'config_cambiada',
      usuario_id: actor.id,
      detalle: { seccion: 'departamento', departamento_id: id, accion: 'eliminado' },
    });
  });
}

// ---- Feriados ----

const anioActualSantiago = (): number =>
  Number(new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric' }).format(new Date()));

export async function listarFeriados(q: FeriadosQueryDatos): Promise<FeriadoSalidaDatos[]> {
  const valores: unknown[] = [q.anio ?? anioActualSantiago()];
  let filtro = '';
  if (q.departamento_id !== undefined) {
    valores.push(q.departamento_id);
    filtro = ` AND (departamento_id IS NULL OR departamento_id = $2)`;
  }
  return dataSource.query(
    `SELECT id, fecha::text AS fecha, nombre, departamento_id FROM feriado
      WHERE extract(year FROM fecha) = $1${filtro} ORDER BY fecha, id`,
    valores,
  );
}

export async function crearFeriado(
  actor: UsuarioSesion,
  e: FeriadoEntradaDatos,
): Promise<FeriadoSalidaDatos> {
  try {
    return await enTransaccion(async (tx) => {
      if (e.departamento_id !== null) {
        const existe: unknown[] = await tx.query(`SELECT 1 FROM departamento WHERE id = $1`, [
          e.departamento_id,
        ]);
        if (existe.length === 0) {
          throw new ErrorApp('VALIDACION', 'Datos inválidos', { departamento_id: ['No existe'] });
        }
      }
      const [fila] = (await tx.query(
        `INSERT INTO feriado (fecha, nombre, departamento_id) VALUES ($1, $2, $3)
         RETURNING id, fecha::text AS fecha, nombre, departamento_id`,
        [e.fecha, e.nombre, e.departamento_id],
      )) as [FeriadoSalidaDatos];
      await registrarAuditoria(tx, {
        accion: 'config_cambiada',
        usuario_id: actor.id,
        detalle: { seccion: 'feriado', fecha: e.fecha, accion: 'creado' },
      });
      return fila;
    });
  } catch (err) {
    if (esViolacionUnica(err)) {
      throw new ErrorApp('CONFLICTO', 'Ya existe un feriado en esa fecha', { campo: 'fecha' });
    }
    throw err;
  }
}

export async function eliminarFeriado(actor: UsuarioSesion, id: number): Promise<void> {
  await enTransaccion(async (tx) => {
    // DELETE … RETURNING devuelve [filas, cantidad]
    const [filas] = (await tx.query(
      `DELETE FROM feriado WHERE id = $1 RETURNING fecha::text AS fecha`,
      [id],
    )) as [{ fecha: string }[], number];
    const borrado = filas[0];
    if (!borrado) throw new ErrorApp('NO_ENCONTRADO', 'Feriado no encontrado');
    await registrarAuditoria(tx, {
      accion: 'config_cambiada',
      usuario_id: actor.id,
      detalle: { seccion: 'feriado', fecha: borrado.fecha, accion: 'eliminado' },
    });
  });
}

// Calendario del departamento para el motor de horas: feriados generales y propios de los años indicados.
export async function cargarCalendario(
  m: EntityManager,
  departamento_id: number,
  anios: number[],
): Promise<Calendario> {
  const [depto]: { hora_extendida_desde: string }[] = await m.query(
    `SELECT hora_extendida_desde FROM departamento WHERE id = $1`,
    [departamento_id],
  );
  if (!depto) throw new ErrorApp('NO_ENCONTRADO', 'Departamento no encontrado');
  const horario: FilaHorario[] = await m.query(
    `SELECT departamento_id, dia_semana, activo, entrada, salida, colacion_inicio, colacion_min
       FROM horario_dia WHERE departamento_id = $1 ORDER BY dia_semana`,
    [departamento_id],
  );
  const feriados: { fecha: string }[] = await m.query(
    `SELECT DISTINCT fecha::text AS fecha FROM feriado
      WHERE (departamento_id IS NULL OR departamento_id = $1) AND extract(year FROM fecha) = ANY($2::int[])
      ORDER BY fecha`,
    [departamento_id, anios],
  );
  return {
    horario: horario.map(sinDepartamentoId),
    feriados: feriados.map((f) => f.fecha),
    hora_extendida_desde: depto.hora_extendida_desde,
  };
}
