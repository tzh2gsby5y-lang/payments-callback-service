import { ConfigService } from '@nestjs/config';
import { Env } from '../../src/config/env.schema';
import { PragmaticGspProvider } from '../../src/modules/gsp/infrastructure/providers/pragmatic/pragmatic-gsp.provider';
import { StripePspProvider } from '../../src/modules/psp/infrastructure/providers/stripe/stripe-psp.provider';

const config = new ConfigService<Env>({});

describe('Provider normalization contracts', () => {
  it('normalizes Stripe-like PSP payloads into the common provider-event envelope', () => {
    const provider = new StripePspProvider(config);

    const event = provider.normalize({
      source: 'psp',
      provider: 'stripe',
      headers: {},
      rawBody: '{}',
      parsedBody: {
        id: 'evt_norm_1',
        type: 'payment_intent.succeeded',
        created: 1_735_689_600,
        data: {
          object: {
            id: 'pi_norm_1',
            amount: 4200,
            currency: 'usd',
            metadata: {
              brandId: 'brandA',
              playerId: 'player-1',
            },
          },
        },
      },
      receivedAt: new Date(),
    });

    expect(event).toMatchObject({
      source: 'psp',
      provider: 'stripe',
      brandId: 'brandA',
      providerEventId: 'evt_norm_1',
      eventType: 'payment_intent.succeeded',
      aggregateType: 'payment',
      aggregateId: 'pi_norm_1',
      amount: '4200',
      currency: 'USD',
      playerId: 'player-1',
    });
  });

  it('rejects Stripe-like payloads missing required event or tenant fields', () => {
    const provider = new StripePspProvider(config);

    expect(() =>
      provider.normalize({
        source: 'psp',
        provider: 'stripe',
        headers: {},
        rawBody: '{}',
        parsedBody: {
          id: 'evt_bad',
          type: 'payment_intent.succeeded',
          data: { object: { id: 'pi_bad' } },
        },
        receivedAt: new Date(),
      }),
    ).toThrow('Stripe callback is missing required fields');
  });

  it('prefers top-level Stripe brandId and normalizes optional fields defensively', () => {
    const provider = new StripePspProvider(config);

    const event = provider.normalize({
      source: 'psp',
      provider: 'stripe',
      headers: {},
      rawBody: '{}',
      parsedBody: {
        id: 'evt_optional',
        brandId: 'brandTop',
        type: 'payment_intent.succeeded',
        created: 'not-a-number',
        data: {
          object: {
            id: 'pi_optional',
            amount: '4200',
            currency: 'gbp',
            metadata: {
              brandId: 'brandMeta',
            },
          },
        },
      },
      receivedAt: new Date(),
    });

    expect(event).toMatchObject({
      brandId: 'brandTop',
      occurredAt: null,
      amount: '4200',
      currency: 'GBP',
      playerId: null,
    });
  });

  it('normalizes Stripe payloads without optional timestamp, currency, amount, or player metadata', () => {
    const provider = new StripePspProvider(config);

    const event = provider.normalize({
      source: 'psp',
      provider: 'stripe',
      headers: {},
      rawBody: '{}',
      parsedBody: {
        id: 'evt_no_optional',
        type: 'payment_intent.created',
        brandId: 'brandA',
        data: {
          object: {
            id: 'pi_no_optional',
            metadata: {},
          },
        },
      },
      receivedAt: new Date(),
    });

    expect(event).toMatchObject({
      occurredAt: null,
      amount: null,
      currency: null,
      playerId: null,
    });
  });

  it('normalizes Pragmatic-like GSP wallet payloads and prefers reference for providerEventId', () => {
    const provider = new PragmaticGspProvider(config);

    const event = provider.normalizeWalletAction({
      source: 'gsp',
      provider: 'pragmatic',
      headers: {},
      rawBody: '{}',
      parsedBody: {
        brandId: 'brandA',
        reference: 'ref-1',
        transactionId: 'txn-1',
        roundId: 'round-1',
        action: 'bet',
        playerId: 'player-1',
        amount: '10.00',
        currency: 'eur',
        timestamp: '2026-06-08T12:00:00.000Z',
      },
      receivedAt: new Date(),
    });

    expect(event).toMatchObject({
      source: 'gsp',
      provider: 'pragmatic',
      brandId: 'brandA',
      providerEventId: 'ref-1',
      operation: 'bet',
      roundId: 'round-1',
      aggregateId: 'round-1',
      amount: '10.00',
      currency: 'EUR',
      playerId: 'player-1',
    });
  });

  it('rejects Pragmatic-like payloads without action, tenant, player, or event identity', () => {
    const provider = new PragmaticGspProvider(config);

    expect(() =>
      provider.normalizeWalletAction({
        source: 'gsp',
        provider: 'pragmatic',
        headers: {},
        rawBody: '{}',
        parsedBody: {
          brandId: 'brandA',
          playerId: 'player-1',
        },
        receivedAt: new Date(),
      }),
    ).toThrow('Pragmatic wallet callback is missing required fields');
  });

  it('rejects Pragmatic-like wallet amounts that are not positive money values', () => {
    const provider = new PragmaticGspProvider(config);

    for (const amount of ['-1.00', '0', '1.001']) {
      expect(() =>
        provider.normalizeWalletAction({
          source: 'gsp',
          provider: 'pragmatic',
          headers: {},
          rawBody: '{}',
          parsedBody: {
            brandId: 'brandA',
            transactionId: `txn-${amount}`,
            action: 'bet',
            playerId: 'player-1',
            amount,
            currency: 'EUR',
          },
          receivedAt: new Date(),
        }),
      ).toThrow('Pragmatic wallet mutation amount must be a positive decimal value');
    }
  });

  it('normalizes Pragmatic fallback fields for type, txId, and userId', () => {
    const provider = new PragmaticGspProvider(config);

    const event = provider.normalizeWalletAction({
      source: 'gsp',
      provider: 'pragmatic',
      headers: {},
      rawBody: '{}',
      parsedBody: {
        brandId: 'brandA',
        type: 'win',
        txId: 'tx-2',
        userId: 'player-2',
        amount: 5,
        currency: 'eur',
      },
      receivedAt: new Date(),
    });

    expect(event).toMatchObject({
      providerEventId: 'tx-2',
      operation: 'win',
      aggregateId: 'tx-2',
      playerId: 'player-2',
      amount: '5',
      currency: 'EUR',
    });
  });

  it('builds Pragmatic provider event ids from round/request fallbacks', () => {
    const provider = new PragmaticGspProvider(config);

    const withRequest = provider.normalizeWalletAction({
      source: 'gsp',
      provider: 'pragmatic',
      headers: {},
      rawBody: '{}',
      parsedBody: {
        brandId: 'brandA',
        action: 'bet',
        roundId: 'round-1',
        requestId: 'req-1',
        playerId: 'player-1',
        amount: '10.00',
        currency: 'EUR',
      },
      receivedAt: new Date(),
    });
    const noRequest = provider.normalizeWalletAction({
      source: 'gsp',
      provider: 'pragmatic',
      headers: {},
      rawBody: '{}',
      parsedBody: {
        brandId: 'brandA',
        action: 'bet',
        roundId: 'round-1',
        playerId: 'player-1',
        amount: '10.00',
        currency: 'EUR',
      },
      receivedAt: new Date(),
    });

    expect(withRequest.providerEventId).toBe('round-1:bet:req-1');
    expect(withRequest.aggregateId).toBe('round-1');
    expect(noRequest.providerEventId).toBe('round-1:bet:no-request');
  });

  it('builds a readable Pragmatic request-only identity without null or undefined fragments', () => {
    const provider = new PragmaticGspProvider(config);

    const event = provider.normalizeWalletAction({
      source: 'gsp',
      provider: 'pragmatic',
      headers: {},
      rawBody: '{}',
      parsedBody: {
        brandId: 'brandA',
        type: 'balance',
        userId: 'player-user',
        requestId: 'request-1',
      },
      receivedAt: new Date(),
    });

    expect(event).toMatchObject({
      operation: 'balance',
      aggregateId: 'request-1',
      providerEventId: 'request-1:balance',
      playerId: 'player-user',
      occurredAt: null,
      currency: 'EUR',
    });
  });

  it('normalizes Pragmatic rollback original transaction identity', () => {
    const provider = new PragmaticGspProvider(config);

    const event = provider.normalizeWalletAction({
      source: 'gsp',
      provider: 'pragmatic',
      headers: {},
      rawBody: '{}',
      parsedBody: {
        brandId: 'brandA',
        action: 'rollback',
        transactionId: 'rollback-1',
        originalTransactionId: 'bet-1',
        roundId: 'round-1',
        playerId: 'player-1',
        currency: 'EUR',
      },
      receivedAt: new Date(),
    });

    expect(event).toMatchObject({
      operation: 'rollback',
      providerEventId: 'rollback-1',
      originalProviderEventId: 'bet-1',
      roundId: 'round-1',
      amount: null,
      currency: 'EUR',
    });
  });

  it('rejects Pragmatic wallet mutations without amount or currency', () => {
    const provider = new PragmaticGspProvider(config);

    expect(() =>
      provider.normalizeWalletAction({
        source: 'gsp',
        provider: 'pragmatic',
        headers: {},
        rawBody: '{}',
        parsedBody: {
          brandId: 'brandA',
          action: 'bet',
          transactionId: 'txn-missing-amount',
          playerId: 'player-1',
        },
        receivedAt: new Date(),
      }),
    ).toThrow('Pragmatic wallet mutation is missing amount or currency');
  });
});
