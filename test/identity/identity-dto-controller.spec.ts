import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { request as expressRequest } from 'express';
import { SessionTokenService } from '../../src/modules/identity/application/session-token.service';
import { GetProfileUseCase } from '../../src/modules/identity/application/use-cases/get-profile.use-case';
import { LoginUserUseCase } from '../../src/modules/identity/application/use-cases/login-user.use-case';
import { RegisterUserUseCase } from '../../src/modules/identity/application/use-cases/register-user.use-case';
import { SESSIONS_REPOSITORY } from '../../src/modules/identity/domain/repositories/sessions.repository';
import { AuthenticatedRequest } from '../../src/modules/identity/presentation/authenticated-request';
import { IdentityController } from '../../src/modules/identity/presentation/identity.controller';
import { LoginDto } from '../../src/modules/identity/presentation/dto/login.dto';
import { RegisterDto } from '../../src/modules/identity/presentation/dto/register.dto';

describe('identity DTO and controller contracts', () => {
  it('validates register DTO boundaries and rejects short passwords', async () => {
    const dto = plainToInstance(RegisterDto, {
      brandId: '',
      email: 'not-email',
      password: 'short',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(['brandId', 'email', 'password']);
  });

  it('allows short non-empty login passwords but rejects empty or oversized values', async () => {
    await expect(
      validate(plainToInstance(LoginDto, validLogin({ password: 'x' }))),
    ).resolves.toHaveLength(0);

    const emptyErrors = await validate(plainToInstance(LoginDto, validLogin({ password: '' })));
    const longErrors = await validate(
      plainToInstance(LoginDto, validLogin({ password: 'x'.repeat(129) })),
    );

    expect(emptyErrors.map((error) => error.property)).toContain('password');
    expect(longErrors.map((error) => error.property)).toContain('password');
  });

  it('rejects extra DTO properties through the same whitelist pipe used by the app', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        { ...validLogin(), role: 'admin' },
        { type: 'body', metatype: LoginDto, data: '' },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('delegates identity controller methods to use-cases without rewriting command contracts', async () => {
    const registerResult = { id: 'user-1', brandId: 'brandA', email: 'player@example.com' };
    const loginResult = { accessToken: 'token', expiresAt: '2026-06-08T00:00:00.000Z' };
    const profileResult = { id: 'user-1', brandId: 'brandA', email: 'player@example.com' };
    const register = registerUseCaseMock(registerResult);
    const login = loginUseCaseMock(loginResult);
    const profile = profileUseCaseMock(profileResult);
    const moduleRef = await Test.createTestingModule({
      controllers: [IdentityController],
      providers: [
        { provide: RegisterUserUseCase, useValue: register },
        { provide: LoginUserUseCase, useValue: login },
        { provide: GetProfileUseCase, useValue: profile },
        SessionTokenService,
        {
          provide: SESSIONS_REPOSITORY,
          useValue: {
            create: jest.fn(),
            findValidByTokenHash: jest.fn(),
          },
        },
      ],
    }).compile();
    const controller = moduleRef.get(IdentityController);
    const registerDto = {
      brandId: 'brandA',
      email: 'player@example.com',
      password: 'strong-password',
    };
    const loginDto = validLogin();
    const principal = { brandId: 'brandA', userId: 'user-1', sessionId: 'session-1' };

    await expect(controller.register(registerDto)).resolves.toBe(registerResult);
    await expect(controller.login(loginDto)).resolves.toBe(loginResult);
    await expect(controller.me(authenticatedRequest(principal))).resolves.toBe(profileResult);

    expect(register.execute).toHaveBeenCalledWith(registerDto);
    expect(login.execute).toHaveBeenCalledWith(loginDto);
    expect(profile.execute).toHaveBeenCalledWith(principal);
  });
});

function validLogin(overrides: Partial<LoginDto> = {}): LoginDto {
  return {
    brandId: 'brandA',
    email: 'player@example.com',
    password: 'password',
    ...overrides,
  };
}

type UseCaseMock<T extends { execute: (...args: never) => Promise<unknown> }> = Pick<
  T,
  'execute'
> & {
  execute: jest.MockedFunction<T['execute']>;
};

function registerUseCaseMock(
  result: Awaited<ReturnType<RegisterUserUseCase['execute']>>,
): UseCaseMock<RegisterUserUseCase> {
  return {
    execute: jest
      .fn<ReturnType<RegisterUserUseCase['execute']>, Parameters<RegisterUserUseCase['execute']>>()
      .mockResolvedValue(result),
  };
}

function loginUseCaseMock(
  result: Awaited<ReturnType<LoginUserUseCase['execute']>>,
): UseCaseMock<LoginUserUseCase> {
  return {
    execute: jest
      .fn<ReturnType<LoginUserUseCase['execute']>, Parameters<LoginUserUseCase['execute']>>()
      .mockResolvedValue(result),
  };
}

function profileUseCaseMock(
  result: Awaited<ReturnType<GetProfileUseCase['execute']>>,
): UseCaseMock<GetProfileUseCase> {
  return {
    execute: jest
      .fn<ReturnType<GetProfileUseCase['execute']>, Parameters<GetProfileUseCase['execute']>>()
      .mockResolvedValue(result),
  };
}

function authenticatedRequest(principal: AuthenticatedRequest['principal']): AuthenticatedRequest {
  return Object.assign(Object.create(expressRequest), { principal }) as AuthenticatedRequest;
}
