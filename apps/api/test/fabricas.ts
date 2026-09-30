import argon2 from 'argon2';
import type { Express } from 'express';
import request from 'supertest';
import { dataSource } from '../src/config/db.js';
import { Categoria } from '../src/modulos/categorias/categoria.entity.js';
import { Cliente } from '../src/modulos/clientes/cliente.entity.js';
import { Departamento } from '../src/modulos/departamentos/departamento.entity.js';
import { HorarioDia } from '../src/modulos/departamentos/horario-dia.entity.js';
import { versionTerminosVigente } from '../src/modulos/legal/legal.service.js';
import { Usuario } from '../src/modulos/usuarios/usuario.entity.js';

export const CONTRASENA_PRUEBA = 'Contrasena.Prueba.1';

let secuencia = 0;
const siguiente = (): number => ++secuencia;

// Mismos parámetros que core/auth/contrasena.ts (§5.6); el hash de la contraseña por defecto se calcula una vez.
const OPCIONES_HASH = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;
let hashPorDefecto: Promise<string> | undefined;

async function hashear(contrasena: string): Promise<string> {
  if (contrasena !== CONTRASENA_PRUEBA) return argon2.hash(contrasena, OPCIONES_HASH);
  hashPorDefecto ??= argon2.hash(contrasena, OPCIONES_HASH);
  return hashPorDefecto;
}

export async function crearUsuario(
  datos: {
    nombre?: string;
    correo?: string;
    rol?: Usuario['rol'];
    contrasena?: string;
    departamento_id?: number | null;
    activo?: boolean;
    debe_cambiar_contrasena?: boolean;
    terminos_version?: string | null;
  } = {},
): Promise<Usuario> {
  const n = siguiente();
  const terminos_version =
    datos.terminos_version === undefined ? versionTerminosVigente() : datos.terminos_version;
  return dataSource.manager.save(Usuario, {
    nombre: datos.nombre ?? `Usuario ${n}`,
    correo: datos.correo ?? `usuario${n}@zydesk.test`,
    contrasena_hash: await hashear(datos.contrasena ?? CONTRASENA_PRUEBA),
    rol: datos.rol ?? 'tecnico',
    departamento_id: datos.departamento_id ?? null,
    activo: datos.activo ?? true,
    color_avatar: '#CFDDF3',
    debe_cambiar_contrasena: datos.debe_cambiar_contrasena ?? false,
    // por defecto ya aceptó la versión vigente (para no frenar los tests con TERMINOS_PENDIENTES)
    terminos_version,
    terminos_aceptados_en: terminos_version ? new Date() : null,
  });
}

// L-V activos 08:30-18:00 con colación 13:00/60; sábado y domingo libres (0 = domingo).
export async function crearDepartamento(
  datos: { nombre?: string; capacidad_tickets_pct?: number } = {},
): Promise<Departamento> {
  const departamento = await dataSource.manager.save(Departamento, {
    nombre: datos.nombre ?? `Departamento ${siguiente()}`,
    hora_extendida_desde: '19:00',
    capacidad_tickets_pct: datos.capacidad_tickets_pct ?? 80,
  });
  for (let dia = 0; dia <= 6; dia++) {
    const laboral = dia >= 1 && dia <= 5;
    await dataSource.manager.save(HorarioDia, {
      departamento_id: departamento.id,
      dia_semana: dia,
      activo: laboral,
      entrada: laboral ? '08:30' : '09:00',
      salida: laboral ? '18:00' : '13:00',
      colacion_inicio: '13:00',
      colacion_min: laboral ? 60 : 0,
    });
  }
  return departamento;
}

export async function crearCliente(
  datos: Partial<Pick<Cliente, 'nombre' | 'rut' | 'es_interno' | 'activo'>> = {},
): Promise<Cliente> {
  return dataSource.manager.save(Cliente, {
    nombre: datos.nombre ?? `Cliente ${siguiente()}`,
    rut: datos.rut ?? null,
    es_interno: datos.es_interno ?? false,
    activo: datos.activo ?? true,
  });
}

export async function crearCategoria(
  datos: { nombre?: string; responsable_defecto_id?: number | null; activo?: boolean } = {},
): Promise<Categoria> {
  return dataSource.manager.save(Categoria, {
    nombre: datos.nombre ?? `Categoría ${siguiente()}`,
    responsable_defecto_id: datos.responsable_defecto_id ?? null,
    plazo_respuesta: { valor: 2, unidad: 'horas' },
    plazo_resolucion: {
      urgente: { valor: 4, unidad: 'horas' },
      alta: { valor: 1, unidad: 'dias' },
      media: { valor: 3, unidad: 'dias' },
      baja: { valor: 5, unidad: 'dias' },
    },
    activo: datos.activo ?? true,
  });
}

// Ingresa por la API y devuelve la cookie, la cabecera CSRF y un agente de Supertest que ya las envía.
export async function ingresarComo(
  app: Express,
  usuario: Pick<Usuario, 'correo'>,
  contrasena: string = CONTRASENA_PRUEBA,
  mantener = false,
): Promise<{ cookie: string; csrf: string; agente: ReturnType<typeof request.agent> }> {
  const agente = request.agent(app).set('X-Requested-With', 'Zydesk');
  const res = await agente
    .post('/api/auth/ingresar')
    .send({ correo: usuario.correo, contrasena, mantener });
  if (res.status !== 200) throw new Error(`ingresarComo falló: ${res.status} ${res.text}`);
  const cookie = (res.headers['set-cookie'] as unknown as string[])
    .map((c) => c.split(';')[0])
    .join('; ');
  return { cookie, csrf: 'Zydesk', agente };
}
