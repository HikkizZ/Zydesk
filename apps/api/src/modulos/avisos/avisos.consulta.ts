import { EVENTOS_POR_FILTRO, iniciales } from '@zydesk/shared';
import type { EntityManager } from 'typeorm';
import type { AvisoSalidaDatos, AvisosQueryDatos, AvisosSalidaDatos } from './avisos.tipos.js';

interface FilaAviso {
  id: string;
  evento: AvisoSalidaDatos['evento'];
  tipo: AvisoSalidaDatos['tipo'];
  texto: string;
  enlace: string;
  entidad: 'ticket' | 'ot';
  entidad_id: number;
  datos: Record<string, unknown>;
  leido_en: Date | null;
  creado_en: Date;
  actor_id: number | null;
  actor_nombre: string | null;
  actor_color: string | null;
  telegram: AvisoSalidaDatos['telegram'];
}

const SELECT_AVISO = `
  SELECT a.id, a.evento, a.tipo, a.texto, a.enlace, a.entidad, a.entidad_id, a.datos, a.leido_en,
         a.creado_en, a.actor_id, u.nombre AS actor_nombre, u.color_avatar AS actor_color,
         e.estado AS telegram
    FROM aviso a
    LEFT JOIN usuario u ON u.id = a.actor_id
    LEFT JOIN aviso_envio e ON e.aviso_id = a.id AND e.canal = 'telegram'`;

function aSalida(f: FilaAviso): AvisoSalidaDatos {
  return {
    id: Number(f.id),
    evento: f.evento,
    tipo: f.tipo,
    texto: f.texto,
    enlace: f.enlace,
    entidad: f.entidad,
    entidad_id: f.entidad_id,
    datos: f.datos,
    actor:
      f.actor_id === null
        ? null
        : {
            id: f.actor_id,
            nombre: f.actor_nombre ?? '',
            iniciales: iniciales(f.actor_nombre ?? ''),
            color_avatar: f.actor_color ?? '',
          },
    leido: f.leido_en !== null,
    leido_en: f.leido_en ? f.leido_en.toISOString() : null,
    creado_en: f.creado_en.toISOString(),
    telegram: f.telegram,
  };
}

// No leídos de la persona que se ven en la app (`en_app`); alimenta el badge del menú.
export async function contarNoLeidos(m: EntityManager, usuario_id: number): Promise<number> {
  const [f]: { n: number }[] = await m.query(
    `SELECT count(*)::int AS n FROM aviso WHERE usuario_id = $1 AND leido_en IS NULL AND en_app`,
    [usuario_id],
  );
  return f!.n;
}

// Un aviso es de su dueño: uno ajeno o que no se muestra en la app responde `null` (no revela existencia).
export async function cargarAviso(
  m: EntityManager,
  id: number,
  usuario_id: number,
): Promise<AvisoSalidaDatos | null> {
  const [f]: FilaAviso[] = await m.query(
    `${SELECT_AVISO} WHERE a.id = $1 AND a.usuario_id = $2 AND a.en_app`,
    [id, usuario_id],
  );
  return f ? aSalida(f) : null;
}

export async function listarAvisos(
  m: EntityManager,
  usuario_id: number,
  q: AvisosQueryDatos,
): Promise<AvisosSalidaDatos> {
  const params: unknown[] = [usuario_id];
  const where = ['a.usuario_id = $1', 'a.en_app'];
  if (q.filtro !== 'todos') {
    params.push(EVENTOS_POR_FILTRO[q.filtro]);
    where.push(`a.evento = ANY($${params.length}::text[])`);
  }
  if (q.solo_no_leidos === 'true') where.push('a.leido_en IS NULL');

  const [conteo]: { n: number }[] = await m.query(
    `SELECT count(*)::int AS n FROM aviso a WHERE ${where.join(' AND ')}`,
    params,
  );
  const filas: FilaAviso[] = await m.query(
    `${SELECT_AVISO} WHERE ${where.join(' AND ')}
      ORDER BY a.creado_en DESC, a.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, q.por_pagina, (q.pagina - 1) * q.por_pagina],
  );
  return {
    datos: filas.map(aSalida),
    total: conteo!.n,
    pagina: q.pagina,
    por_pagina: q.por_pagina,
    no_leidos: await contarNoLeidos(m, usuario_id),
  };
}
