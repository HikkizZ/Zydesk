import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'aviso_envio' })
export class AvisoEnvio {
  // bigint: pg lo entrega como string
  @PrimaryColumn({ type: 'bigint' })
  aviso_id!: string;

  @PrimaryColumn({ type: 'text' })
  canal!: 'telegram' | 'correo';

  @Column({ type: 'text' })
  estado!: 'pendiente' | 'enviado' | 'fallido' | 'omitido';

  @Column({ type: 'integer', default: 0 })
  intentos!: number;

  // código corto de Telegram o 'sin_vinculo' / 'sin_token'; nunca el texto del aviso
  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  enviado_en!: Date | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  actualizado_en!: Date;
}
