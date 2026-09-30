import { correo as esquemaCorreo, politicaContrasena } from '@zydesk/shared';
import { dataSource } from '../config/db.js';
import { hashear } from '../core/auth/contrasena.js';
import { registrarAuditoria } from '../core/historial/auditoria.js';
import { enTransaccion } from '../core/historial/transaccion.js';
import { insertarUsuario } from '../modulos/usuarios/usuarios.service.js';

export class ErrorCli extends Error {}

// Crea el primer usuario Administración (`npm run db:admin`). Exige una contraseña válida según
// la política y nunca la registra. Con `debe_cambiar_contrasena = false`: la fijó quien opera el servidor.
export async function crearAdmin(entrada: {
  correo: string;
  nombre: string;
  contrasena: string | undefined;
}): Promise<number> {
  const correo = esquemaCorreo.safeParse(entrada.correo);
  const nombre = entrada.nombre.trim();
  if (!correo.success || nombre === '' || nombre.length > 120) {
    throw new ErrorCli('Correo o nombre inválido');
  }
  if (!entrada.contrasena || !politicaContrasena(entrada.contrasena, correo.data).ok) {
    throw new ErrorCli('ADMIN_PASSWORD no definida o inválida');
  }
  const hash = await hashear(entrada.contrasena);
  return enTransaccion(async (tx) => {
    const existe: unknown[] = await tx.query(`SELECT 1 FROM usuario WHERE correo = $1`, [
      correo.data,
    ]);
    if (existe.length > 0) throw new ErrorCli('El usuario ya existe');
    const id = await insertarUsuario(tx, {
      nombre,
      correo: correo.data,
      contrasena_hash: hash,
      rol: 'admin',
      debe_cambiar_contrasena: false,
    });
    await registrarAuditoria(tx, {
      accion: 'usuario_creado',
      usuario_id: null,
      detalle: { usuario_creado_id: id, rol: 'admin', origen: 'cli' },
    });
    return id;
  });
}

export async function conDataSource<T>(fn: () => Promise<T>): Promise<T> {
  await dataSource.initialize();
  try {
    return await fn();
  } finally {
    await dataSource.destroy();
  }
}
