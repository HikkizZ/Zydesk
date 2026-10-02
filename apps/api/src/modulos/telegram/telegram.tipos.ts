import type {
  BotVincularEntrada,
  BotVincularSalida,
  CodigoVinculoSalida,
  TelegramEstadoSalida,
} from '@zydesk/shared';
import type { z } from 'zod';

// El paquete compartido no exporta los tipos de los esquemas: se infieren aquí.
export type BotVincularEntradaDatos = z.infer<typeof BotVincularEntrada>;
export type BotVincularSalidaDatos = z.infer<typeof BotVincularSalida>;
export type CodigoVinculoSalidaDatos = z.infer<typeof CodigoVinculoSalida>;
export type TelegramEstadoSalidaDatos = z.infer<typeof TelegramEstadoSalida>;
