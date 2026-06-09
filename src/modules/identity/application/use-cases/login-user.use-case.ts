import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../../../../config/env.schema';
import { DomainError } from '../../../../shared/errors/domain-error';
import { StructuredLogger } from '../../../../shared/observability/structured-logger.service';
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
  private readonly users: UsersRepository;
  private readonly sessions: SessionsRepository;
  private readonly passwordHasher: PasswordHasher;
  private readonly tokens: SessionTokenService;
  private readonly config: ConfigService<Env>;
  private readonly logger: StructuredLogger | undefined;

  constructor(
    @Inject(USERS_REPOSITORY) users: UsersRepository,
    @Inject(SESSIONS_REPOSITORY) sessions: SessionsRepository,
    passwordHasher: PasswordHasher,
    tokens: SessionTokenService,
    config: ConfigService<Env>,
    @Optional() logger?: StructuredLogger,
  ) {
    this.users = users;
    this.sessions = sessions;
    this.passwordHasher = passwordHasher;
    this.tokens = tokens;
    this.config = config;
    this.logger = logger;
  }

  async execute(command: LoginUserCommand): Promise<{ accessToken: string; expiresAt: string }> {
    const email = command.email.trim().toLowerCase();
    const user = await this.users.findByBrandAndEmail(command.brandId, email);

    if (!user || !(await this.passwordHasher.verify(command.password, user.passwordHash))) {
      this.logger?.warn('identity_login_rejected', {
        brandId: command.brandId,
      });
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

    this.logger?.info('identity_login_succeeded', {
      brandId: user.brandId,
      userId: user.id,
      expiresAt: expiresAt.toISOString(),
    });

    return {
      accessToken,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
