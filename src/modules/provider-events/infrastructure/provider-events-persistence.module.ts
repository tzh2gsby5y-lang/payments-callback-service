import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PROVIDER_EVENT_INGESTION_STORE } from '../application/provider-event-ingestion.store';
import { IDEMPOTENCY_REPOSITORY } from '../domain/repositories/idempotency.repository';
import { RAW_EVENTS_REPOSITORY } from '../domain/repositories/raw-events.repository';
import { IdempotencyKeyOrmEntity } from './typeorm/entities/idempotency-key.orm-entity';
import { ProviderEventHandoffOrmEntity } from './typeorm/entities/provider-event-handoff.orm-entity';
import { RawEventOrmEntity } from './typeorm/entities/raw-event.orm-entity';
import { TypeOrmIdempotencyRepository } from './typeorm/typeorm-idempotency.repository';
import { TypeOrmProviderEventIngestionStore } from './typeorm/typeorm-provider-event-ingestion.store';
import { TypeOrmRawEventsRepository } from './typeorm/typeorm-raw-events.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RawEventOrmEntity,
      IdempotencyKeyOrmEntity,
      ProviderEventHandoffOrmEntity,
    ]),
  ],
  providers: [
    TypeOrmRawEventsRepository,
    TypeOrmIdempotencyRepository,
    TypeOrmProviderEventIngestionStore,
    {
      provide: RAW_EVENTS_REPOSITORY,
      useExisting: TypeOrmRawEventsRepository,
    },
    {
      provide: IDEMPOTENCY_REPOSITORY,
      useExisting: TypeOrmIdempotencyRepository,
    },
    {
      provide: PROVIDER_EVENT_INGESTION_STORE,
      useExisting: TypeOrmProviderEventIngestionStore,
    },
  ],
  exports: [RAW_EVENTS_REPOSITORY, IDEMPOTENCY_REPOSITORY, PROVIDER_EVENT_INGESTION_STORE],
})
export class ProviderEventsPersistenceModule {}
