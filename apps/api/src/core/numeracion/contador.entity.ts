import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'contador' })
export class Contador {
  @PrimaryColumn({ type: 'text' })
  clave!: 'ticket' | 'ot';

  @Column({ type: 'text' })
  prefijo!: string;

  @Column({ type: 'integer' })
  inicial!: number;

  @Column({ type: 'integer' })
  digitos!: number;

  @Column({ type: 'text' })
  modo!: 'correlativo' | 'aleatorio';

  @Column({ type: 'integer' })
  valor!: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  actualizado_en!: Date;
}
