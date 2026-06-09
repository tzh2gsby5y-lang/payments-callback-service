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
import { GspWalletIntentStatus, GspWalletOperation } from '../../../domain/gsp-wallet-action';
import { IdempotencyKeyOrmEntity } from '../../../../provider-events/infrastructure/typeorm/entities/idempotency-key.orm-entity';
import { RawEventOrmEntity } from '../../../../provider-events/infrastructure/typeorm/entities/raw-event.orm-entity';

@Entity({ name: 'gsp_wallet_intents' })
@Index(
  'idx_gsp_wallet_intents_brand_provider_key_unique',
  ['brandId', 'source', 'provider', 'idempotencyKey'],
  {
    unique: true,
  },
)
@Index('idx_gsp_wallet_intents_ledger_command_unique', ['ledgerCommandId'], { unique: true })
@Index('idx_gsp_wallet_intents_status_next_created', ['status', 'nextAttemptAt', 'createdAt'])
@Index('idx_gsp_wallet_intents_brand_player_created', [
  'brandId',
  'provider',
  'playerId',
  'createdAt',
])
@Index('idx_gsp_wallet_intents_brand_round', ['brandId', 'provider', 'roundId'])
export class GspWalletIntentOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'brand_id', type: 'varchar', length: 80 })
  brandId!: string;

  @Column({ type: 'varchar', length: 16 })
  source!: 'gsp';

  @Column({ type: 'varchar', length: 80 })
  provider!: string;

  @Column({ name: 'raw_event_id', type: 'uuid' })
  rawEventId!: string;

  @ManyToOne(() => RawEventOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'raw_event_id',
    foreignKeyConstraintName: 'fk_gsp_wallet_intents_raw_event_id',
  })
  rawEvent!: RawEventOrmEntity;

  @Column({ name: 'idempotency_key_id', type: 'uuid' })
  idempotencyKeyId!: string;

  @ManyToOne(() => IdempotencyKeyOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'idempotency_key_id',
    foreignKeyConstraintName: 'fk_gsp_wallet_intents_idempotency_key_id',
  })
  idempotencyKeyRecord!: IdempotencyKeyOrmEntity;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 255 })
  idempotencyKey!: string;

  @Column({ name: 'request_hash', type: 'char', length: 64 })
  requestHash!: string;

  @Column({ type: 'varchar', length: 32 })
  operation!: GspWalletOperation;

  @Column({ name: 'provider_transaction_id', type: 'varchar', length: 255 })
  providerTransactionId!: string;

  @Column({ name: 'round_id', type: 'varchar', length: 255, nullable: true })
  roundId!: string | null;

  @Column({
    name: 'original_provider_transaction_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  originalProviderTransactionId!: string | null;

  @Column({ name: 'player_id', type: 'varchar', length: 255 })
  playerId!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  amount!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  currency!: string | null;

  @Column({ name: 'ledger_command_id', type: 'varchar', length: 255 })
  ledgerCommandId!: string;

  @Column({ type: 'varchar', length: 40 })
  status!: GspWalletIntentStatus;

  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount!: number;

  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true })
  nextAttemptAt!: Date | null;

  @Column({ name: 'lease_expires_at', type: 'timestamptz', nullable: true })
  leaseExpiresAt!: Date | null;

  @Column({ name: 'ledger_request', type: 'jsonb' })
  ledgerRequest!: unknown;

  @Column({ name: 'ledger_result', type: 'jsonb', nullable: true })
  ledgerResult!: unknown;

  @Column({ name: 'response_status', type: 'integer', nullable: true })
  responseStatus!: number | null;

  @Column({ name: 'response_body', type: 'jsonb', nullable: true })
  responseBody!: unknown;

  @Column({ name: 'last_error', type: 'jsonb', nullable: true })
  lastError!: unknown;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
