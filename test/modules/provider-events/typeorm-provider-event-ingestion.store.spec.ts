import { DataSource, EntityManager } from 'typeorm';
import { TypeOrmProviderEventIngestionStore } from '../../../src/modules/provider-events/infrastructure/typeorm/typeorm-provider-event-ingestion.store';
import { IdempotencyKeyOrmEntity } from '../../../src/modules/provider-events/infrastructure/typeorm/entities/idempotency-key.orm-entity';
import { ProviderEventHandoffOrmEntity } from '../../../src/modules/provider-events/infrastructure/typeorm/entities/provider-event-handoff.orm-entity';
import { RawEventOrmEntity } from '../../../src/modules/provider-events/infrastructure/typeorm/entities/raw-event.orm-entity';
import { ProviderEventIngestionStoreInput } from '../../../src/modules/provider-events/application/provider-event-ingestion.store';

describe('TypeOrmProviderEventIngestionStore', () => {
  it('persists accepted callbacks and creates a durable handoff in one transaction', async () => {
    const { store, manager, qb } = createStore();
    qb.execute.mockResolvedValue({ identifiers: [{ id: 'claim-1' }], raw: [] });
    manager.findOneOrFail.mockResolvedValue(idempotencyRecord({ id: 'claim-1' }));

    const result = await store.persist(input());

    expect(result).toMatchObject({
      kind: 'accepted',
      statusCode: 202,
      body: {
        status: 'accepted',
        eventId: 'raw-1',
        handoff: 'pending_evaluation',
        handoffId: 'handoff-1',
      },
    });
    expect(qb.orIgnore).toHaveBeenCalled();
    expect(manager.save).toHaveBeenCalledWith(
      ProviderEventHandoffOrmEntity,
      expect.objectContaining({
        rawEventId: 'raw-1',
        status: 'PENDING_EVALUATION',
        payload: expect.objectContaining({
          mode: 'async_payment_callback',
          rawEventId: 'raw-1',
        }),
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      IdempotencyKeyOrmEntity,
      expect.objectContaining({
        id: 'claim-1',
        status: 'SUCCEEDED',
        responseStatus: 202,
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      RawEventOrmEntity,
      expect.objectContaining({
        id: 'raw-1',
        status: 'ACCEPTED',
        responseStatus: 202,
      }),
    );
  });

  it('preserves null occurredAt in PSP async handoff payloads', async () => {
    const { store, manager, qb } = createStore();
    qb.execute.mockResolvedValue({ identifiers: [{ id: 'claim-1' }], raw: [] });
    manager.findOneOrFail.mockResolvedValue(idempotencyRecord({ id: 'claim-1' }));

    await store.persist(
      input({
        normalized: {
          ...input().normalized,
          providerEventId: 'evt-no-time',
          occurredAt: null,
        },
      }),
    );

    expect(manager.save).toHaveBeenCalledWith(
      ProviderEventHandoffOrmEntity,
      expect.objectContaining({
        source: 'psp',
        provider: 'stripe',
        payload: expect.objectContaining({
          mode: 'async_payment_callback',
          occurredAt: null,
        }),
      }),
    );
  });

  it('records duplicate callbacks without creating another handoff', async () => {
    const { store, manager, qb } = createStore();
    qb.execute.mockResolvedValue({ identifiers: [], raw: [] });
    manager.findOneOrFail.mockResolvedValue(
      idempotencyRecord({ rawEventId: 'original-raw', status: 'SUCCEEDED' }),
    );
    manager.findOne.mockResolvedValue(handoffRecord({ id: 'handoff-original' }));

    const result = await store.persist(input());

    expect(result).toMatchObject({
      kind: 'duplicate',
      statusCode: 200,
      body: {
        status: 'duplicate',
        eventId: 'original-raw',
        handoff: 'already_pending',
        handoffId: 'handoff-original',
      },
    });
    expect(manager.save).toHaveBeenCalledWith(
      RawEventOrmEntity,
      expect.objectContaining({
        id: 'raw-1',
        status: 'DUPLICATE',
        responseStatus: 200,
      }),
    );
    expect(
      manager.save.mock.calls.some(([entity]) => entity === ProviderEventHandoffOrmEntity),
    ).toBe(false);
  });

  it('keeps a duplicate as processing when the original idempotency claim is still open', async () => {
    const { store, manager, qb } = createStore();
    qb.execute.mockResolvedValue({ identifiers: [], raw: [] });
    manager.findOneOrFail.mockResolvedValue(idempotencyRecord({ status: 'PROCESSING' }));
    manager.findOne.mockResolvedValue(null);

    const result = await store.persist(input());

    expect(result).toMatchObject({
      kind: 'duplicate',
      statusCode: 202,
      body: {
        status: 'processing',
        handoff: 'pending_original_claim',
      },
    });
    expect(result.kind === 'duplicate' ? result.body.handoffId : undefined).toBeUndefined();
    expect(manager.save).toHaveBeenCalledWith(
      RawEventOrmEntity,
      expect.objectContaining({
        id: 'raw-1',
        status: 'DUPLICATE',
        responseStatus: 202,
        responseBody: expect.objectContaining({
          status: 'processing',
          handoff: 'pending_original_claim',
        }),
      }),
    );
  });

  it('records idempotency conflicts when the provider key is reused with different semantics', async () => {
    const { store, manager, qb } = createStore();
    qb.execute.mockResolvedValue({ identifiers: [], raw: [] });
    manager.findOneOrFail.mockResolvedValue(idempotencyRecord({ requestHash: 'different-hash' }));

    const result = await store.persist(input());

    expect(result).toEqual({ kind: 'conflict' });
    expect(manager.save).toHaveBeenCalledWith(
      RawEventOrmEntity,
      expect.objectContaining({
        id: 'raw-1',
        status: 'CONFLICT',
        responseStatus: 409,
        responseBody: {
          status: 'conflict',
          code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
        },
      }),
    );
  });

  it('recovers an existing handoff when a concurrent insert already created it', async () => {
    const { store, manager, qb } = createStore();
    qb.execute.mockResolvedValue({ identifiers: [{ id: 'claim-1' }], raw: [] });
    manager.findOneOrFail.mockResolvedValue(idempotencyRecord({ id: 'claim-1' }));
    manager.save.mockImplementation(async (entity, value) => {
      if (entity === RawEventOrmEntity && value.status === 'RECEIVED') {
        return { ...value, id: 'raw-1' };
      }
      if (entity === ProviderEventHandoffOrmEntity) {
        throw { code: '23505' };
      }
      return value;
    });
    manager.findOne.mockResolvedValue(handoffRecord({ id: 'handoff-recovered' }));

    const result = await store.persist(input());

    expect(result).toMatchObject({
      kind: 'accepted',
      body: { handoffId: 'handoff-recovered' },
    });
    expect(manager.save).toHaveBeenCalledWith(
      IdempotencyKeyOrmEntity,
      expect.objectContaining({
        id: 'claim-1',
        status: 'SUCCEEDED',
        responseBody: expect.objectContaining({
          handoffId: 'handoff-recovered',
        }),
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      RawEventOrmEntity,
      expect.objectContaining({
        id: 'raw-1',
        status: 'ACCEPTED',
        responseBody: expect.objectContaining({
          handoffId: 'handoff-recovered',
        }),
      }),
    );
  });

  it('throws a structured error when handoff recovery cannot find the concurrent row', async () => {
    const { store, manager, qb } = createStore();
    qb.execute.mockResolvedValue({ identifiers: [{ id: 'claim-1' }], raw: [] });
    manager.findOneOrFail.mockResolvedValue(idempotencyRecord({ id: 'claim-1' }));
    manager.save.mockImplementation(async (entity, value) => {
      if (entity === RawEventOrmEntity && value.status === 'RECEIVED') {
        return { ...value, id: 'raw-1' };
      }
      if (entity === ProviderEventHandoffOrmEntity) {
        throw { driverError: { code: '23505' } };
      }
      return value;
    });
    manager.findOne.mockResolvedValue(null);

    await expect(store.persist(input())).rejects.toMatchObject({
      code: 'PROVIDER_HANDOFF_NOT_FOUND',
      statusCode: 500,
    });
  });

  it('propagates non-unique handoff errors instead of masking infrastructure failures', async () => {
    const { store, manager, qb } = createStore();
    const error = new Error('serialization failure');
    qb.execute.mockResolvedValue({ identifiers: [{ id: 'claim-1' }], raw: [] });
    manager.findOneOrFail.mockResolvedValue(idempotencyRecord({ id: 'claim-1' }));
    manager.save.mockImplementation(async (entity, value) => {
      if (entity === RawEventOrmEntity && value.status === 'RECEIVED') {
        return { ...value, id: 'raw-1' };
      }
      if (entity === ProviderEventHandoffOrmEntity) {
        throw error;
      }
      return value;
    });

    await expect(store.persist(input())).rejects.toBe(error);
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
      if (entity === ProviderEventHandoffOrmEntity) {
        return { ...value, id: 'handoff-1' };
      }
      return value;
    }),
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
  };
  const dataSource = dataSourceFromMock({
    transaction: jest.fn((callback: (manager: EntityManager) => unknown) =>
      callback(entityManagerFromMock(manager)),
    ),
  });

  return {
    qb,
    manager,
    store: new TypeOrmProviderEventIngestionStore(dataSource),
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

function input(
  patch: Partial<ProviderEventIngestionStoreInput> = {},
): ProviderEventIngestionStoreInput {
  return {
    source: 'psp',
    provider: 'stripe',
    headers: { 'x-request-id': 'req-1' },
    rawBody: '{"id":"evt_1"}',
    parsedBody: { id: 'evt_1' },
    normalized: {
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
    },
    idempotencyKey: 'stripe:evt_1',
    requestHash: 'request-hash',
    fingerprintFields: { providerEventId: 'evt_1' },
    ...patch,
  };
}

function idempotencyRecord(patch: Partial<IdempotencyKeyOrmEntity> = {}): IdempotencyKeyOrmEntity {
  return {
    id: 'claim-1',
    brandId: 'brandA',
    source: 'psp',
    provider: 'stripe',
    key: 'stripe:evt_1',
    rawEventId: 'raw-1',
    requestHash: 'request-hash',
    status: 'SUCCEEDED',
    responseStatus: 202,
    responseBody: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    rawEvent: rawEventRecord(),
    ...patch,
  };
}

function handoffRecord(
  patch: Partial<ProviderEventHandoffOrmEntity> = {},
): ProviderEventHandoffOrmEntity {
  return {
    id: 'handoff-1',
    brandId: 'brandA',
    source: 'psp',
    provider: 'stripe',
    rawEventId: 'raw-1',
    rawEvent: rawEventRecord(),
    idempotencyKey: 'stripe:evt_1',
    providerEventId: 'evt_1',
    eventType: 'payment_intent.succeeded',
    aggregateType: 'payment',
    aggregateId: 'pi_1',
    playerId: 'player-1',
    amount: '2500',
    currency: 'USD',
    status: 'PENDING_EVALUATION',
    payload: {},
    attemptCount: 0,
    nextAttemptAt: new Date(),
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...patch,
  };
}

function rawEventRecord(patch: Partial<RawEventOrmEntity> = {}): RawEventOrmEntity {
  return {
    id: 'raw-1',
    brandId: 'brandA',
    source: 'psp',
    provider: 'stripe',
    providerEventId: 'evt_1',
    idempotencyKey: 'stripe:evt_1',
    eventType: 'payment_intent.succeeded',
    status: 'ACCEPTED',
    signatureValid: true,
    requestHash: 'request-hash',
    headers: {},
    rawBody: '{"id":"evt_1"}',
    parsedBody: { id: 'evt_1' },
    normalizedBody: { providerEventId: 'evt_1' },
    responseStatus: 202,
    responseBody: null,
    receivedAt: new Date(),
    updatedAt: new Date(),
    ...patch,
  };
}
