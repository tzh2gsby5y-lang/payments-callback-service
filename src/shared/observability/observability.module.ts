import { Global, Module } from '@nestjs/common';
import { CorrelationIdMiddleware } from './correlation-id.middleware';
import { CorrelationIdService } from './correlation-id.service';
import { RequestLoggerMiddleware } from './request-logger.middleware';
import { StructuredLogger } from './structured-logger.service';

@Global()
@Module({
  providers: [
    CorrelationIdService,
    StructuredLogger,
    CorrelationIdMiddleware,
    RequestLoggerMiddleware,
  ],
  exports: [
    CorrelationIdService,
    StructuredLogger,
    CorrelationIdMiddleware,
    RequestLoggerMiddleware,
  ],
})
export class ObservabilityModule {}
