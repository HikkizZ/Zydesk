import type { CorreoParseadoSalida } from '@zydesk/shared';
import type { z } from 'zod';
import { IsNull } from 'typeorm';
import { dataSource } from '../../config/db.js';
import type { UsuarioSesion } from '../../core/auth/tipos.js';
import { ErrorApp } from '../../core/errores/error-app.js';
import { permitidoPorExtension } from '../../integraciones/archivos/mime.js';
import { leerCorreo, solicitanteDesde } from '../../integraciones/correo/index.js';
import { Archivo } from '../archivos/archivo.entity.js';

export type CorreoParseadoDatos = z.infer<typeof CorreoParseadoSalida>;

// No persiste nada. Con `archivo_id`: pendiente propio con categoría `correo` (si no, 404).
export async function parsearCorreo(
  actor: UsuarioSesion,
  entrada: { archivo_id: number } | { texto: string },
): Promise<CorreoParseadoDatos> {
  let leido;
  if ('archivo_id' in entrada) {
    const archivo = await dataSource.manager.findOneBy(Archivo, {
      id: entrada.archivo_id,
      entidad: IsNull(),
      subido_por: actor.id,
      categoria: 'correo',
    });
    if (!archivo) throw new ErrorApp('NO_ENCONTRADO', 'Archivo no encontrado');
    leido = await leerCorreo({ archivo });
  } else {
    leido = await leerCorreo({ texto: entrada.texto });
  }
  return {
    origen: leido.origen,
    de: leido.de,
    para: leido.para,
    fecha: leido.fecha ? leido.fecha.toISOString() : null,
    asunto: leido.asunto,
    cuerpo_texto: leido.cuerpo_texto,
    adjuntos: leido.adjuntos.map((a) => ({
      indice: a.indice,
      nombre: a.nombre,
      tamano: a.tamano,
      tipo_mime: a.tipo_mime,
      permitido: permitidoPorExtension(a.nombre, a.tamano),
    })),
    solicitante_sugerido: solicitanteDesde(leido.de),
  };
}
