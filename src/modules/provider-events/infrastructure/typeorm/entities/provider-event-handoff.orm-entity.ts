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
import { ProviderEventHandoffStatus } from '../../../../../shared/provider-events/domain/provider-event-handoff';
import { RawEventOrmEntity } from './raw-event.orm-entity';

@Entity({ name: 'provider_event_handoffs' })
@Index(
  'idx_provider_handoffs_brand_source_provider_key_unique',
  ['brandId', 'source', 'provider', 'idempotencyKey'],
  {
    unique: true,
  },
)
@Index('idx_provider_handoffs_status_next_created', ['status', 'nextAttemptAt', 'createdAt'])
@Index('idx_provider_handoffs_brand_provider_event', [
  'brandId',
  'source',
  'provider',
  'providerEventId',
])
@Index('idx_provider_handoffs_raw_event_id', ['rawEventId'])
export class ProviderEventHandoffOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'brand_id', type: 'varchar', length: 80 })
  brandId!: string;

  @Column({ type: 'varchar', length: 16 })
  source!: 'psp';

  @Column({ type: 'varchar', length: 80 })
  provider!: string;

  @Column({ name: 'raw_event_id', type: 'uuid' })
  rawEventId!: string;

  @ManyToOne(() => RawEventOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'raw_event_id',
    foreignKeyConstraintName: 'fk_provider_handoffs_raw_event_id',
  })
  rawEvent!: RawEventOrmEntity;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 255 })
  idempotencyKey!: string;

  @Column({ name: 'provider_event_id', type: 'varchar', length: 255 })
  providerEventId!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 160 })
  eventType!: string;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 40 })
  aggregateType!: 'payment' | 'game_round';

  @Column({ name: 'aggregate_id', type: 'varchar', length: 255 })
  aggregateId!: string;

  @Column({ name: 'player_id', type: 'varchar', length: 255, nullable: true })
  playerId!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  amount!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  currency!: string | null;

  @Column({ type: 'varchar', length: 32 })
  status!: ProviderEventHandoffStatus;

  @Column({ type: 'jsonb' })
  payload!: unknown;

  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount!: number;

  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true })
  nextAttemptAt!: Date | null;

  @Column({ name: 'last_error', type: 'jsonb', nullable: true })
  lastError!: unknown;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
