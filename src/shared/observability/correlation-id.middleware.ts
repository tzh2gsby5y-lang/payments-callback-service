import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { CorrelationIdService } from './correlation-id.service';

export type RequestWithCorrelation = Request & {
  requestId?: string;
  rawBody?: Buffer;
};

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  constructor(private readonly correlationIds: CorrelationIdService) {}

  use(req: RequestWithCorrelation, res: Response, next: NextFunction): void {
    const incoming = req.header('x-request-id');
    const requestId = incoming && incoming.trim().length > 0 ? incoming : randomUUID();

    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    this.correlationIds.run(requestId, next);
  }
}
