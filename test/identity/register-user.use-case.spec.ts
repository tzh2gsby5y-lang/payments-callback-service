import { randomUUID } from 'node:crypto';
import { PasswordHasher } from '../../src/modules/identity/application/password-hasher';
import { RegisterUserUseCase } from '../../src/modules/identity/application/use-cases/register-user.use-case';
import {
  CreateUserInput,
  UsersRepository,
} from '../../src/modules/identity/domain/repositories/users.repository';
import { User } from '../../src/modules/identity/domain/user';

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

describe('RegisterUserUseCase', () => {
  it('scopes email uniqueness by brandId', async () => {
    const users = new FakeUsersRepository();
    const useCase = new RegisterUserUseCase(users, new PasswordHasher());

    const brandAUser = await useCase.execute({
      brandId: 'brandA',
      email: 'Player@example.com',
      password: 'strong-password',
    });
    const brandBUser = await useCase.execute({
      brandId: 'brandB',
      email: 'player@example.com',
      password: 'strong-password',
    });

    await expect(
      useCase.execute({
        brandId: 'brandA',
        email: 'player@example.com',
        password: 'strong-password',
      }),
    ).rejects.toMatchObject({ code: 'USER_ALREADY_EXISTS', statusCode: 409 });
    expect(brandAUser.email).toBe('player@example.com');
    expect(brandBUser.email).toBe('player@example.com');
    expect(brandAUser.brandId).toBe('brandA');
    expect(brandBUser.brandId).toBe('brandB');
  });

  it('does not hash or persist when a duplicate user already exists for the brand', async () => {
    const existing = {
      id: 'user-1',
      brandId: 'brandA',
      email: 'player@example.com',
      passwordHash: 'hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const users: jest.Mocked<UsersRepository> = {
      create: jest.fn(),
      findByBrandAndEmail: jest.fn().mockResolvedValue(existing),
      findByIdForBrand: jest.fn(),
    };
    const passwordHasher = new PasswordHasher();
    const hashSpy = jest.spyOn(passwordHasher, 'hash');
    const useCase = new RegisterUserUseCase(users, passwordHasher);

    await expect(
      useCase.execute({
        brandId: 'brandA',
        email: 'PLAYER@example.com',
        password: 'strong-password',
      }),
    ).rejects.toMatchObject({ code: 'USER_ALREADY_EXISTS', statusCode: 409 });
    expect(hashSpy).not.toHaveBeenCalled();
    expect(users.create).not.toHaveBeenCalled();
    expect(users.findByBrandAndEmail).toHaveBeenCalledWith('brandA', 'player@example.com');
  });
});
