import {
  ExecutionContext,
  ForbiddenException,
  Type,
  UnauthorizedException,
} from '@nestjs/common';
import {
  HttpArgumentsHost,
  RpcArgumentsHost,
  WsArgumentsHost,
} from '@nestjs/common/interfaces/features/arguments-host.interface';
import { AuthenticatedPrincipal } from '../../src/modules/identity/application/use-cases/get-profile.use-case';
import { SessionAuthGuard } from '../../src/modules/identity/presentation/session-auth.guard';
import { SessionTokenService } from '../../src/modules/identity/application/session-token.service';
import { Session } from '../../src/modules/identity/domain/session';
import { SessionsRepository } from '../../src/modules/identity/domain/repositories/sessions.repository';

describe('SessionAuthGuard', () => {
  function createGuard(session: Session | null = null) {
    const sessions: jest.Mocked<SessionsRepository> = {
      create: jest.fn(),
      findValidByTokenHash: jest.fn().mockResolvedValue(session),
    };
    const tokens = new SessionTokenService();
    return {
      sessions,
      tokens,
      guard: new SessionAuthGuard(sessions, tokens),
    };
  }

  it('rejects missing, non-Bearer, and empty bearer tokens before repository lookup', async () => {
    for (const authorization of [undefined, 'Basic abc', 'bearer token', 'Bearer ']) {
      const { guard, sessions } = createGuard();

      await expect(guard.canActivate(contextFor({ authorization }))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(sessions.findValidByTokenHash).not.toHaveBeenCalled();
    }
  });

  it('looks up the hashed token and rejects invalid or expired sessions', async () => {
    const { guard, sessions, tokens } = createGuard(null);

    await expect(
      guard.canActivate(contextFor({ authorization: 'Bearer plain-token' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(sessions.findValidByTokenHash).toHaveBeenCalledWith(
      tokens.hashToken('plain-token'),
      expect.any(Date),
    );
  });

  it('sets principal for a valid session and allows absent or matching brand headers', async () => {
    const session = validSession();
    const { guard } = createGuard(session);
    const request = requestFor({
      authorization: 'Bearer plain-token',
      'x-brand-id': 'brandA',
    });

    await expect(guard.canActivate(contextForRequest(request))).resolves.toBe(true);
    expect(request.principal).toEqual({
      sessionId: 'session-1',
      userId: 'user-1',
      brandId: 'brandA',
    });
  });

  it('rejects tenant leakage when requested brand differs from the session brand', async () => {
    const { guard } = createGuard(validSession());
    const request = requestFor({
      authorization: 'Bearer plain-token',
      'x-brand-id': 'brandB',
    });

    await expect(guard.canActivate(contextForRequest(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(request.principal).toBeUndefined();
  });
});

function validSession(): Session {
  return {
    id: 'session-1',
    brandId: 'brandA',
    userId: 'user-1',
    tokenHash: 'hash',
    expiresAt: new Date(Date.now() + 1000),
    createdAt: new Date(),
  };
}

type GuardRequest = {
  header(name: string): string | undefined;
  principal?: AuthenticatedPrincipal | undefined;
};

function requestFor(headers: Record<string, string | undefined>): GuardRequest {
  return {
    header: (name: string) => headers[name.toLowerCase()],
    principal: undefined,
  };
}

function contextFor(headers: Record<string, string | undefined>): ExecutionContext {
  return contextForRequest(requestFor(headers));
}

function contextForRequest(request: GuardRequest): ExecutionContext {
  const http: HttpArgumentsHost = {
    getRequest: <T = GuardRequest>() => request as T,
    getResponse: notUsed,
    getNext: notUsed,
  };
  const rpc: RpcArgumentsHost = {
    getData: notUsed,
    getContext: notUsed,
  };
  const ws: WsArgumentsHost = {
    getData: notUsed,
    getClient: notUsed,
    getPattern: notUsed,
  };

  return {
    getArgs: <T extends unknown[] = [GuardRequest]>() => [request] as T,
    getArgByIndex: <T = GuardRequest>() => request as T,
    switchToRpc: () => rpc,
    switchToHttp: () => http,
    switchToWs: () => ws,
    getType: <TContext extends string = 'http'>() => 'http' as TContext,
    getClass: notUsedType,
    getHandler: notUsed,
  };
}

function notUsed<T>(): T {
  throw new Error('Unexpected mock execution context call');
}

function notUsedType<T>(): Type<T> {
  throw new Error('Unexpected mock execution context call');
}
