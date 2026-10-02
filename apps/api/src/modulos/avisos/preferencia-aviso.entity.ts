import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'preferencia_aviso' })
export class PreferenciaAviso {
  @PrimaryColumn({ type: 'integer' })
  usuario_id!: number;

  @PrimaryColumn({ type: 'text' })
  evento!: string;

  @PrimaryColumn({ type: 'text' })
  canal!: string;

  @Column({ type: 'boolean' })
  activo!: boolean;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  actualizado_en!: Date;
}
