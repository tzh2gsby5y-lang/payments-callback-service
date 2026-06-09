import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  GspWalletActionBeginResult,
  GspWalletActionCompletion,
  GspWalletActionFailure,
  GspWalletActionStore,
  GspWalletActionStoreInput,
  GspWalletCachedResponse,
} from '../../application/gsp-wallet-action.store';
import {
  CallbackSources,
  IdempotencyStatuses,
  RawEventStatuses,
} from '../../../../shared/provider-events/domain/provider-callback-event';
import { GspWalletIntentStatuses } from '../../domain/gsp-wallet-action';
import { IdempotencyKeyOrmEntity } from '../../../provider-events/infrastructure/typeorm/entities/idempotency-key.orm-entity';
import { RawEventOrmEntity } from '../../../provider-events/infrastructure/typeorm/entities/raw-event.orm-entity';
import { GspWalletIntentOrmEntity } from './entities/gsp-wallet-intent.orm-entity';

@Injectable()
export class TypeOrmGspWalletActionStore implements GspWalletActionStore {
  private readonly leaseMs = 5_000;

  constructor(private readonly dataSource: DataSource) {}

  async begin(input: GspWalletActionStoreInput): Promise<GspWalletActionBeginResult> {
    return this.dataSource.transaction(async (manager) => {
      const rawEvent = await this.createRawEvent(manager, input);
      const claim = await this.claimIdempotency(manager, input, rawEvent.id);

      if (claim.kind === 'conflict') {
        await this.updateRawEvent(manager, rawEvent.id, RawEventStatuses.CONFLICT, 409, {
          status: 'conflict',
          code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
        });
        return { kind: 'conflict' };
      }

      if (claim.kind === 'duplicate') {
        const cached = this.cachedResponseFrom(claim.record);
        await this.updateRawEvent(
          manager,
          rawEvent.id,
          RawEventStatuses.DUPLICATE,
          cached?.statusCode ?? 503,
          cached?.body ?? {
            status: 'pending',
            code: 'GSP_WALLET_RESULT_PENDING',
            idempotencyKey: input.idempotencyKey,
          },
        );

        return cached
          ? { kind: 'duplicate_completed', response: cached }
          : {
              kind: 'processing',
              rawEventId: rawEvent.id,
              brandId: input.action.brandId,
              provider: input.provider,
              idempotencyKey: input.idempotencyKey,
            };
      }

      const intent = await manager.save(
        GspWalletIntentOrmEntity,
        manager.create(GspWalletIntentOrmEntity, {
          brandId: input.action.brandId,
          source: CallbackSources.GSP,
          provider: input.provider,
          rawEventId: rawEvent.id,
          idempotencyKeyId: claim.record.id,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          operation: input.action.operation,
          providerTransactionId: input.action.providerEventId,
          roundId: input.action.roundId,
          originalProviderTransactionId: input.action.originalProviderEventId,
          playerId: input.action.playerId,
          amount: input.action.amount,
          currency: input.action.currency,
          ledgerCommandId: input.ledgerCommandId,
          status: GspWalletIntentStatuses.LEDGER_IN_FLIGHT,
          attemptCount: 1,
          nextAttemptAt: null,
          leaseExpiresAt: new Date(Date.now() + this.leaseMs),
          ledgerRequest: this.buildLedgerRequest(input),
          ledgerResult: null,
          responseStatus: null,
          responseBody: null,
          lastError: null,
          completedAt: null,
        }),
      );

      await this.updateRawEvent(manager, rawEvent.id, RawEventStatuses.ACCEPTED, null, null);

      return {
        kind: 'new',
        intent: {
          id: intent.id,
          rawEventId: rawEvent.id,
          idempotencyKeyId: claim.record.id,
          ledgerCommandId: input.ledgerCommandId,
          attemptCount: intent.attemptCount,
        },
      };
    });
  }

