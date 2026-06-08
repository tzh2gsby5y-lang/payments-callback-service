import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { CorrelationIdService } from './correlation-id.service';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  constructor(private readonly correlationIds: CorrelationIdService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = Date.now();

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      const log = {
        level: 'info',
        msg: 'request_completed',
        requestId: this.correlationIds.getRequestId(),
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs,
      };

      process.stdout.write(`${JSON.stringify(log)}\n`);
    });

    next();
  }
}
