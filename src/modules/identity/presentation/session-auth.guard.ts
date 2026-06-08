import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { SessionTokenService } from '../application/session-token.service';
import {
  SESSIONS_REPOSITORY,
  SessionsRepository,
} from '../domain/repositories/sessions.repository';
import { Inject } from '@nestjs/common';
import { AuthenticatedRequest } from './authenticated-request';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    @Inject(SESSIONS_REPOSITORY) private readonly sessions: SessionsRepository,
    private readonly tokens: SessionTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & Request>();
    const authorization = request.header('authorization');
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : null;

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const session = await this.sessions.findValidByTokenHash(
      this.tokens.hashToken(token),
      new Date(),
    );

    if (!session) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const requestedBrandId = request.header('x-brand-id');
    if (requestedBrandId && requestedBrandId !== session.brandId) {
      throw new ForbiddenException('Session brand does not match requested brand');
    }

    request.principal = {
      sessionId: session.id,
      userId: session.userId,
      brandId: session.brandId,
    };

    return true;
  }
}
