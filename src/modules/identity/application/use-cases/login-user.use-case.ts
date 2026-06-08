import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../../../../config/env.schema';
import { DomainError } from '../../../../shared/errors/domain-error';
import { PasswordHasher } from '../password-hasher';
import { SessionTokenService } from '../session-token.service';
import {
  SESSIONS_REPOSITORY,
  SessionsRepository,
} from '../../domain/repositories/sessions.repository';
import { USERS_REPOSITORY, UsersRepository } from '../../domain/repositories/users.repository';

export type LoginUserCommand = {
  brandId: string;
  email: string;
  password: string;
};

@Injectable()
export class LoginUserUseCase {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(SESSIONS_REPOSITORY) private readonly sessions: SessionsRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokens: SessionTokenService,
    private readonly config: ConfigService<Env>,
  ) {}

  async execute(command: LoginUserCommand): Promise<{ accessToken: string; expiresAt: string }> {
    const email = command.email.trim().toLowerCase();
    const user = await this.users.findByBrandAndEmail(command.brandId, email);

    if (!user || !(await this.passwordHasher.verify(command.password, user.passwordHash))) {
      throw new DomainError('INVALID_CREDENTIALS', 'Invalid email, password, or brand', 401);
    }

    const accessToken = this.tokens.createPlainToken();
    const ttlSeconds = this.config.get('SESSION_TTL_SECONDS', { infer: true }) ?? 86_400;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.sessions.create({
      brandId: user.brandId,
      userId: user.id,
      tokenHash: this.tokens.hashToken(accessToken),
      expiresAt,
    });

    return {
      accessToken,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
