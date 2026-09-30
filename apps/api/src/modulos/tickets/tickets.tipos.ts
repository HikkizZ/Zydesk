import type {
  ArchivoSalida,
  ClienteBreve,
  ResponsablesEntrada,
  SeguidoresEntrada,
  TableroQuery,
  TareaSalida,
  TicketCrearEntrada,
  TicketEditarEntrada,
  TicketResumen,
  TicketSalida,
  TicketsQuery,
} from '@zydesk/shared';
import type { z } from 'zod';

// El paquete compartido no exporta los tipos de los esquemas de ticket: se infieren aquí.
export type ArchivoSalidaDatos = z.infer<typeof ArchivoSalida>;
export type ClienteBreveDatos = z.infer<typeof ClienteBreve>;
export type TareaSalidaDatos = z.infer<typeof TareaSalida>;
export type TicketResumenDatos = z.infer<typeof TicketResumen>;
export type TicketSalidaDatos = z.infer<typeof TicketSalida>;
export type TicketsQueryDatos = z.infer<typeof TicketsQuery>;
export type TableroQueryDatos = z.infer<typeof TableroQuery>;
export type TicketCrearEntradaDatos = z.infer<typeof TicketCrearEntrada>;
export type TicketEditarEntradaDatos = z.infer<typeof TicketEditarEntrada>;
export type ResponsablesEntradaDatos = z.infer<typeof ResponsablesEntrada>;
export type SeguidoresEntradaDatos = z.infer<typeof SeguidoresEntrada>;
