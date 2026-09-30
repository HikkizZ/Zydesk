import { Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'mencion' })
export class Mencion {
  @PrimaryColumn({ type: 'integer' })
  mensaje_id!: number;

  @PrimaryColumn({ type: 'integer' })
  usuario_id!: number;
}
