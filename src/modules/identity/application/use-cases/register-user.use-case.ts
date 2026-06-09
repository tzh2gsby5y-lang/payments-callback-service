import { Inject, Injectable, Optional } from '@nestjs/common';
import { DomainError } from '../../../../shared/errors/domain-error';
import { StructuredLogger } from '../../../../shared/observability/structured-logger.service';
import { USERS_REPOSITORY, UsersRepository } from '../../domain/repositories/users.repository';
import { PasswordHasher } from '../password-hasher';

export type RegisterUserCommand = {
  brandId: string;
  email: string;
  password: string;
};

@Injectable()
export class RegisterUserUseCase {
  private readonly users: UsersRepository;
  private readonly passwordHasher: PasswordHasher;
  private readonly logger: StructuredLogger | undefined;

  constructor(
    @Inject(USERS_REPOSITORY) users: UsersRepository,
    passwordHasher: PasswordHasher,
    @Optional() logger?: StructuredLogger,
  ) {
    this.users = users;
    this.passwordHasher = passwordHasher;
    this.logger = logger;
  }

  async execute(
    command: RegisterUserCommand,
  ): Promise<{ id: string; brandId: string; email: string }> {
    const email = command.email.trim().toLowerCase();
    const existing = await this.users.findByBrandAndEmail(command.brandId, email);

    if (existing) {
      this.logger?.warn('identity_registration_conflict', {
        brandId: command.brandId,
      });
      throw new DomainError('USER_ALREADY_EXISTS', 'User already exists for this brand', 409);
    }

    const passwordHash = await this.passwordHasher.hash(command.password);
    const user = await this.users.create({
      brandId: command.brandId,
      email,
      passwordHash,
    });

    this.logger?.info('identity_user_registered', {
      brandId: user.brandId,
      userId: user.id,
    });

    return {
      id: user.id,
      brandId: user.brandId,
      email: user.email,
    };
  }
}
