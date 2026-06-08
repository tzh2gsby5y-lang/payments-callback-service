import { ProviderCallbackRegistry } from '../../../src/modules/provider-events/application/provider-callback.registry';
import { ProviderIdempotencyService } from '../../../src/modules/provider-events/application/services/provider-idempotency.service';
import { ProviderCallbackAdapter } from '../../../src/shared/provider-events/application/ports/provider-callback-adapter';
import {
  CallbackSource,
  NormalizedCallbackEvent,
} from '../../../src/shared/provider-events/domain/provider-callback-event';
import {
  ProviderIdempotency,
  ProviderIdempotencyStrategy,
} from '../../../src/shared/provider-events/application/services/provider-idempotency.strategy';

describe('Provider event support services', () => {
  it('returns provider adapters case-insensitively while preserving source isolation', () => {
    const stripe = adapter('psp', 'stripe');
    const registry = new ProviderCallbackRegistry([stripe]);

    expect(registry.get('psp', 'STRIPE')).toBe(stripe);
    expect(() => registry.get('gsp', 'stripe')).toThrow(
      expect.objectContaining({
        code: 'UNSUPPORTED_PROVIDER',
        statusCode: 404,
        details: { provider: 'stripe' },
      }),
    );
  });

  it('rejects unsupported provider adapters with a structured domain error', () => {
    const registry = new ProviderCallbackRegistry([]);

    expect(() => registry.get('psp', 'missing')).toThrow(
      expect.objectContaining({
        code: 'UNSUPPORTED_PROVIDER',
        statusCode: 404,
      }),
    );
  });

  it('dispatches idempotency strategies by source and provider case-insensitively', () => {
    const pspStrategy = strategy('psp', 'stripe', {
      key: 'psp-key',
      fingerprintHash: 'psp-hash',
      fingerprintFields: { source: 'psp' },
    });
    const gspStrategy = strategy('gsp', 'stripe', {
      key: 'gsp-key',
      fingerprintHash: 'gsp-hash',
      fingerprintFields: { source: 'gsp' },
    });
    const idempotency = new ProviderIdempotencyService([pspStrategy, gspStrategy]);

    expect(idempotency.build(event({ source: 'psp', provider: 'STRIPE' })).key).toBe('psp-key');
    expect(idempotency.build(event({ source: 'gsp', provider: 'stripe' })).key).toBe('gsp-key');
    expect(pspStrategy.build).toHaveBeenCalledTimes(1);
    expect(gspStrategy.build).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported idempotency strategies with a structured domain error', () => {
    const idempotency = new ProviderIdempotencyService([]);

    expect(() =>
      idempotency.build({
        source: 'psp',
        provider: 'missing',
        brandId: 'brandA',
        providerEventId: 'evt-1',
        eventType: 'payment_intent.succeeded',
        aggregateType: 'payment',
        aggregateId: 'pi-1',
        occurredAt: null,
        amount: null,
        currency: null,
        playerId: null,
        raw: {},
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'UNSUPPORTED_IDEMPOTENCY_STRATEGY',
        statusCode: 500,
        details: { source: 'psp', provider: 'missing' },
      }),
    );
  });
});

function adapter(source: CallbackSource, provider: string): ProviderCallbackAdapter {
  return {
    source,
    provider,
    verifySignature: jest.fn(),
    normalize: jest.fn(),
  };
}

function strategy(
  source: CallbackSource,
  provider: string,
  result: ProviderIdempotency,
): jest.Mocked<ProviderIdempotencyStrategy> {
  return {
    source,
    provider,
    build: jest.fn((_event: NormalizedCallbackEvent) => result),
  };
}

function event(overrides: Partial<NormalizedCallbackEvent> = {}): NormalizedCallbackEvent {
  return {
    source: 'psp',
    provider: 'stripe',
    brandId: 'brandA',
    providerEventId: 'evt-1',
    eventType: 'payment_intent.succeeded',
    aggregateType: 'payment',
    aggregateId: 'pi-1',
    occurredAt: null,
    amount: null,
    currency: null,
    playerId: null,
    raw: {},
    ...overrides,
  };
}
