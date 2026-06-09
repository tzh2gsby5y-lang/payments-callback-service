import { Repository } from 'typeorm';
import { TypeOrmIdempotencyRepository } from '../../../src/modules/provider-events/infrastructure/typeorm/typeorm-idempotency.repository';
import { TypeOrmRawEventsRepository } from '../../../src/modules/provider-events/infrastructure/typeorm/typeorm-raw-events.repository';
import { IdempotencyKeyOrmEntity } from '../../../src/modules/provider-events/infrastructure/typeorm/entities/idempotency-key.orm-entity';
import { RawEventOrmEntity } from '../../../src/modules/provider-events/infrastructure/typeorm/entities/raw-event.orm-entity';

describe('provider-events TypeORM repositories', () => {
  it('claims a new idempotency key with PROCESSING status', async () => {
    const repository = repositoryMock();
    const idempotency = new TypeOrmIdempotencyRepository(
      repositoryFromMock<IdempotencyKeyOrmEntity>(repository),
    );
    repository.save.mockResolvedValue({ id: 'claim-1' });

    await expect(idempotency.claim(idempotencyInput())).resolves.toEqual({
      kind: 'new',
      record: { id: 'claim-1' },
    });
    expect(repository.create).toHaveBeenCalledWith({
      ...idempotencyInput(),
      status: 'PROCESSING',
      responseStatus: null,
      responseBody: null,
    });
  });

  it('classifies idempotency duplicates and conflicts after unique violations', async () => {
    const repository = repositoryMock();
    const idempotency = new TypeOrmIdempotencyRepository(
      repositoryFromMock<IdempotencyKeyOrmEntity>(repository),
    );
    repository.save.mockRejectedValueOnce({ code: '23505' }).mockRejectedValueOnce({
      driverError: { code: '23505' },
    });
    repository.findOneOrFail
      .mockResolvedValueOnce({ id: 'claim-1', requestHash: 'request-hash' })
      .mockResolvedValueOnce({ id: 'claim-1', requestHash: 'other-hash' });

    await expect(idempotency.claim(idempotencyInput())).resolves.toMatchObject({
      kind: 'duplicate',
      record: { id: 'claim-1' },
    });
    await expect(idempotency.claim(idempotencyInput())).resolves.toMatchObject({
      kind: 'conflict',
      record: { id: 'claim-1' },
    });
    expect(repository.findOneOrFail).toHaveBeenCalledWith({
      where: {
        brandId: 'brandA',
        source: 'psp',
        provider: 'stripe',
        key: 'stripe:evt_1',
      },
    });
  });

  it('propagates non-unique idempotency claim failures', async () => {
    const repository = repositoryMock();
    const idempotency = new TypeOrmIdempotencyRepository(
      repositoryFromMock<IdempotencyKeyOrmEntity>(repository),
    );
    const error = new Error('connection lost');
    repository.save.mockRejectedValue(error);

    await expect(idempotency.claim(idempotencyInput())).rejects.toBe(error);
    expect(repository.findOneOrFail).not.toHaveBeenCalled();
  });

  it('marks idempotency records completed with stored response metadata', async () => {
    const repository = repositoryMock();
    const idempotency = new TypeOrmIdempotencyRepository(
      repositoryFromMock<IdempotencyKeyOrmEntity>(repository),
    );

    await idempotency.markCompleted('claim-1', 'SUCCEEDED', 202, { status: 'accepted' });

    expect(repository.create).toHaveBeenCalledWith({
      id: 'claim-1',
      status: 'SUCCEEDED',
      responseStatus: 202,
      responseBody: { status: 'accepted' },
    });
    expect(repository.save).toHaveBeenCalled();
  });

  it('creates raw events with null response metadata until ingestion completes', async () => {
    const repository = repositoryMock();
    const rawEvents = new TypeOrmRawEventsRepository(
      repositoryFromMock<RawEventOrmEntity>(repository),
    );
    repository.save.mockImplementation(async (value) => ({ ...value, id: 'raw-1' }));

    await rawEvents.create(rawEventInput());

    expect(repository.create).toHaveBeenCalledWith({
      ...rawEventInput(),
      responseStatus: null,
      responseBody: null,
    });
  });

  it('updates raw event status and normalizes missing response metadata to null', async () => {
    const repository = repositoryMock();
    const rawEvents = new TypeOrmRawEventsRepository(
      repositoryFromMock<RawEventOrmEntity>(repository),
    );

    await rawEvents.updateStatus('raw-1', 'DUPLICATE', 200, { status: 'duplicate' });
    await rawEvents.updateStatus('raw-2', 'CONFLICT');

    expect(repository.create).toHaveBeenNthCalledWith(1, {
      id: 'raw-1',
      status: 'DUPLICATE',
      responseStatus: 200,
      responseBody: { status: 'duplicate' },
    });
    expect(repository.create).toHaveBeenNthCalledWith(2, {
      id: 'raw-2',
      status: 'CONFLICT',
      responseStatus: null,
      responseBody: null,
    });
  });
});

function repositoryMock() {
  return {
    create: jest.fn((value: object) => value),
    save: jest.fn(async (value: object) => value),
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
  };
}

function repositoryFromMock<T extends object>(
  mock: ReturnType<typeof repositoryMock>,
): Repository<T> {
  const repository = Object.create(Repository.prototype) as Repository<T>;
  return Object.assign(repository, mock);
}

function idempotencyInput() {
  return {
    brandId: 'brandA',
    source: 'psp' as const,
    provider: 'stripe',
    key: 'stripe:evt_1',
    rawEventId: 'raw-1',
    requestHash: 'request-hash',
  };
}

function rawEventInput() {
  return {
    brandId: 'brandA',
    source: 'psp' as const,
    provider: 'stripe',
    providerEventId: 'evt_1',
    idempotencyKey: 'stripe:evt_1',
    eventType: 'payment_intent.succeeded',
    status: 'RECEIVED' as const,
    signatureValid: true,
    requestHash: 'request-hash',
    headers: {},
    rawBody: '{}',
    parsedBody: {},
    normalizedBody: {},
  };
}
