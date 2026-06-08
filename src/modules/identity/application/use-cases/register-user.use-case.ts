import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../../../shared/errors/domain-error';
import { USERS_REPOSITORY, UsersRepository } from '../../domain/repositories/users.repository';
import { PasswordHasher } from '../password-hasher';

export type RegisterUserCommand = {
  brandId: string;
  email: string;
  password: string;
};

@Injectable()
export class RegisterUserUseCase {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(
    command: RegisterUserCommand,
  ): Promise<{ id: string; brandId: string; email: string }> {
    const email = command.email.trim().toLowerCase();
    const existing = await this.users.findByBrandAndEmail(command.brandId, email);

    if (existing) {
      throw new DomainError('USER_ALREADY_EXISTS', 'User already exists for this brand', 409);
    }

    const passwordHash = await this.passwordHasher.hash(command.password);
    const user = await this.users.create({
      brandId: command.brandId,
      email,
      passwordHash,
    });

    return {
      id: user.id,
      brandId: user.brandId,
      email: user.email,
    };
  }
}
