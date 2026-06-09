import request from 'supertest';
import { createHmac } from 'node:crypto';
import { IdempotencyKeyOrmEntity } from '../../src/modules/provider-events/infrastructure/typeorm/entities/idempotency-key.orm-entity';
import { ProviderEventHandoffOrmEntity } from '../../src/modules/provider-events/infrastructure/typeorm/entities/provider-event-handoff.orm-entity';
import { RawEventOrmEntity } from '../../src/modules/provider-events/infrastructure/typeorm/entities/raw-event.orm-entity';
import {
  createTypeOrmTestingApp,
  TypeOrmTestAppContext,
} from '../support/create-typeorm-testing-app';
import { expectSingle } from '../support/array-assertions';

describe('Callback idempotency integration', () => {
  let context: TypeOrmTestAppContext;

  beforeAll(async () => {
    context = await createTypeOrmTestingApp({
      config: {
        STRIPE_WEBHOOK_SECRET: 'stripe-secret',
        STRIPE_SIGNATURE_TOLERANCE_SECONDS: '300',
      },
    });
  }, 120_000);

  beforeEach(async () => {
    await context.resetDatabase();
  });

  afterAll(async () => {
    await context?.close();
  });

  it('persists duplicate callback attempts but claims idempotency once', async () => {
    const payload = {
      id: 'evt_e2e_1',
      type: 'payment_intent.succeeded',
      created: 1_735_689_600,
      data: {
        object: {
          id: 'pi_e2e_1',
          amount: 1200,
          currency: 'eur',
          metadata: {
            brandId: 'brandA',
            playerId: 'player-1',
          },
        },
      },
    };

    const first = await postSignedStripe(context, payload).expect(202);
    const second = await postSignedStripe(context, payload).expect(200);

    expect(first.body.status).toBe('accepted');
    expect(first.body.handoff).toBe('pending_evaluation');
    expect(first.body.handoffId).toBeDefined();
    expect(second.body.status).toBe('duplicate');
    expect(second.body.handoff).toBe('already_pending');
    expect(second.body.handoffId).toBe(first.body.handoffId);

    const rawEvents = await context.dataSource.getRepository(RawEventOrmEntity).find({
      order: { receivedAt: 'ASC' },
    });
    const idempotencyRows = await context.dataSource.getRepository(IdempotencyKeyOrmEntity).find();
    const handoffs = await context.dataSource.getRepository(ProviderEventHandoffOrmEntity).find();

    expect(rawEvents.map((row) => row.status)).toEqual(['ACCEPTED', 'DUPLICATE']);
    expect(idempotencyRows).toHaveLength(1);
    const firstRawEvent = rawEvents[0];
    if (!firstRawEvent) {
      throw new Error('Expected first raw PSP event');
    }
    const handoff = expectSingle(handoffs, 'PSP handoff');
    expect(handoff.rawEventId).toBe(firstRawEvent.id);
    expect(handoff).toMatchObject({
      source: 'psp',
      provider: 'stripe',
      status: 'PENDING_EVALUATION',
      idempotencyKey: 'stripe:evt_e2e_1',
    });
    expect(handoff.payload).toMatchObject({
      mode: 'async_payment_callback',
      rawEventId: firstRawEvent.id,
      providerEventId: 'evt_e2e_1',
      eventType: 'payment_intent.succeeded',
      aggregateType: 'payment',
      aggregateId: 'pi_e2e_1',
      amount: '1200',
      currency: 'EUR',
      playerId: 'player-1',
      occurredAt: new Date(payload.created * 1000).toISOString(),
    });
  });

  it('handles concurrent duplicate PSP callbacks with a single idempotency claim and handoff', async () => {
    const payload = {
      id: 'evt_concurrent_1',
      type: 'payment_intent.succeeded',
      created: 1_735_689_600,
      data: {
        object: {
          id: 'pi_concurrent_1',
          amount: 5000,
          currency: 'usd',
          metadata: {
            brandId: 'brandA',
            playerId: 'player-1',
          },
        },
      },
    };

    const responses = await Promise.all([
      postSignedStripe(context, payload),
      postSignedStripe(context, payload),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 202]);
    expect(responses.map((response) => response.body.status).sort()).toEqual([
      'accepted',
      'duplicate',
    ]);
    expect(await context.dataSource.getRepository(RawEventOrmEntity).count()).toBe(2);
    expect(await context.dataSource.getRepository(IdempotencyKeyOrmEntity).count()).toBe(1);
    expect(await context.dataSource.getRepository(ProviderEventHandoffOrmEntity).count()).toBe(1);
  });

  it('rejects malformed provider payload without creating raw event or idempotency rows', async () => {
    await postSignedStripe(context, {
      id: 'evt_malformed',
      type: 'payment_intent.succeeded',
      data: { object: { amount: 1200 } },
    }).expect(400);

    expect(await context.dataSource.getRepository(RawEventOrmEntity).count()).toBe(0);
    expect(await context.dataSource.getRepository(IdempotencyKeyOrmEntity).count()).toBe(0);
    expect(await context.dataSource.getRepository(ProviderEventHandoffOrmEntity).count()).toBe(0);
  });

  it('verifies a signed Stripe-like callback through the HTTP raw-body path', async () => {
    const rawBody = JSON.stringify({
      id: 'evt_signed_1',
      type: 'payment_intent.succeeded',
      created: 1_735_689_600,
      data: {
        object: {
          id: 'pi_signed_1',
          amount: 1200,
          currency: 'eur',
          metadata: {
            brandId: 'brandA',
            playerId: 'player-1',
          },
        },
      },
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const digest = createHmac('sha256', 'stripe-secret')
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    await request(context.app.getHttpServer())
      .post('/webhooks/psp/stripe')
      .set('content-type', 'application/json')
      .set('stripe-signature', `t=${timestamp},v1=${digest}`)
      .send(rawBody)
      .expect(202);

    await request(context.app.getHttpServer())
      .post('/webhooks/psp/stripe')
      .set('content-type', 'application/json')
      .set('stripe-signature', `t=${timestamp},v1=bad`)
      .send(rawBody)
      .expect(401);

    expect(await context.dataSource.getRepository(RawEventOrmEntity).count()).toBe(1);
    expect(await context.dataSource.getRepository(IdempotencyKeyOrmEntity).count()).toBe(1);
    expect(await context.dataSource.getRepository(ProviderEventHandoffOrmEntity).count()).toBe(1);
  });
});

function postSignedStripe(context: TypeOrmTestAppContext, payload: unknown) {
  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac('sha256', 'stripe-secret')
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  return request(context.app.getHttpServer())
    .post('/webhooks/psp/stripe')
    .set('content-type', 'application/json')
    .set('stripe-signature', `t=${timestamp},v1=${digest}`)
    .send(rawBody);
}
