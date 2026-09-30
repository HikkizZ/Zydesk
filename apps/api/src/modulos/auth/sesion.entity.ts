import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'sesion' })
export class Sesion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  token_hash!: string;

  @Column({ type: 'integer' })
  usuario_id!: number;

  @Column({ type: 'text' })
  origen!: 'web' | 'bot';

  @Column({ type: 'boolean', default: false })
  mantener!: boolean;

  @Column({ type: 'inet', nullable: true })
  ip!: string | null;

  @Column({ type: 'text', nullable: true })
  user_agent!: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  creada_en!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  ultimo_uso!: Date;

  // inactividad (deslizante)
  @Column({ type: 'timestamptz' })
  expira_en!: Date;

  // absoluta
  @Column({ type: 'timestamptz' })
  expira_max_en!: Date;
}
