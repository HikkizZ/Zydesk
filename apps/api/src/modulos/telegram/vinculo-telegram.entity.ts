import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'vinculo_telegram' })
export class VinculoTelegram {
  @PrimaryColumn({ type: 'integer' })
  usuario_id!: number;

  // bigint: pg lo entrega como string
  @Column({ type: 'bigint' })
  chat_id!: string;

  @Column({ type: 'text', nullable: true })
  telegram_usuario!: string | null;

  // sesión `origen = bot` vigente (NULL si se cerró o venció)
  @Column({ type: 'uuid', nullable: true })
  sesion_id!: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  vinculado_en!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  ultimo_envio_en!: Date | null;
}
