import { z } from 'zod';
import { AvisoSalida } from './aviso.js';
import { fechaIso, id } from './comunes.js';
import { OtResumen } from './ot.js';
import { TareaSalida } from './tarea.js';
import { TicketResumen } from './ticket.js';

export const TareaMiDia = TareaSalida.extend({
  destino: z.object({
    tipo: z.enum(['ticket', 'ot']),
    id,
    codigo: z.string(),
    titulo: z.string(),
  }),
});

export const MiDiaSalida = z.object({
  fecha: fechaIso, // hoy en Santiago
  vencen_hoy: z.array(TicketResumen),
  vencidos: z.array(TicketResumen), // tickets míos (responsable) abiertos
  por_aprobar: z.array(OtResumen), // OT internas en borrador con aprobador_id = yo (B8); [] sin `ots.aprobar`
  menciones: z.array(AvisoSalida), // tipo 'mencion', no leídos, en_app, máx. 10
  tareas: z.array(TareaMiDia), // abiertas, responsable = yo, destino no cerrado; por fecha, máx. 20
  detenidos: z.array(TicketResumen), // míos abiertos con actualizado_en < hoy − 3 días, máx. 10
  conteos: z.object({
    vencen_hoy: z.number(),
    vencidos: z.number(),
    por_aprobar: z.number(),
    menciones: z.number(),
    tareas: z.number(),
    detenidos: z.number(),
  }), // totales sin recorte
});
