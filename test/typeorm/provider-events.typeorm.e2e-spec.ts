import request from 'supertest';
import { IdempotencyKeyOrmEntity } from '../../src/modules/provider-events/infrastructure/typeorm/entities/idempotency-key.orm-entity';
import { ProviderEventHandoffOrmEntity } from '../../src/modules/provider-events/infrastructure/typeorm/entities/provider-event-handoff.orm-entity';
import { RawEventOrmEntity } from '../../src/modules/provider-events/infrastructure/typeorm/entities/raw-event.orm-entity';
import {
  createTypeOrmTestingApp,
  TypeOrmTestAppContext,
} from '../support/create-typeorm-testing-app';
import { expectSingle } from '../support/array-assertions';

describe('Provider events TypeORM/Postgres integration', () => {
  let context: TypeOrmTestAppContext;

  beforeAll(async () => {
    context = await createTypeOrmTestingApp();
  }, 120_000);

  beforeEach(async () => {
    await context.resetDatabase();
  });

  afterAll(async () => {
    await context?.close();
  });

  it('deduplicates PSP callbacks through the Postgres idempotency unique constraint', async () => {
    const payload = stripePayload('evt_typeorm_1', 'brandA');

    const accepted = await request(context.app.getHttpServer())
      .post('/webhooks/psp/stripe')
      .send(payload)
      .expect(202);
    const duplicate = await request(context.app.getHttpServer())
      .post('/webhooks/psp/stripe')
      .send(payload)
      .expect(200);

    const rawEvents = await context.dataSource.getRepository(RawEventOrmEntity).find({
      order: { receivedAt: 'ASC' },
    });
    const idempotencyRows = await context.dataSource.getRepository(IdempotencyKeyOrmEntity).find();
    const handoffs = await context.dataSource.getRepository(ProviderEventHandoffOrmEntity).find();

    expect(duplicate.body.status).toBe('duplicate');
    expect(duplicate.body.handoff).toBe('already_pending');
    expect(duplicate.body.handoffId).toBe(accepted.body.handoffId);
    expect(rawEvents.map((event) => event.status)).toEqual(['ACCEPTED', 'DUPLICATE']);
    const idempotencyRow = expectSingle(idempotencyRows, 'PSP idempotency row');
    expect(idempotencyRow.key).toBe('stripe:evt_typeorm_1');
    expect(idempotencyRow.status).toBe('SUCCEEDED');
    const firstRawEvent = rawEvents[0];
    if (!firstRawEvent) {
      throw new Error('Expected first TypeORM raw event');
    }
    const handoff = expectSingle(handoffs, 'PSP handoff');
    expect(handoff).toMatchObject({
      source: 'psp',
      provider: 'stripe',
      status: 'PENDING_EVALUATION',
      idempotencyKey: 'stripe:evt_typeorm_1',
      rawEventId: firstRawEvent.id,
    });
  });

  it('rejects same PSP provider key with different semantic payload in Postgres', async () => {
    const payload = stripePayload('evt_typeorm_conflict', 'brandA');

    await request(context.app.getHttpServer())
      .post('/webhooks/psp/stripe')
      .send(payload)
      .expect(202);
    await request(context.app.getHttpServer())
      .post('/webhooks/psp/stripe')
      .send({ ...payload, type: 'payment_intent.payment_failed' })
      .expect(409)
      .expect((response) => {
        expect(response.body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
      });

    const rawEvents = await context.dataSource.getRepository(RawEventOrmEntity).find({
      order: { receivedAt: 'ASC' },
    });
    const idempotencyRows = await context.dataSource.getRepository(IdempotencyKeyOrmEntity).find();
    const handoffs = await context.dataSource.getRepository(ProviderEventHandoffOrmEntity).find();

    expect(rawEvents.map((event) => event.status)).toEqual(['ACCEPTED', 'CONFLICT']);
    expect(rawEvents.map((event) => event.responseStatus)).toEqual([202, 409]);
    expect(expectSingle(idempotencyRows, 'conflict idempotency row').status).toBe('SUCCEEDED');
    expect(handoffs).toHaveLength(1);
  });

  it('scopes identical provider idempotency keys by brandId in Postgres', async () => {
    await request(context.app.getHttpServer())
      .post('/webhooks/psp/stripe')
      .send(stripePayload('evt_same_provider_key', 'brandA'))
      .expect(202);
    await request(context.app.getHttpServer())
      .post('/webhooks/psp/stripe')
      .send(stripePayload('evt_same_provider_key', 'brandB'))
      .expect(202);

    const rawCount = await context.dataSource.getRepository(RawEventOrmEntity).count();
    const idempotencyRows = await context.dataSource.getRepository(IdempotencyKeyOrmEntity).find({
      order: { brandId: 'ASC' },
    });
    const handoffs = await context.dataSource.getRepository(ProviderEventHandoffOrmEntity).find({
      order: { brandId: 'ASC' },
    });

    expect(rawCount).toBe(2);
    expect(idempotencyRows).toHaveLength(2);
    expect(idempotencyRows.map((row) => row.brandId)).toEqual(['brandA', 'brandB']);
    expect(handoffs).toHaveLength(2);
    expect(handoffs.map((row) => row.brandId)).toEqual(['brandA', 'brandB']);
  });
});

function stripePayload(eventId: string, brandId: string) {
  return {
    id: eventId,
    type: 'payment_intent.succeeded',
    created: 1_735_689_600,
    data: {
      object: {
        id: `pi_${brandId}`,
        amount: 2500,
        currency: 'usd',
        metadata: {
          brandId,
          playerId: `player-${brandId}`,
        },
      },
    },
  };
}
