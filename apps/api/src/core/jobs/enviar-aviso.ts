import type PgBoss from 'pg-boss';

export const COLA_ENVIAR_AVISO = 'aviso.enviar';

// Encola el envío de un aviso por un canal externo; el worker y la cola llegan con el bloque 6C.
// `singletonKey` evita encolar dos veces el mismo (aviso, canal).
export function encolarEnvio(
  boss: PgBoss,
  aviso_id: number | string,
  canal: 'telegram' | 'correo',
): Promise<string | null> {
  return boss.send(
    COLA_ENVIAR_AVISO,
    { aviso_id: Number(aviso_id), canal },
    { singletonKey: `${aviso_id}:${canal}` },
  );
}
