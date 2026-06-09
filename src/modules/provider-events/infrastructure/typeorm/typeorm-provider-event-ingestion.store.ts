import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { DomainError } from '../../../../shared/errors/domain-error';
import {
  IdempotencyStatuses,
  RawEventStatuses,
} from '../../../../shared/provider-events/domain/provider-callback-event';
import { ProviderEventHandoffStatuses } from '../../../../shared/provider-events/domain/provider-event-handoff';
import {
  ProviderWebhookHandoffStates,
  ProviderWebhookResponseStatuses,
} from '../../../../shared/provider-events/domain/provider-webhook-response';
import {
  ProviderEventIngestionResponseBody,
  ProviderEventIngestionStore,
  ProviderEventIngestionStoreInput,
  ProviderEventIngestionStoreResult,
} from '../../application/provider-event-ingestion.store';
import { IdempotencyKeyOrmEntity } from './entities/idempotency-key.orm-entity';
import { ProviderEventHandoffOrmEntity } from './entities/provider-event-handoff.orm-entity';
import { RawEventOrmEntity } from './entities/raw-event.orm-entity';

type PostgresError = Error & {
  code?: string;
  driverError?: {
    code?: string;
  };
};

@Injectable()
export class TypeOrmProviderEventIngestionStore implements ProviderEventIngestionStore {
  private readonly dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
  }

  async persist(
    input: ProviderEventIngestionStoreInput,
  ): Promise<ProviderEventIngestionStoreResult> {
    return this.dataSource.transaction(async (manager) => {
      const rawEvent = await this.createRawEvent(manager, input);
      const claim = await this.claimIdempotency(manager, input, rawEvent.id);

      if (claim.kind === 'conflict') {
        await manager.save(
          RawEventOrmEntity,
          manager.create(RawEventOrmEntity, {
            id: rawEvent.id,
            status: RawEventStatuses.CONFLICT,
            responseStatus: 409,
            responseBody: {
              status: 'conflict',
              code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
            },
          }),
        );
        return { kind: 'conflict' };
      }

      if (claim.kind === 'duplicate') {
        const handoff = await this.findHandoff(manager, input);
        const processing = claim.record.status === IdempotencyStatuses.PROCESSING;
        const body: ProviderEventIngestionResponseBody = {
          status: processing
            ? ProviderWebhookResponseStatuses.PROCESSING
            : ProviderWebhookResponseStatuses.DUPLICATE,
          eventId: claim.record.rawEventId,
          provider: input.provider,
          source: input.source,
          idempotencyKey: input.idempotencyKey,
          handoff: processing
            ? ProviderWebhookHandoffStates.PENDING_ORIGINAL_CLAIM
            : ProviderWebhookHandoffStates.ALREADY_PENDING,
          ...(handoff && !processing ? { handoffId: handoff.id } : {}),
        };
        const statusCode = processing ? 202 : 200;

        await manager.save(
          RawEventOrmEntity,
          manager.create(RawEventOrmEntity, {
            id: rawEvent.id,
            status: RawEventStatuses.DUPLICATE,
            responseStatus: statusCode,
            responseBody: body,
          }),
        );

        return { kind: 'duplicate', statusCode, body };
      }

      const handoff = await this.createHandoff(manager, input, rawEvent.id);
      const acceptedBody: ProviderEventIngestionResponseBody = {
        status: ProviderWebhookResponseStatuses.ACCEPTED,
        eventId: rawEvent.id,
        provider: input.provider,
        source: input.source,
        idempotencyKey: input.idempotencyKey,
        handoff: ProviderWebhookHandoffStates.PENDING_EVALUATION,
        handoffId: handoff.id,
      };

      await manager.save(
        IdempotencyKeyOrmEntity,
        manager.create(IdempotencyKeyOrmEntity, {
          id: claim.record.id,
          status: IdempotencyStatuses.SUCCEEDED,
          responseStatus: 202,
          responseBody: acceptedBody,
        }),
      );
      await manager.save(
        RawEventOrmEntity,
        manager.create(RawEventOrmEntity, {
          id: rawEvent.id,
          status: RawEventStatuses.ACCEPTED,
          responseStatus: 202,
          responseBody: acceptedBody,
        }),
      );

      return { kind: 'accepted', statusCode: 202, body: acceptedBody };
    });
  }

  private async createRawEvent(
    manager: EntityManager,
    input: ProviderEventIngestionStoreInput,
  ): Promise<RawEventOrmEntity> {
    return manager.save(
      RawEventOrmEntity,
      manager.create(RawEventOrmEntity, {
        brandId: input.normalized.brandId,
        source: input.source,
        provider: input.provider,
        providerEventId: input.normalized.providerEventId,
        idempotencyKey: input.idempotencyKey,
        eventType: input.normalized.eventType,
        status: RawEventStatuses.RECEIVED,
        signatureValid: true,
        requestHash: input.requestHash,
        headers: input.headers,
        rawBody: input.rawBody,
        parsedBody: input.parsedBody,
        normalizedBody: { ...input.normalized, idempotencyFingerprint: input.fingerprintFields },
        responseStatus: null,
        responseBody: null,
      }),
    );
  }

  private async claimIdempotency(
    manager: EntityManager,
    input: ProviderEventIngestionStoreInput,
    rawEventId: string,
  ): Promise<
    | { kind: 'new'; record: IdempotencyKeyOrmEntity }
    | { kind: 'duplicate'; record: IdempotencyKeyOrmEntity }
    | { kind: 'conflict'; record: IdempotencyKeyOrmEntity }
  > {
    const insertResult = await manager
      .createQueryBuilder()
      .insert()
      .into(IdempotencyKeyOrmEntity)
      .values({
        brandId: input.normalized.brandId,
        source: input.source,
        provider: input.provider,
        key: input.idempotencyKey,
        rawEventId,
        requestHash: input.requestHash,
        status: IdempotencyStatuses.PROCESSING,
      })
      .orIgnore()
      .returning(['id'])
      .execute();

    const insertedId =
      (insertResult.identifiers[0] as { id?: string } | undefined)?.id ??
      (insertResult.raw[0] as { id?: string } | undefined)?.id;

    if (insertedId) {
      const record = await manager.findOneOrFail(IdempotencyKeyOrmEntity, {
        where: { id: insertedId },
      });
      return { kind: 'new', record };
    }

    const existing = await manager.findOneOrFail(IdempotencyKeyOrmEntity, {
      where: {
        brandId: input.normalized.brandId,
        source: input.source,
        provider: input.provider,
        key: input.idempotencyKey,
      },
    });

    return existing.requestHash === input.requestHash
      ? { kind: 'duplicate', record: existing }
      : { kind: 'conflict', record: existing };
  }

  private async createHandoff(
    manager: EntityManager,
    input: ProviderEventIngestionStoreInput,
    rawEventId: string,
  ): Promise<ProviderEventHandoffOrmEntity> {
    try {
      return await manager.save(
        ProviderEventHandoffOrmEntity,
        manager.create(ProviderEventHandoffOrmEntity, {
          brandId: input.normalized.brandId,
          source: input.source,
          provider: input.provider,
          rawEventId,
          idempotencyKey: input.idempotencyKey,
          providerEventId: input.normalized.providerEventId,
          eventType: input.normalized.eventType,
          aggregateType: input.normalized.aggregateType,
          aggregateId: input.normalized.aggregateId,
          playerId: input.normalized.playerId,
          amount: input.normalized.amount,
          currency: input.normalized.currency,
          status: ProviderEventHandoffStatuses.PENDING_EVALUATION,
          payload: this.buildPayload(input, rawEventId),
          attemptCount: 0,
          nextAttemptAt: new Date(),
          lastError: null,
        }),
      );
    } catch (error) {
      const postgresError = error as PostgresError;
      const errorCode = postgresError.code ?? postgresError.driverError?.code;
      if (errorCode !== '23505') {
        throw error;
      }

      const existing = await this.findHandoff(manager, input);
      if (!existing) {
        throw new DomainError(
          'PROVIDER_HANDOFF_NOT_FOUND',
          'Provider handoff could not be recovered',
          500,
        );
      }

      return existing;
    }
  }

  private async findHandoff(
    manager: EntityManager,
    input: ProviderEventIngestionStoreInput,
  ): Promise<ProviderEventHandoffOrmEntity | null> {
    return manager.findOne(ProviderEventHandoffOrmEntity, {
      where: {
        brandId: input.normalized.brandId,
        source: input.source,
        provider: input.provider,
        idempotencyKey: input.idempotencyKey,
      },
    });
  }

  private buildPayload(
    input: ProviderEventIngestionStoreInput,
    rawEventId: string,
  ): Record<string, unknown> {
    return {
      payloadVersion: 1,
      mode: 'async_payment_callback',
      rawEventId,
      providerEventId: input.normalized.providerEventId,
      eventType: input.normalized.eventType,
      aggregateType: input.normalized.aggregateType,
      aggregateId: input.normalized.aggregateId,
      amount: input.normalized.amount,
      currency: input.normalized.currency,
      playerId: input.normalized.playerId,
      occurredAt: input.normalized.occurredAt?.toISOString() ?? null,
    };
  }
}
