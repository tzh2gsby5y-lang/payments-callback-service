import { StripeIdempotencyStrategy } from '../../src/modules/psp/infrastructure/providers/stripe/stripe-idempotency.strategy';
import { StableJsonHasher } from '../../src/shared/common/stable-json-hasher.service';
import { BaseProviderIdempotencyStrategy } from '../../src/shared/provider-events/application/services/provider-idempotency.strategy';
import { NormalizedCallbackEvent } from '../../src/shared/provider-events/domain/provider-callback-event';

describe('provider idempotency strategy contracts', () => {
  const hasher = new StableJsonHasher();

  it('builds Stripe keys from provider event id and fingerprints stable semantic fields only', () => {
    const strategy = new StripeIdempotencyStrategy(hasher);
    const base = pspEvent();

    const result = strategy.build(base);
    const retryOnly = strategy.build({
      ...base,
      brandId: 'brandB',
      occurredAt: new Date('2026-06-08T10:00:00Z'),
      raw: { retry: 2 },
    });
    const amountChanged = strategy.build({ ...base, amount: '2600' });

    expect(result.key).toBe('stripe:evt_1');
    expect(result.fingerprintFields).toEqual({
      provider: 'stripe',
      providerEventId: 'evt_1',
      eventType: 'payment_intent.succeeded',
      aggregateType: 'payment',
      aggregateId: 'pi_1',
      amount: '2500',
      currency: 'USD',
      playerId: 'player-1',
    });
    expect(retryOnly.key).toBe(result.key);
    expect(retryOnly.fingerprintHash).toBe(result.fingerprintHash);
    expect(amountChanged.key).toBe(result.key);
    expect(amountChanged.fingerprintHash).not.toBe(result.fingerprintHash);
  });

  it.each([
    ['eventType', { eventType: 'payment_intent.payment_failed' }],
    ['aggregateId', { aggregateId: 'pi_2' }],
    ['currency', { currency: 'EUR' }],
    ['playerId', { playerId: 'player-2' }],
  ] as const)('changes Stripe fingerprint when %s changes', (_field, patch) => {
    const strategy = new StripeIdempotencyStrategy(hasher);
    const base = strategy.build(pspEvent());
    const changed = strategy.build({ ...pspEvent(), ...patch });

    expect(changed.key).toBe(base.key);
    expect(changed.fingerprintHash).not.toBe(base.fingerprintHash);
  });

  it('builds fallback idempotency keys when a provider-native key is unavailable', () => {
    class TestStrategy extends BaseProviderIdempotencyStrategy {
      readonly source = 'psp' as const;
      readonly provider = 'test';

      build(event: NormalizedCallbackEvent) {
        return this.buildResult(null, ['fallback', event.eventType, event.aggregateId], {
          provider: event.provider,
        });
      }
    }

    const result = new TestStrategy(hasher).build(pspEvent());

    expect(result.key).toBe('fallback:payment_intent.succeeded:pi_1');
    expect(result.fingerprintFields).toEqual({ provider: 'stripe' });
  });
});

function pspEvent(patch: Partial<NormalizedCallbackEvent> = {}): NormalizedCallbackEvent {
  return {
    source: 'psp',
    provider: 'stripe',
    brandId: 'brandA',
    providerEventId: 'evt_1',
    eventType: 'payment_intent.succeeded',
    aggregateType: 'payment',
    aggregateId: 'pi_1',
    occurredAt: new Date('2026-06-08T10:00:00Z'),
    amount: '2500',
    currency: 'USD',
    playerId: 'player-1',
    raw: { id: 'evt_1' },
    ...patch,
  };
}
