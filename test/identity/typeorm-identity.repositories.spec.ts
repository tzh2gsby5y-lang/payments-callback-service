import { FindOperator, Repository } from 'typeorm';
import { TypeOrmSessionsRepository } from '../../src/modules/identity/infrastructure/typeorm/typeorm-sessions.repository';
import { TypeOrmUsersRepository } from '../../src/modules/identity/infrastructure/typeorm/typeorm-users.repository';
import { SessionOrmEntity } from '../../src/modules/identity/infrastructure/typeorm/entities/session.orm-entity';
import { UserOrmEntity } from '../../src/modules/identity/infrastructure/typeorm/entities/user.orm-entity';

describe('identity TypeORM repositories', () => {
  it('creates users and scopes lookup queries by brand', async () => {
    const repository = repositoryMock();
    const users = new TypeOrmUsersRepository(repositoryFromMock<UserOrmEntity>(repository));
    repository.save.mockResolvedValue({ id: 'user-1' });

    await users.create({
      brandId: 'brandA',
      email: 'player@example.com',
      passwordHash: 'hash',
    });
    await users.findByBrandAndEmail('brandA', 'player@example.com');
    await users.findByIdForBrand('brandA', 'user-1');

    expect(repository.create).toHaveBeenCalledWith({
      brandId: 'brandA',
      email: 'player@example.com',
      passwordHash: 'hash',
    });
    expect(repository.save).toHaveBeenCalled();
    expect(repository.findOne).toHaveBeenNthCalledWith(1, {
      where: { brandId: 'brandA', email: 'player@example.com' },
    });
    expect(repository.findOne).toHaveBeenNthCalledWith(2, {
      where: { id: 'user-1', brandId: 'brandA' },
    });
  });

  it('creates sessions and only finds non-expired sessions by hashed token', async () => {
    const repository = repositoryMock();
    const sessions = new TypeOrmSessionsRepository(
      repositoryFromMock<SessionOrmEntity>(repository),
    );
    const now = new Date('2026-06-08T12:00:00Z');
    repository.save.mockResolvedValue({ id: 'session-1' });

    await sessions.create({
      brandId: 'brandA',
      userId: 'user-1',
      tokenHash: 'token-hash',
      expiresAt: new Date('2026-06-08T13:00:00Z'),
    });
    await sessions.findValidByTokenHash('token-hash', now);

    expect(repository.create).toHaveBeenCalledWith({
      brandId: 'brandA',
      userId: 'user-1',
      tokenHash: 'token-hash',
      expiresAt: new Date('2026-06-08T13:00:00Z'),
    });
    expect(repository.findOne).toHaveBeenCalledTimes(1);
    const firstFindOneCall = repository.findOne.mock.calls[0];
    if (!firstFindOneCall) {
      throw new Error('Expected session lookup query');
    }
    const findOneOptions = firstFindOneCall[0] as {
      where: { tokenHash: string; expiresAt: FindOperator<Date> };
    };
    expect(findOneOptions.where.tokenHash).toBe('token-hash');
    const expiresAtOperator = findOneOptions.where.expiresAt;
    expect(expiresAtOperator).toBeInstanceOf(FindOperator);
    expect(expiresAtOperator.value).toBe(now);
  });
});

function repositoryMock() {
  return {
    create: jest.fn((value: object) => value),
    save: jest.fn(async (value: object) => value),
    findOne: jest.fn(),
  };
}

function repositoryFromMock<T extends object>(mock: ReturnType<typeof repositoryMock>): Repository<T> {
  const repository = Object.create(Repository.prototype) as Repository<T>;
  return Object.assign(repository, mock);
}
