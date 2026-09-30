import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'ticket_responsable' })
export class TicketResponsable {
  @PrimaryColumn({ type: 'integer' })
  ticket_id!: number;

  @PrimaryColumn({ type: 'integer' })
  usuario_id!: number;

  @Column({ type: 'boolean', default: false })
  principal!: boolean;
}
