import { DataSource, EntityManager } from 'typeorm';
import { TypeOrmGspWalletActionStore } from '../../src/modules/gsp/infrastructure/typeorm/typeorm-gsp-wallet-action.store';
import { GspWalletActionStoreInput } from '../../src/modules/gsp/application/gsp-wallet-action.store';
import { GspWalletIntentOrmEntity } from '../../src/modules/gsp/infrastructure/typeorm/entities/gsp-wallet-intent.orm-entity';
import { IdempotencyKeyOrmEntity } from '../../src/modules/provider-events/infrastructure/typeorm/entities/idempotency-key.orm-entity';
import { RawEventOrmEntity } from '../../src/modules/provider-events/infrastructure/typeorm/entities/raw-event.orm-entity';

describe('TypeOrmGspWalletActionStore', () => {
  it('creates raw event, idempotency claim, and wallet intent in one begin transaction', async () => {
    const { store, manager, qb } = createStore();
    qb.execute.mockResolvedValue({ identifiers: [{ id: 'idem-1' }], raw: [] });
    manager.findOneOrFail.mockResolvedValue(idempotencyRecord({ id: 'idem-1' }));

    const result = await store.begin(input());

    expect(result).toMatchObject({
      kind: 'new',
      intent: {
        id: 'intent-1',
        rawEventId: 'raw-1',
        idempotencyKeyId: 'idem-1',
        ledgerCommandId: 'gsp-wallet:brandA:pragmatic:bet:txn-1',
      },
    });
    expect(qb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brandA',
        source: 'gsp',
        provider: 'pragmatic',
        key: 'pragmatic:bet:txn-1',
        status: 'PROCESSING',
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      GspWalletIntentOrmEntity,
      expect.objectContaining({
        rawEventId: 'raw-1',
        idempotencyKeyId: 'idem-1',
        status: 'LEDGER_IN_FLIGHT',
        ledgerRequest: expect.objectContaining({
          ledgerCommandId: 'gsp-wallet:brandA:pragmatic:bet:txn-1',
          providerTransactionId: 'txn-1',
        }),
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      RawEventOrmEntity,
      expect.objectContaining({ id: 'raw-1', status: 'ACCEPTED' }),
    );
  });

  it('accepts inserted ids returned in raw insert output', async () => {
    const { store, manager, qb } = createStore();
    qb.execute.mockResolvedValue({ identifiers: [], raw: [{ id: 'idem-raw' }] });
    manager.findOneOrFail.mockResolvedValue(idempotencyRecord({ id: 'idem-raw' }));

    await expect(store.begin(input())).resolves.toMatchObject({
      kind: 'new',
      intent: { idempotencyKeyId: 'idem-raw' },
    });
  });

  it('returns cached duplicate wallet responses without creating another intent', async () => {
    const { store, manager, qb } = createStore();
    qb.execute.mockResolvedValue({ identifiers: [], raw: [] });
    manager.findOneOrFail.mockResolvedValue(
      idempotencyRecord({
        status: 'SUCCEEDED',
        responseStatus: 200,
        responseBody: { status: 'approved', balance: '990.00' },
      }),
    );

    const result = await store.begin(input());

    expect(result).toEqual({
      kind: 'duplicate_completed',
      response: { statusCode: 200, body: { status: 'approved', balance: '990.00' } },
    });
    expect(manager.save.mock.calls.some(([entity]) => entity === GspWalletIntentOrmEntity)).toBe(
      false,
    );
    expect(manager.save).toHaveBeenCalledWith(
      RawEventOrmEntity,
      expect.objectContaining({
        id: 'raw-1',
        status: 'DUPLICATE',
        responseStatus: 200,
      }),
    );
  });

  it('replays retryable failure responses instead of leaving duplicates pending forever', async () => {
    const { store, manager, qb } = createStore();
    qb.execute.mockResolvedValue({ identifiers: [], raw: [] });
    manager.findOneOrFail.mockResolvedValue(
      idempotencyRecord({
        status: 'FAILED_RETRYABLE',
        responseStatus: 503,
        responseBody: { error: { code: 'GSP_LEDGER_UNAVAILABLE' } },
      }),
    );

    await expect(store.begin(input())).resolves.toEqual({
      kind: 'duplicate_completed',
      response: { statusCode: 503, body: { error: { code: 'GSP_LEDGER_UNAVAILABLE' } } },
    });
  });

  it('returns processing duplicates when the original idempotency claim is still open', async () => {
    const { store, manager, qb } = createStore();
    qb.execute.mockResolvedValue({ identifiers: [], raw: [] });
    manager.findOneOrFail.mockResolvedValue(idempotencyRecord({ status: 'PROCESSING' }));

    await expect(store.begin(input())).resolves.toEqual({
      kind: 'processing',
      rawEventId: 'raw-1',
      brandId: 'brandA',
      provider: 'pragmatic',
      idempotencyKey: 'pragmatic:bet:txn-1',
    });
    expect(manager.save).toHaveBeenCalledWith(
      RawEventOrmEntity,
      expect.objectContaining({
        id: 'raw-1',
        status: 'DUPLICATE',
        responseStatus: 503,
        responseBody: expect.objectContaining({ code: 'GSP_WALLET_RESULT_PENDING' }),
      }),
    );
  });

  it('records conflicts when a provider key is reused with a different fingerprint', async () => {
    const { store, manager, qb } = createStore();
    qb.execute.mockResolvedValue({ identifiers: [], raw: [] });
    manager.findOneOrFail.mockResolvedValue(idempotencyRecord({ requestHash: 'other-hash' }));

    await expect(store.begin(input())).resolves.toEqual({ kind: 'conflict' });
    expect(manager.save).toHaveBeenCalledWith(
      RawEventOrmEntity,
      expect.objectContaining({
        id: 'raw-1',
        status: 'CONFLICT',
        responseStatus: 409,
      }),
    );
  });

  it('completes wallet intents and caches the provider response', async () => {
    const { store, manager } = createStore();

    await store.complete({
      intentId: 'intent-1',
      rawEventId: 'raw-1',
      idempotencyKeyId: 'idem-1',
      ledgerResult: { status: 'approved' },
      intentStatus: 'LEDGER_SUCCEEDED',
      responseStatus: 200,
      responseBody: { status: 'approved' },
    });

    expect(manager.save).toHaveBeenCalledWith(
      GspWalletIntentOrmEntity,
      expect.objectContaining({
        id: 'intent-1',
        status: 'LEDGER_SUCCEEDED',
        ledgerResult: { status: 'approved' },
        responseBody: { status: 'approved' },
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      IdempotencyKeyOrmEntity,
      expect.objectContaining({
        id: 'idem-1',
        status: 'SUCCEEDED',
        responseStatus: 200,
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      RawEventOrmEntity,
      expect.objectContaining({ id: 'raw-1', status: 'COMPLETED' }),
    );
  });

  it('records retryable ledger failures durably', async () => {
    const { store, manager } = createStore();

    await store.fail({
      intentId: 'intent-1',
      rawEventId: 'raw-1',
      idempotencyKeyId: 'idem-1',
      error: { message: 'ledger down' },
      responseStatus: 503,
      responseBody: { error: { code: 'GSP_LEDGER_UNAVAILABLE' } },
    });

    expect(manager.save).toHaveBeenCalledWith(
      GspWalletIntentOrmEntity,
      expect.objectContaining({
        id: 'intent-1',
        status: 'LEDGER_RETRYABLE_FAILURE',
        responseStatus: 503,
        lastError: { message: 'ledger down' },
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      IdempotencyKeyOrmEntity,
      expect.objectContaining({ id: 'idem-1', status: 'FAILED_RETRYABLE' }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      RawEventOrmEntity,
      expect.objectContaining({ id: 'raw-1', status: 'FAILED_RETRYABLE' }),
    );
  });

  it('finds cached responses by tenant/provider/idempotency key and records duplicate raw responses', async () => {
    const { store, repo, manager } = createStore();
    repo.findOne.mockResolvedValue(
      idempotencyRecord({
        status: 'SUCCEEDED',
        responseStatus: 200,
        responseBody: { status: 'approved' },
      }),
    );

    await expect(
      store.findCachedResponse('brandA', 'pragmatic', 'pragmatic:bet:txn-1'),
    ).resolves.toEqual({
      statusCode: 200,
      body: { status: 'approved' },
    });
    expect(repo.findOne).toHaveBeenCalledWith({
      where: {
        brandId: 'brandA',
        source: 'gsp',
        provider: 'pragmatic',
        key: 'pragmatic:bet:txn-1',
      },
    });

    await store.recordDuplicateResponse('raw-duplicate', {
      statusCode: 200,
      body: { status: 'approved' },
    });
    expect(manager.save).toHaveBeenCalledWith(
      RawEventOrmEntity,
      expect.objectContaining({
        id: 'raw-duplicate',
        status: 'DUPLICATE',
        responseStatus: 200,
      }),
    );
  });

  it('returns null when a cached idempotency response is absent or still processing', async () => {
    const { store, repo } = createStore();
    repo.findOne.mockResolvedValueOnce(null);
    await expect(store.findCachedResponse('brandA', 'pragmatic', 'missing')).resolves.toBeNull();

    repo.findOne.mockResolvedValueOnce(idempotencyRecord({ status: 'PROCESSING' }));
    await expect(
      store.findCachedResponse('brandA', 'pragmatic', 'pragmatic:bet:txn-1'),
    ).resolves.toBeNull();
  });
});

function createStore() {
  const qb = {
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  };
  const manager = {
    create: jest.fn((_entity, value) => value),
    save: jest.fn(async (entity, value) => {
      if (entity === RawEventOrmEntity && value.status === 'RECEIVED') {
        return { ...value, id: 'raw-1' };
      }
      if (entity === GspWalletIntentOrmEntity && !value.id) {
        return { ...value, id: 'intent-1' };
      }
      return value;
    }),
    findOneOrFail: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
  };
  const repo = {
    findOne: jest.fn(),
  };
  const dataSource = dataSourceFromMock({
    transaction: jest.fn((callback: (manager: EntityManager) => unknown) =>
      callback(entityManagerFromMock(manager)),
    ),
    getRepository: jest.fn(() => repo),
  });

  return {
    qb,
    manager,
    repo,
    store: new TypeOrmGspWalletActionStore(dataSource),
  };
}

function entityManagerFromMock(mock: object): EntityManager {
  const manager = Object.create(EntityManager.prototype) as EntityManager;
  return Object.assign(manager, mock);
}

function dataSourceFromMock(mock: object): DataSource {
  const dataSource = Object.create(DataSource.prototype) as DataSource;
  return Object.assign(dataSource, mock);
}

function input(patch: Partial<GspWalletActionStoreInput> = {}): GspWalletActionStoreInput {
  return {
    provider: 'pragmatic',
    headers: { 'x-request-id': 'req-1' },
    rawBody: '{"action":"bet"}',
    parsedBody: { action: 'bet' },
    action: {
      source: 'gsp',
      provider: 'pragmatic',
      brandId: 'brandA',
      providerEventId: 'txn-1',
      operation: 'bet',
      roundId: 'round-1',
      aggregateId: 'round-1',
      playerId: 'player-1',
      amount: '10.00',
      currency: 'EUR',
      originalProviderEventId: null,
      occurredAt: new Date('2026-06-08T12:00:00Z'),
      raw: {},
    },
    idempotencyKey: 'pragmatic:bet:txn-1',
    requestHash: 'request-hash',
    fingerprintFields: { providerEventId: 'txn-1' },
    ledgerCommandId: 'gsp-wallet:brandA:pragmatic:bet:txn-1',
    ...patch,
  };
}

function idempotencyRecord(patch: Partial<IdempotencyKeyOrmEntity> = {}): IdempotencyKeyOrmEntity {
  return {
    id: 'idem-1',
    brandId: 'brandA',
    source: 'gsp',
    provider: 'pragmatic',
    key: 'pragmatic:bet:txn-1',
    rawEventId: 'raw-1',
    requestHash: 'request-hash',
    status: 'SUCCEEDED',
    responseStatus: 200,
    responseBody: { status: 'approved' },
    createdAt: new Date(),
    updatedAt: new Date(),
    rawEvent: {} as RawEventOrmEntity,
    ...patch,
  };
}
