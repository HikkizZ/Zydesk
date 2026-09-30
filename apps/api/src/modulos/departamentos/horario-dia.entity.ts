import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'horario_dia' })
export class HorarioDia {
  @PrimaryColumn({ type: 'integer' })
  departamento_id!: number;

  // 0 = domingo (getDay), ADR 0005
  @PrimaryColumn({ type: 'smallint' })
  dia_semana!: number;

  @Column({ type: 'boolean' })
  activo!: boolean;

  @Column({ type: 'text' })
  entrada!: string;

  @Column({ type: 'text' })
  salida!: string;

  @Column({ type: 'text' })
  colacion_inicio!: string;

  @Column({ type: 'integer' })
  colacion_min!: number;
}