  async complete(completion: GspWalletActionCompletion): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.save(
        GspWalletIntentOrmEntity,
        manager.create(GspWalletIntentOrmEntity, {
          id: completion.intentId,
          status: completion.intentStatus,
          ledgerResult: completion.ledgerResult,
          responseStatus: completion.responseStatus,
          responseBody: completion.responseBody,
          leaseExpiresAt: null,
          nextAttemptAt: null,
          completedAt: new Date(),
        }),
      );
      await manager.save(
        IdempotencyKeyOrmEntity,
        manager.create(IdempotencyKeyOrmEntity, {
          id: completion.idempotencyKeyId,
          status: IdempotencyStatuses.SUCCEEDED,
          responseStatus: completion.responseStatus,
          responseBody: completion.responseBody,
        }),
      );
      await this.updateRawEvent(
        manager,
        completion.rawEventId,
        RawEventStatuses.COMPLETED,
        completion.responseStatus,
        completion.responseBody,
      );
    });
  }

  async fail(failure: GspWalletActionFailure): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.save(
        GspWalletIntentOrmEntity,
        manager.create(GspWalletIntentOrmEntity, {
          id: failure.intentId,
          status: GspWalletIntentStatuses.LEDGER_RETRYABLE_FAILURE,
          ledgerResult: null,
          responseStatus: failure.responseStatus,
          responseBody: failure.responseBody,
          leaseExpiresAt: null,
          nextAttemptAt: new Date(Date.now() + this.leaseMs),
          lastError: failure.error,
        }),
      );
      await manager.save(
        IdempotencyKeyOrmEntity,
        manager.create(IdempotencyKeyOrmEntity, {
          id: failure.idempotencyKeyId,
          status: IdempotencyStatuses.FAILED_RETRYABLE,
          responseStatus: failure.responseStatus,
          responseBody: failure.responseBody,
        }),
      );
      await this.updateRawEvent(
        manager,
        failure.rawEventId,
        RawEventStatuses.FAILED_RETRYABLE,
        failure.responseStatus,
        failure.responseBody,
      );
    });
  }

  async findCachedResponse(
    brandId: string,
    provider: string,
    idempotencyKey: string,
  ): Promise<GspWalletCachedResponse | null> {
    const record = await this.dataSource.getRepository(IdempotencyKeyOrmEntity).findOne({
      where: { brandId, source: CallbackSources.GSP, provider, key: idempotencyKey },
    });

    return record ? this.cachedResponseFrom(record) : null;
  }

  async recordDuplicateResponse(
    rawEventId: string,
    response: GspWalletCachedResponse,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.updateRawEvent(
        manager,
        rawEventId,
        RawEventStatuses.DUPLICATE,
        response.statusCode,
        response.body,
      );
    });
  }

  private async createRawEvent(
    manager: EntityManager,
    input: GspWalletActionStoreInput,
  ): Promise<RawEventOrmEntity> {
    return manager.save(
      RawEventOrmEntity,
      manager.create(RawEventOrmEntity, {
        brandId: input.action.brandId,
        source: CallbackSources.GSP,
        provider: input.provider,
        providerEventId: input.action.providerEventId,
        idempotencyKey: input.idempotencyKey,
        eventType: input.action.operation,
        status: RawEventStatuses.RECEIVED,
        signatureValid: true,
        requestHash: input.requestHash,
        headers: input.headers,
        rawBody: input.rawBody,
        parsedBody: input.parsedBody,
        normalizedBody: { ...input.action, idempotencyFingerprint: input.fingerprintFields },
        responseStatus: null,
        responseBody: null,
      }),
    );
  }

  private async claimIdempotency(
    manager: EntityManager,
    input: GspWalletActionStoreInput,
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
        brandId: input.action.brandId,
        source: CallbackSources.GSP,
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
      return {
        kind: 'new',
        record: await manager.findOneOrFail(IdempotencyKeyOrmEntity, {
          where: { id: insertedId },
        }),
      };
    }

    const existing = await manager.findOneOrFail(IdempotencyKeyOrmEntity, {
      where: {
        brandId: input.action.brandId,
        source: CallbackSources.GSP,
        provider: input.provider,
        key: input.idempotencyKey,
      },
    });

    return existing.requestHash === input.requestHash
      ? { kind: 'duplicate', record: existing }
      : { kind: 'conflict', record: existing };
  }

  private async updateRawEvent(
    manager: EntityManager,
    id: string,
    status: RawEventOrmEntity['status'],
    responseStatus: number | null,
    responseBody: unknown,
  ): Promise<void> {
    await manager.save(
      RawEventOrmEntity,
      manager.create(RawEventOrmEntity, { id, status, responseStatus, responseBody }),
    );
  }

  private cachedResponseFrom(record: IdempotencyKeyOrmEntity): GspWalletCachedResponse | null {
    if (
      record.status === IdempotencyStatuses.PROCESSING ||
      !record.responseStatus ||
      !record.responseBody
    ) {
      return null;
    }

    return {
      statusCode: record.responseStatus,
      body: record.responseBody,
    };
  }

  private buildLedgerRequest(input: GspWalletActionStoreInput): Record<string, unknown> {
    return {
      ledgerCommandId: input.ledgerCommandId,
      operation: input.action.operation,
      brandId: input.action.brandId,
      provider: input.provider,
      providerTransactionId: input.action.providerEventId,
      originalProviderTransactionId: input.action.originalProviderEventId,
      roundId: input.action.roundId,
      playerId: input.action.playerId,
      amount: input.action.amount,
      currency: input.action.currency,
    };
  }
}
