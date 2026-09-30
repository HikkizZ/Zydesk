import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'correo_adjunto' })
export class CorreoAdjunto {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  @Column({ type: 'integer' })
  ticket_id!: number;

  // original (.eml/.msg o .txt del texto pegado)
  @Column({ type: 'integer', nullable: true })
  archivo_id!: number | null;

  @Column({ type: 'text' })
  origen!: 'eml' | 'msg' | 'texto';

  @Column({ type: 'text', nullable: true })
  de!: string | null;

  @Column({ type: 'text', nullable: true })
  para!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  fecha!: Date | null;

  @Column({ type: 'text', nullable: true })
  asunto!: string | null;

  @Column({ type: 'text', default: '' })
  cuerpo!: string;
}
