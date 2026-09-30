import { Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'ticket_seguidor' })
export class TicketSeguidor {
  @PrimaryColumn({ type: 'integer' })
  ticket_id!: number;

  @PrimaryColumn({ type: 'integer' })
  usuario_id!: number;
}
