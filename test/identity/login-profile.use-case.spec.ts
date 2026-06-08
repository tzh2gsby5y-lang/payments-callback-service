import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Env } from '../../src/config/env.schema';
import { GetProfileUseCase } from '../../src/modules/identity/application/use-cases/get-profile.use-case';
import { LoginUserUseCase } from '../../src/modules/identity/application/use-cases/login-user.use-case';
import { RegisterUserUseCase } from '../../src/modules/identity/application/use-cases/register-user.use-case';
import { PasswordHasher } from '../../src/modules/identity/application/password-hasher';
import { SessionTokenService } from '../../src/modules/identity/application/session-token.service';
import {
  CreateSessionInput,
  SessionsRepository,
} from '../../src/modules/identity/domain/repositories/sessions.repository';
import {
  CreateUserInput,
  UsersRepository,
} from '../../src/modules/identity/domain/repositories/users.repository';
import { Session } from '../../src/modules/identity/domain/session';
import { User } from '../../src/modules/identity/domain/user';
import { expectSingle } from '../support/array-assertions';

class FakeUsersRepository implements UsersRepository {
  readonly rows: User[] = [];

  async create(input: CreateUserInput): Promise<User> {
    const now = new Date();
    const user = { id: randomUUID(), ...input, createdAt: now, updatedAt: now };
    this.rows.push(user);
    return user;
  }

  async findByBrandAndEmail(brandId: string, email: string): Promise<User | null> {
    return this.rows.find((user) => user.brandId === brandId && user.email === email) ?? null;
  }

  async findByIdForBrand(brandId: string, userId: string): Promise<User | null> {
    return this.rows.find((user) => user.brandId === brandId && user.id === userId) ?? null;
  }
}

class FakeSessionsRepository implements SessionsRepository {
  readonly rows = new Map<string, Session>();

  async create(input: CreateSessionInput): Promise<Session> {
    const session = { id: randomUUID(), ...input, createdAt: new Date() };
    this.rows.set(session.id, session);
    return session;
  }

  async findValidByTokenHash(tokenHash: string, now: Date): Promise<Session | null> {
    return (
      Array.from(this.rows.values()).find(
        (session) => session.tokenHash === tokenHash && session.expiresAt > now,
      ) ?? null
    );
  }
}

describe('LoginUserUseCase and GetProfileUseCase', () => {
  function createUseCases() {
    const users = new FakeUsersRepository();
    const sessions = new FakeSessionsRepository();
    const passwordHasher = new PasswordHasher();
    const tokens = new SessionTokenService();
    const config = new ConfigService<Env>({ SESSION_TTL_SECONDS: 3600 });

    return {
      users,
      sessions,
      register: new RegisterUserUseCase(users, passwordHasher),
      login: new LoginUserUseCase(users, sessions, passwordHasher, tokens, config),
      getProfile: new GetProfileUseCase(users),
    };
  }

  it('creates a tenant-scoped session for valid credentials and reads the profile', async () => {
    const { register, login, getProfile, sessions } = createUseCases();
    const user = await register.execute({
      brandId: 'brandA',
      email: 'Player@Example.com',
      password: 'strong-password',
    });

    const session = await login.execute({
      brandId: 'brandA',
      email: 'player@example.com',
      password: 'strong-password',
    });
    const storedSession = expectSingle(Array.from(sessions.rows.values()), 'session');
    const profile = await getProfile.execute({
      brandId: 'brandA',
      userId: user.id,
      sessionId: storedSession.id,
    });

    expect(session.accessToken).toHaveLength(43);
    expect(storedSession.brandId).toBe('brandA');
    expect(storedSession.userId).toBe(user.id);
    expect(profile).toEqual({
      id: user.id,
      brandId: 'brandA',
      email: 'player@example.com',
    });
  });

  it('rejects invalid credentials and cross-brand profile lookups', async () => {
    const { register, login, getProfile } = createUseCases();
    const user = await register.execute({
      brandId: 'brandA',
      email: 'player@example.com',
      password: 'strong-password',
    });

    await expect(
      login.execute({
        brandId: 'brandA',
        email: 'player@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });

    await expect(
      getProfile.execute({
        brandId: 'brandB',
        userId: user.id,
        sessionId: 'session-1',
      }),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND', statusCode: 404 });
  });

  it('falls back to a 24 hour session TTL when configuration does not provide one', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-09T00:00:00.000Z'));
    const users = new FakeUsersRepository();
    const sessions = new FakeSessionsRepository();
    const passwordHasher = new PasswordHasher();
    const tokens = new SessionTokenService();
    const config = new ConfigService<Env>({});
    const getSpy = jest.spyOn(config, 'get');
    const register = new RegisterUserUseCase(users, passwordHasher);
    const login = new LoginUserUseCase(users, sessions, passwordHasher, tokens, config);
    await register.execute({
      brandId: 'brandA',
      email: 'player@example.com',
      password: 'strong-password',
    });

    const result = await login.execute({
      brandId: 'brandA',
      email: 'player@example.com',
      password: 'strong-password',
    });

    const storedSession = expectSingle(Array.from(sessions.rows.values()), 'fallback TTL session');
    expect(storedSession.expiresAt.toISOString()).toBe('2026-06-10T00:00:00.000Z');
    expect(result.expiresAt).toBe(storedSession.expiresAt.toISOString());
    expect(getSpy).toHaveBeenCalledWith('SESSION_TTL_SECONDS', { infer: true });
    jest.useRealTimers();
  });

  it('returns the same profile error when the authenticated principal references a deleted user', async () => {
    const { getProfile } = createUseCases();

    await expect(
      getProfile.execute({
        brandId: 'brandA',
        userId: 'missing-user',
        sessionId: 'session-1',
      }),
    ).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
      message: 'Authenticated user was not found in this brand',
    });
  });
});
