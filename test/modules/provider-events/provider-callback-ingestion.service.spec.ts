import { ConfigService } from '@nestjs/config';
import { Env } from '../../../src/config/env.schema';
import {
  ProviderEventIngestionStore,
  ProviderEventIngestionStoreInput,
  ProviderEventIngestionStoreResult,
} from '../../../src/modules/provider-events/application/provider-event-ingestion.store';
import { ProviderCallbackRegistry } from '../../../src/modules/provider-events/application/provider-callback.registry';
import { ProviderCallbackIngestionService } from '../../../src/modules/provider-events/application/provider-callback-ingestion.service';
import { ProviderIdempotencyService } from '../../../src/modules/provider-events/application/services/provider-idempotency.service';
import { StripeIdempotencyStrategy } from '../../../src/modules/psp/infrastructure/providers/stripe/stripe-idempotency.strategy';
import { StripePspProvider } from '../../../src/modules/psp/infrastructure/providers/stripe/stripe-psp.provider';
import { StableJsonHasher } from '../../../src/shared/common/stable-json-hasher.service';
import { ProviderCallbackAdapter } from '../../../src/shared/provider-events/application/ports/provider-callback-adapter';

class FakeProviderEventIngestionStore implements ProviderEventIngestionStore {
  calls: ProviderEventIngestionStoreInput[] = [];
  nextResult: ProviderEventIngestionStoreResult = {
    kind: 'accepted',
    statusCode: 202,
    body: {
      status: 'accepted',
      eventId: 'raw-event-1',
      provider: 'stripe',
      source: 'psp',
      idempotencyKey: 'stripe:evt_123',
      handoff: 'pending_evaluation',
      handoffId: 'handoff-1',
    },
  };

  async persist(
    input: ProviderEventIngestionStoreInput,
  ): Promise<ProviderEventIngestionStoreResult> {
    this.calls.push(input);
    return this.nextResult;
  }
}

describe('ProviderCallbackIngestionService', () => {
  function createUseCase(configValues: Partial<Env> = {}) {
    const store = new FakeProviderEventIngestionStore();
    const config = new ConfigService<Env>(configValues);
    const adapter = new StripePspProvider(config);
    const providerIdempotency = new ProviderIdempotencyService([
      new StripeIdempotencyStrategy(new StableJsonHasher()),
    ]);
    const registry = new ProviderCallbackRegistry([adapter]);
    const ingestion = new ProviderCallbackIngestionService(registry, providerIdempotency, store);

    return { ingestion, store };
  }

  const payload = {
    id: 'evt_123',
    type: 'payment_intent.succeeded',
    created: 1_735_689_600,
    data: {
      object: {
        id: 'pi_123',
        amount: 2500,
        currency: 'usd',
        metadata: {
          brandId: 'brandA',
          playerId: 'player-1',
        },
      },
    },
  };

  it('normalizes a valid callback and persists it through the DB-backed ingestion boundary', async () => {
    const { ingestion, store } = createUseCase();

    const result = await ingestion.ingest({
      source: 'psp',
      provider: 'stripe',
      headers: {},
      rawBody: JSON.stringify(payload),
      parsedBody: payload,
    });

    expect(result.statusCode).toBe(202);
    expect(result.body.handoff).toBe('pending_evaluation');
    expect(store.calls).toHaveLength(1);
    const storeCall = store.calls[0];
    if (!storeCall) {
      throw new Error('Expected provider event store call');
    }
    expect(typeof storeCall.requestHash).toBe('string');
    expect(storeCall.requestHash).toHaveLength(64);
    expect(storeCall).toMatchObject({
      source: 'psp',
      provider: 'stripe',
      idempotencyKey: 'stripe:evt_123',
      normalized: {
        brandId: 'brandA',
        providerEventId: 'evt_123',
        aggregateId: 'pi_123',
      },
    });
  });

  it('returns duplicate/processing responses from the persistence boundary without re-normalizing effects', async () => {
    const { ingestion, store } = createUseCase();
    store.nextResult = {
      kind: 'duplicate',
      statusCode: 202,
      body: {
        status: 'processing',
        eventId: 'original-raw-event',
        provider: 'stripe',
        source: 'psp',
        idempotencyKey: 'stripe:evt_123',
        handoff: 'pending_original_claim',
      },
    };

    const result = await ingestion.ingest({
      source: 'psp',
      provider: 'stripe',
      headers: {},
      rawBody: JSON.stringify(payload),
      parsedBody: payload,
    });

    expect(result.statusCode).toBe(202);
    expect(result.body.status).toBe('processing');
    expect(result.body.handoff).toBe('pending_original_claim');
  });

  it('maps idempotency conflicts from the persistence boundary to a structured domain error', async () => {
    const { ingestion, store } = createUseCase();
    store.nextResult = { kind: 'conflict' };

    await expect(
      ingestion.ingest({
        source: 'psp',
        provider: 'stripe',
        headers: {},
        rawBody: JSON.stringify(payload),
        parsedBody: payload,
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_PAYLOAD_MISMATCH', statusCode: 409 });
  });

  it('rejects invalid signatures before the persistence boundary', async () => {
    const { ingestion, store } = createUseCase({
      NODE_ENV: 'production',
      STRIPE_WEBHOOK_SECRET: 'stripe-secret',
    });

    await expect(
      ingestion.ingest({
        source: 'psp',
        provider: 'stripe',
        headers: {},
        rawBody: JSON.stringify(payload),
        parsedBody: payload,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_SIGNATURE', statusCode: 401 });

    expect(store.calls).toHaveLength(0);
  });

  it('fails closed when a PSP adapter returns a non-PSP normalized source', async () => {
    const store = new FakeProviderEventIngestionStore();
    const adapter: jest.Mocked<ProviderCallbackAdapter> = {
      source: 'psp',
      provider: 'stripe',
      verifySignature: jest.fn().mockResolvedValue({ valid: true, mode: 'skipped' }),
      normalize: jest.fn().mockReturnValue({
        source: 'gsp',
        provider: 'stripe',
        brandId: 'brandA',
        providerEventId: 'evt_123',
        eventType: 'payment_intent.succeeded',
        aggregateType: 'payment',
        aggregateId: 'pi_123',
        occurredAt: null,
        amount: '2500',
        currency: 'USD',
        playerId: 'player-1',
        raw: payload,
      }),
    };
    const ingestion = new ProviderCallbackIngestionService(
      new ProviderCallbackRegistry([adapter]),
      new ProviderIdempotencyService([new StripeIdempotencyStrategy(new StableJsonHasher())]),
      store,
    );

    await expect(
      ingestion.ingest({
        source: 'psp',
        provider: 'stripe',
        headers: {},
        rawBody: JSON.stringify(payload),
        parsedBody: payload,
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_SOURCE_MISMATCH',
      statusCode: 500,
    });
    expect(store.calls).toHaveLength(0);
  });
});
