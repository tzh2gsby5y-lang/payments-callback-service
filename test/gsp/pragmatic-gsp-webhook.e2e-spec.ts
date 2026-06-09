import request from 'supertest';
import { GspWalletIntentOrmEntity } from '../../src/modules/gsp/infrastructure/typeorm/entities/gsp-wallet-intent.orm-entity';
import { IdempotencyKeyOrmEntity } from '../../src/modules/provider-events/infrastructure/typeorm/entities/idempotency-key.orm-entity';
import { ProviderEventHandoffOrmEntity } from '../../src/modules/provider-events/infrastructure/typeorm/entities/provider-event-handoff.orm-entity';
import { RawEventOrmEntity } from '../../src/modules/provider-events/infrastructure/typeorm/entities/raw-event.orm-entity';
import {
  createTypeOrmTestingApp,
  TypeOrmTestAppContext,
} from '../support/create-typeorm-testing-app';
import { expectSingle } from '../support/array-assertions';

describe('GSP callback integration', () => {
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

  it('processes a Pragmatic-like bet synchronously and replays duplicate response', async () => {
    const payload = {
      brandId: 'brandA',
      requestId: 'req-gsp-1',
      transactionId: 'txn-gsp-1',
      roundId: 'round-gsp-1',
      action: 'bet',
      playerId: 'player-1',
      gameId: 'sweet-bonanza',
      amount: '10.00',
      currency: 'EUR',
      timestamp: '2026-06-08T12:00:00.000Z',
    };

    const accepted = await request(context.app.getHttpServer())
      .post('/webhooks/gsp/pragmatic')
      .send(payload)
      .expect(200);
    const duplicate = await request(context.app.getHttpServer())
      .post('/webhooks/gsp/pragmatic')
      .send(payload)
      .expect(200);

    expect(accepted.body).toMatchObject({
      status: 'approved',
      action: 'bet',
      provider: 'pragmatic',
      brandId: 'brandA',
      playerId: 'player-1',
      providerTransactionId: 'txn-gsp-1',
      roundId: 'round-gsp-1',
      balance: '990.00',
      currency: 'EUR',
      idempotencyKey: 'pragmatic:bet:txn-gsp-1',
    });
    expect(duplicate.body).toEqual(accepted.body);

    const rawEvents = await context.dataSource.getRepository(RawEventOrmEntity).find({
      order: { receivedAt: 'ASC' },
    });
    const idempotencyRows = await context.dataSource.getRepository(IdempotencyKeyOrmEntity).find();
    const handoffs = await context.dataSource.getRepository(ProviderEventHandoffOrmEntity).find();
    const intents = await context.dataSource.getRepository(GspWalletIntentOrmEntity).find();

    expect(rawEvents.map((row) => row.status)).toEqual(['COMPLETED', 'DUPLICATE']);
    const idempotencyRow = expectSingle(idempotencyRows, 'GSP idempotency row');
    expect(idempotencyRow).toMatchObject({
      key: 'pragmatic:bet:txn-gsp-1',
      status: 'SUCCEEDED',
      responseStatus: 200,
    });
    expect(handoffs).toHaveLength(0);
    const intent = expectSingle(intents, 'GSP wallet intent');
    expect(intent).toMatchObject({
      status: 'LEDGER_SUCCEEDED',
      providerTransactionId: 'txn-gsp-1',
      ledgerCommandId: 'gsp-wallet:brandA:pragmatic:bet:txn-gsp-1',
      responseStatus: 200,
    });
  });

  it('does not collapse same-round wallet actions when transaction ids differ', async () => {
    const basePayload = {
      brandId: 'brandA',
      roundId: 'round-shared',
      action: 'bet',
      playerId: 'player-1',
      gameId: 'sweet-bonanza',
      amount: '10.00',
      currency: 'EUR',
    };

    await request(context.app.getHttpServer())
      .post('/webhooks/gsp/pragmatic')
      .send({ ...basePayload, transactionId: 'txn-shared-1' })
      .expect(200)
      .expect((response) => {
        expect(response.body.balance).toBe('990.00');
      });
    const second = await request(context.app.getHttpServer())
      .post('/webhooks/gsp/pragmatic')
      .send({ ...basePayload, transactionId: 'txn-shared-2' })
      .expect(200);

    expect(second.body.balance).toBe('980.00');
    const idempotencyRows = await context.dataSource.getRepository(IdempotencyKeyOrmEntity).find({
      order: { key: 'ASC' },
    });
    const intents = await context.dataSource.getRepository(GspWalletIntentOrmEntity).find({
      order: { providerTransactionId: 'ASC' },
    });

    expect(intents.map((intent) => intent.providerTransactionId)).toEqual([
      'txn-shared-1',
      'txn-shared-2',
    ]);
    expect(idempotencyRows.map((row) => row.key)).toEqual([
      'pragmatic:bet:txn-shared-1',
      'pragmatic:bet:txn-shared-2',
    ]);
    expect(await context.dataSource.getRepository(ProviderEventHandoffOrmEntity).count()).toBe(0);
  });

  it('keeps same provider transaction ids isolated per brand', async () => {
    const payload = {
      transactionId: 'txn-shared-across-brands',
      roundId: 'round-brand-isolation',
      action: 'bet',
      playerId: 'player-1',
      amount: '10.00',
      currency: 'EUR',
    };

    const brandA = await request(context.app.getHttpServer())
      .post('/webhooks/gsp/pragmatic')
      .send({ ...payload, brandId: 'brandA' })
      .expect(200);
    const brandB = await request(context.app.getHttpServer())
      .post('/webhooks/gsp/pragmatic')
      .send({ ...payload, brandId: 'brandB' })
      .expect(200);

    expect(brandA.body).toMatchObject({
      brandId: 'brandA',
      balance: '990.00',
      idempotencyKey: 'pragmatic:bet:txn-shared-across-brands',
    });
    expect(brandB.body).toMatchObject({
      brandId: 'brandB',
      balance: '990.00',
      idempotencyKey: 'pragmatic:bet:txn-shared-across-brands',
    });
    expect(brandB.body.walletTransactionId).toContain('gsp-wallet:brandB:');
    expect(brandA.body.walletTransactionId).not.toBe(brandB.body.walletTransactionId);

    const idempotencyRows = await context.dataSource.getRepository(IdempotencyKeyOrmEntity).find({
      order: { brandId: 'ASC' },
    });
    const intents = await context.dataSource.getRepository(GspWalletIntentOrmEntity).find({
      order: { brandId: 'ASC' },
    });

    expect(idempotencyRows.map((row) => row.brandId)).toEqual(['brandA', 'brandB']);
    expect(intents.map((intent) => intent.ledgerCommandId)).toEqual([
      'gsp-wallet:brandA:pragmatic:bet:txn-shared-across-brands',
      'gsp-wallet:brandB:pragmatic:bet:txn-shared-across-brands',
    ]);
    expect(await context.dataSource.getRepository(ProviderEventHandoffOrmEntity).count()).toBe(0);
  });

  it('deduplicates a Pragmatic-like wallet action when retry-only fields change', async () => {
    const payload = {
      brandId: 'brandA',
      reference: 'ref-gsp-1',
      roundId: 'round-gsp-1',
      action: 'bet',
      playerId: 'player-1',
      gameId: 'sweet-bonanza',
      amount: '10.00',
      currency: 'EUR',
      timestamp: '2026-06-08T12:00:00.000Z',
    };

    const accepted = await request(context.app.getHttpServer())
      .post('/webhooks/gsp/pragmatic')
      .send(payload)
      .expect(200);
    const duplicate = await request(context.app.getHttpServer())
      .post('/webhooks/gsp/pragmatic')
      .send({ ...payload, requestId: 'retry-request-2', timestamp: '2026-06-08T12:00:10.000Z' })
      .expect(200);

    expect(duplicate.body).toEqual(accepted.body);
    expect(duplicate.body.idempotencyKey).toBe('pragmatic:bet:ref-gsp-1');
    expect(await context.dataSource.getRepository(IdempotencyKeyOrmEntity).count()).toBe(1);
    expect(await context.dataSource.getRepository(GspWalletIntentOrmEntity).count()).toBe(1);
    expect(await context.dataSource.getRepository(ProviderEventHandoffOrmEntity).count()).toBe(0);
  });

  it('returns structured errors for unknown providers and idempotency conflicts', async () => {
    await request(context.app.getHttpServer())
      .post('/webhooks/gsp/unknown')
      .set('x-request-id', 'test-request-id')
      .send({ brandId: 'brandA' })
      .expect(404)
      .expect((response) => {
        expect(response.body.error.code).toBe('UNSUPPORTED_PROVIDER');
        expect(response.body.error.requestId).toBe('test-request-id');
      });

    expect(await context.dataSource.getRepository(RawEventOrmEntity).count()).toBe(0);
    expect(await context.dataSource.getRepository(IdempotencyKeyOrmEntity).count()).toBe(0);
    expect(await context.dataSource.getRepository(ProviderEventHandoffOrmEntity).count()).toBe(0);

    const payload = {
      brandId: 'brandA',
      transactionId: 'txn-conflict',
      roundId: 'round-conflict',
      action: 'win',
      playerId: 'player-1',
      amount: '5.00',
      currency: 'EUR',
    };

    await request(context.app.getHttpServer())
      .post('/webhooks/gsp/pragmatic')
      .send(payload)
      .expect(200);
    await request(context.app.getHttpServer())
      .post('/webhooks/gsp/pragmatic')
      .send({ ...payload, amount: '7.00' })
      .expect(409)
      .expect((response) => {
        expect(response.body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
      });
    expect(await context.dataSource.getRepository(ProviderEventHandoffOrmEntity).count()).toBe(0);
    expect(
      (
        await context.dataSource.getRepository(RawEventOrmEntity).find({
          order: { receivedAt: 'ASC' },
        })
      ).map((row) => row.status),
    ).toEqual(['COMPLETED', 'CONFLICT']);
  });

  it('returns a persisted declined wallet response for insufficient funds', async () => {
    const payload = {
      brandId: 'brandA',
      transactionId: 'txn-decline',
      roundId: 'round-decline',
      action: 'bet',
      playerId: 'player-1',
      amount: '2000.00',
      currency: 'EUR',
    };

    const declined = await request(context.app.getHttpServer())
      .post('/webhooks/gsp/pragmatic')
      .send(payload)
      .expect(200);
    const duplicate = await request(context.app.getHttpServer())
      .post('/webhooks/gsp/pragmatic')
      .send(payload)
      .expect(200);

    expect(declined.body).toMatchObject({
      status: 'declined',
      action: 'bet',
      balance: '1000.00',
      errorCode: 'INSUFFICIENT_FUNDS',
    });
    expect(duplicate.body).toEqual(declined.body);

    const intents = await context.dataSource.getRepository(GspWalletIntentOrmEntity).find();
    const intent = expectSingle(intents, 'declined GSP wallet intent');
    expect(intent.status).toBe('LEDGER_DECLINED');
    expect(await context.dataSource.getRepository(ProviderEventHandoffOrmEntity).count()).toBe(0);
  });

  it('processes win and rollback wallet actions synchronously', async () => {
    await request(context.app.getHttpServer())
      .post('/webhooks/gsp/pragmatic')
      .send({
        brandId: 'brandA',
        transactionId: 'txn-win',
        roundId: 'round-win',
        action: 'win',
        playerId: 'player-1',
        amount: '15.50',
        currency: 'EUR',
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.balance).toBe('1015.50');
      });

    const rollback = await request(context.app.getHttpServer())
      .post('/webhooks/gsp/pragmatic')
      .send({
        brandId: 'brandA',
        transactionId: 'txn-rollback',
        originalTransactionId: 'txn-win',
        roundId: 'round-win',
        action: 'rollback',
        playerId: 'player-1',
        currency: 'EUR',
      })
      .expect(200);
    const duplicateRollback = await request(context.app.getHttpServer())
      .post('/webhooks/gsp/pragmatic')
      .send({
        brandId: 'brandA',
        transactionId: 'txn-rollback',
        originalTransactionId: 'txn-win',
        roundId: 'round-win',
        action: 'rollback',
        playerId: 'player-1',
        currency: 'EUR',
      })
      .expect(200);

    expect(rollback.body).toMatchObject({
      status: 'approved',
      action: 'rollback',
      balance: '1000.00',
    });
    expect(duplicateRollback.body).toEqual(rollback.body);
    expect(await context.dataSource.getRepository(GspWalletIntentOrmEntity).count()).toBe(2);
    expect(await context.dataSource.getRepository(ProviderEventHandoffOrmEntity).count()).toBe(0);
  });
});
