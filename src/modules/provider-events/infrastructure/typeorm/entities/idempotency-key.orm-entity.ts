import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  CallbackSource,
  IdempotencyStatus,
} from '../../../../../shared/provider-events/domain/provider-callback-event';
import { RawEventOrmEntity } from './raw-event.orm-entity';

@Entity({ name: 'idempotency_keys' })
@Index('idx_idempotency_brand_provider_key_unique', ['brandId', 'source', 'provider', 'key'], {
  unique: true,
})
@Index('idx_idempotency_brand_provider_status_created', [
  'brandId',
  'source',
  'provider',
  'status',
  'createdAt',
])
@Index('idx_idempotency_raw_event_id', ['rawEventId'])
export class IdempotencyKeyOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'brand_id', type: 'varchar', length: 80 })
  brandId!: string;

  @Column({ type: 'varchar', length: 16 })
  source!: CallbackSource;

  @Column({ type: 'varchar', length: 80 })
  provider!: string;

  @Column({ type: 'varchar', length: 255 })
  key!: string;

  @Column({ name: 'raw_event_id', type: 'uuid' })
  rawEventId!: string;

  @ManyToOne(() => RawEventOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'raw_event_id',
    foreignKeyConstraintName: 'fk_idempotency_keys_raw_event_id',
  })
  rawEvent!: RawEventOrmEntity;

  @Column({ name: 'request_hash', type: 'char', length: 64 })
  requestHash!: string;

  @Column({ type: 'varchar', length: 32 })
  status!: IdempotencyStatus;

  @Column({ name: 'response_status', type: 'integer', nullable: true })
  responseStatus!: number | null;

  @Column({ name: 'response_body', type: 'jsonb', nullable: true })
  responseBody!: unknown;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
