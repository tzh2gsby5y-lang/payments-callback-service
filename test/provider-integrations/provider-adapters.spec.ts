import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { Env } from '../../src/config/env.schema';
import { StripePspProvider } from '../../src/modules/psp/infrastructure/providers/stripe/stripe-psp.provider';
import { PragmaticGspProvider } from '../../src/modules/gsp/infrastructure/providers/pragmatic/pragmatic-gsp.provider';

function config(values: Partial<Env>): ConfigService<Env> {
  const configService = new ConfigService<Env>(values);
  jest.spyOn(configService, 'get').mockImplementation((propertyPath: keyof Env) => {
    return values[propertyPath];
  });
  return configService;
}

describe('Provider callback adapters', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('skips provider signature verification in non-production when secrets are intentionally absent', async () => {
    const stripe = new StripePspProvider(config({ NODE_ENV: 'test', STRIPE_WEBHOOK_SECRET: '' }));
    const pragmatic = new PragmaticGspProvider(
      config({ NODE_ENV: 'test', PRAGMATIC_WEBHOOK_SECRET: '' }),
    );

    await expect(callbackVerification(stripe, 'psp', 'stripe')).resolves.toMatchObject({
      valid: true,
      mode: 'skipped',
    });
    await expect(callbackVerification(pragmatic, 'gsp', 'pragmatic')).resolves.toMatchObject({
      valid: true,
      mode: 'skipped',
    });
  });

  it('verifies Stripe-like HMAC using the raw body and timestamp tolerance', async () => {
    const adapter = new StripePspProvider(
      config({
        NODE_ENV: 'test',
        STRIPE_WEBHOOK_SECRET: 'stripe-secret',
        STRIPE_SIGNATURE_TOLERANCE_SECONDS: 300,
      }),
    );
    const rawBody = '{"id":"evt_signature","type":"payment_intent.succeeded"}';
    const timestamp = Math.floor(Date.now() / 1000);
    const digest = createHmac('sha256', 'stripe-secret')
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    await expect(
      adapter.verifySignature({
        source: 'psp',
        provider: 'stripe',
        headers: { 'stripe-signature': `t=${timestamp},v1=${digest}` },
        rawBody,
        parsedBody: {},
        receivedAt: new Date(),
      }),
    ).resolves.toMatchObject({ valid: true, mode: 'verified' });

    await expect(
      adapter.verifySignature({
        source: 'psp',
        provider: 'stripe',
        headers: { 'stripe-signature': `t=${timestamp - 1000},v1=${digest}` },
        rawBody,
        parsedBody: {},
        receivedAt: new Date(),
      }),
    ).resolves.toMatchObject({ valid: false, reason: 'stale_stripe_signature' });
  });

  it('rejects missing, malformed, and stale Stripe signatures without throwing', async () => {
    const adapter = new StripePspProvider(
      config({
        NODE_ENV: 'test',
        STRIPE_WEBHOOK_SECRET: 'stripe-secret',
        STRIPE_SIGNATURE_TOLERANCE_SECONDS: 300,
      }),
    );
    const rawBody = '{"id":"evt_signature","type":"payment_intent.succeeded"}';
    const timestamp = Math.floor(Date.now() / 1000);
    const digest = createHmac('sha256', 'stripe-secret')
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    await expect(stripeVerification(adapter, rawBody, {})).resolves.toMatchObject({
      valid: false,
      reason: 'missing_stripe_signature',
    });
    await expect(
      stripeVerification(adapter, rawBody, { 'stripe-signature': `v1=${digest}` }),
    ).resolves.toMatchObject({ valid: false, reason: 'malformed_stripe_signature' });
    await expect(
      stripeVerification(adapter, rawBody, { 'stripe-signature': `t=${timestamp}` }),
    ).resolves.toMatchObject({ valid: false, reason: 'malformed_stripe_signature' });
    await expect(
      stripeVerification(adapter, rawBody, {
        'stripe-signature': `t=not-a-number,v1=${digest}`,
      }),
    ).resolves.toMatchObject({ valid: false, reason: 'stale_stripe_signature' });
  });

  it('accepts Stripe signatures exactly at tolerance and rejects tolerance plus one second', async () => {
    jest.useFakeTimers().setSystemTime(new Date(1_800_000_000_000));
    const adapter = new StripePspProvider(
      config({
        NODE_ENV: 'test',
        STRIPE_WEBHOOK_SECRET: 'stripe-secret',
        STRIPE_SIGNATURE_TOLERANCE_SECONDS: 300,
      }),
    );
    const rawBody = '{"id":"evt_boundary"}';
    const nowSeconds = Math.floor(Date.now() / 1000);
    const boundaryTimestamp = nowSeconds - 300;
    const staleTimestamp = nowSeconds - 301;
    const boundaryDigest = createHmac('sha256', 'stripe-secret')
      .update(`${boundaryTimestamp}.${rawBody}`)
      .digest('hex');
    const staleDigest = createHmac('sha256', 'stripe-secret')
      .update(`${staleTimestamp}.${rawBody}`)
      .digest('hex');

    await expect(
      stripeVerification(adapter, rawBody, {
        'Stripe-Signature': [`t=${boundaryTimestamp},v1=${boundaryDigest}`, 'ignored'],
      }),
    ).resolves.toMatchObject({ valid: true, mode: 'verified' });
    await expect(
      stripeVerification(adapter, rawBody, {
        'stripe-signature': `t=${staleTimestamp},v1=${staleDigest}`,
      }),
    ).resolves.toMatchObject({ valid: false, reason: 'stale_stripe_signature' });
  });

  it('binds Stripe HMAC to the exact raw body bytes, not the parsed payload', async () => {
    const adapter = new StripePspProvider(
      config({
        NODE_ENV: 'test',
        STRIPE_WEBHOOK_SECRET: 'stripe-secret',
        STRIPE_SIGNATURE_TOLERANCE_SECONDS: 300,
      }),
    );
    const originalRaw = '{"id":"evt_raw","amount":1}';
    const alteredRaw = '{ "amount": 1, "id": "evt_raw" }';
    const timestamp = Math.floor(Date.now() / 1000);
    const digest = createHmac('sha256', 'stripe-secret')
      .update(`${timestamp}.${originalRaw}`)
      .digest('hex');

    await expect(
      stripeVerification(adapter, originalRaw, {
        'stripe-signature': `t=${timestamp},v1=${digest}`,
      }),
    ).resolves.toMatchObject({ valid: true });
    await expect(
      stripeVerification(adapter, alteredRaw, {
        'stripe-signature': `t=${timestamp},v1=${digest}`,
      }),
    ).resolves.toMatchObject({ valid: false, reason: 'hmac_mismatch' });
  });

  it('uses Stripe default signature tolerance when config omits an override', async () => {
    const adapter = new StripePspProvider(
      config({
        NODE_ENV: 'test',
        STRIPE_WEBHOOK_SECRET: 'stripe-secret',
      }),
    );
    const rawBody = '{}';
    const timestamp = Math.floor(Date.now() / 1000);

    await expect(
      stripeVerification(adapter, rawBody, {
        'stripe-signature': `t=${timestamp},v1=${'0'.repeat(64)}`,
      }),
    ).resolves.toEqual({
      valid: false,
      mode: 'failed',
      reason: 'hmac_mismatch',
    });
  });

  it('fails closed for missing provider secrets in production', async () => {
    const stripe = new StripePspProvider(
      config({ NODE_ENV: 'production', STRIPE_WEBHOOK_SECRET: '' }),
    );
    const pragmatic = new PragmaticGspProvider(
      config({ NODE_ENV: 'production', PRAGMATIC_WEBHOOK_SECRET: '' }),
    );

    await expect(
      stripe.verifySignature({
        source: 'psp',
        provider: 'stripe',
        headers: {},
        rawBody: '{}',
        parsedBody: {},
        receivedAt: new Date(),
      }),
    ).resolves.toMatchObject({ valid: false, reason: 'missing_stripe_secret' });

    await expect(
      pragmatic.verifySignature({
        source: 'gsp',
        provider: 'pragmatic',
        headers: {},
        rawBody: '{}',
        parsedBody: {},
        receivedAt: new Date(),
      }),
    ).resolves.toMatchObject({ valid: false, reason: 'missing_pragmatic_secret' });
  });

  it('verifies Pragmatic-like HMAC when a secret is configured', async () => {
    const adapter = new PragmaticGspProvider(
      config({
        NODE_ENV: 'test',
        PRAGMATIC_WEBHOOK_SECRET: 'pragmatic-secret',
      }),
    );
    const rawBody = '{"transactionId":"txn_signature","action":"bet"}';
    const digest = createHmac('sha256', 'pragmatic-secret').update(rawBody).digest('hex');

    await expect(
      adapter.verifySignature({
        source: 'gsp',
        provider: 'pragmatic',
        headers: { 'x-pragmatic-signature': digest },
        rawBody,
        parsedBody: {},
        receivedAt: new Date(),
      }),
    ).resolves.toMatchObject({ valid: true, mode: 'verified' });

    await expect(
      adapter.verifySignature({
        source: 'gsp',
        provider: 'pragmatic',
        headers: { 'x-pragmatic-signature': 'bad' },
        rawBody,
        parsedBody: {},
        receivedAt: new Date(),
      }),
    ).resolves.toMatchObject({ valid: false, reason: 'hmac_mismatch' });
  });

  it('rejects missing Pragmatic signatures and supports x-signature fallback', async () => {
    const adapter = new PragmaticGspProvider(
      config({
        NODE_ENV: 'test',
        PRAGMATIC_WEBHOOK_SECRET: 'pragmatic-secret',
      }),
    );
    const rawBody = '{"transactionId":"txn_signature","action":"bet"}';
    const digest = createHmac('sha256', 'pragmatic-secret').update(rawBody).digest('hex');

    await expect(
      adapter.verifySignature({
        source: 'gsp',
        provider: 'pragmatic',
        headers: {},
        rawBody,
        parsedBody: {},
        receivedAt: new Date(),
      }),
    ).resolves.toMatchObject({
      valid: false,
      reason: 'missing_pragmatic_signature',
    });
    await expect(
      adapter.verifySignature({
        source: 'gsp',
        provider: 'pragmatic',
        headers: { 'x-signature': digest },
        rawBody,
        parsedBody: {},
        receivedAt: new Date(),
      }),
    ).resolves.toMatchObject({ valid: true, mode: 'verified' });
    await expect(
      adapter.verifySignature({
        source: 'gsp',
        provider: 'pragmatic',
        headers: { 'x-pragmatic-signature': 'not-hex' },
        rawBody,
        parsedBody: {},
        receivedAt: new Date(),
      }),
    ).resolves.toMatchObject({ valid: false, reason: 'hmac_mismatch' });
  });
});

function callbackVerification(
  adapter: StripePspProvider | PragmaticGspProvider,
  source: 'psp' | 'gsp',
  provider: string,
) {
  return adapter.verifySignature({
    source,
    provider,
    headers: {},
    rawBody: '{}',
    parsedBody: {},
    receivedAt: new Date(),
  });
}

function stripeVerification(
  adapter: StripePspProvider,
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
) {
  return adapter.verifySignature({
    source: 'psp',
    provider: 'stripe',
    headers,
    rawBody,
    parsedBody: {},
    receivedAt: new Date(),
  });
}
