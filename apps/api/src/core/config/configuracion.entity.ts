import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'configuracion' })
export class Configuracion {
  @PrimaryColumn({ type: 'text' })
  clave!: string;

  @Column({ type: 'jsonb' })
  valor!: unknown;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  actualizado_en!: Date;
}
