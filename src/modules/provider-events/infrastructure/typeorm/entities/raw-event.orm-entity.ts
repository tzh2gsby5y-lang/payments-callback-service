import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  CallbackSource,
  RawEventStatus,
} from '../../../../../shared/provider-events/domain/provider-callback-event';

@Entity({ name: 'raw_events' })
@Index('idx_raw_events_brand_provider_status_received', [
  'brandId',
  'source',
  'provider',
  'status',
  'receivedAt',
])
@Index('idx_raw_events_brand_provider_event', ['brandId', 'source', 'provider', 'providerEventId'])
export class RawEventOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'brand_id', type: 'varchar', length: 80 })
  brandId!: string;

  @Column({ type: 'varchar', length: 16 })
  source!: CallbackSource;

  @Column({ type: 'varchar', length: 80 })
  provider!: string;

  @Column({ name: 'provider_event_id', type: 'varchar', length: 255 })
  providerEventId!: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 255 })
  idempotencyKey!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 160 })
  eventType!: string;

  @Column({ type: 'varchar', length: 32 })
  status!: RawEventStatus;

  @Column({ name: 'signature_valid', type: 'boolean' })
  signatureValid!: boolean;

  @Column({ name: 'request_hash', type: 'char', length: 64 })
  requestHash!: string;

  @Column({ type: 'jsonb' })
  headers!: Record<string, unknown>;

  @Column({ name: 'raw_body', type: 'text' })
  rawBody!: string;

  @Column({ name: 'parsed_body', type: 'jsonb' })
  parsedBody!: unknown;

  @Column({ name: 'normalized_body', type: 'jsonb' })
  normalizedBody!: unknown;

  @Column({ name: 'response_status', type: 'integer', nullable: true })
  responseStatus!: number | null;

  @Column({ name: 'response_body', type: 'jsonb', nullable: true })
  responseBody!: unknown;

  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
