import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PasswordHasher } from './application/password-hasher';
import { SessionTokenService } from './application/session-token.service';
import { LoginUserUseCase } from './application/use-cases/login-user.use-case';
import { RegisterUserUseCase } from './application/use-cases/register-user.use-case';
import { GetProfileUseCase } from './application/use-cases/get-profile.use-case';
import { SESSIONS_REPOSITORY } from './domain/repositories/sessions.repository';
import { USERS_REPOSITORY } from './domain/repositories/users.repository';
import { SessionOrmEntity } from './infrastructure/typeorm/entities/session.orm-entity';
import { UserOrmEntity } from './infrastructure/typeorm/entities/user.orm-entity';
import { TypeOrmSessionsRepository } from './infrastructure/typeorm/typeorm-sessions.repository';
import { TypeOrmUsersRepository } from './infrastructure/typeorm/typeorm-users.repository';
import { IdentityController } from './presentation/identity.controller';
import { SessionAuthGuard } from './presentation/session-auth.guard';

@Module({
  imports: [TypeOrmModule.forFeature([UserOrmEntity, SessionOrmEntity])],
  controllers: [IdentityController],
  providers: [
    PasswordHasher,
    SessionTokenService,
    RegisterUserUseCase,
    LoginUserUseCase,
    GetProfileUseCase,
    SessionAuthGuard,
    TypeOrmUsersRepository,
    TypeOrmSessionsRepository,
    {
      provide: USERS_REPOSITORY,
      useExisting: TypeOrmUsersRepository,
    },
    {
      provide: SESSIONS_REPOSITORY,
      useExisting: TypeOrmSessionsRepository,
    },
  ],
  exports: [SESSIONS_REPOSITORY, SessionTokenService],
})
export class IdentityModule {}
