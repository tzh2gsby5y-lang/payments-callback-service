import { Module } from '@nestjs/common';
import { CorrelationIdMiddleware } from './correlation-id.middleware';
import { CorrelationIdService } from './correlation-id.service';
import { RequestLoggerMiddleware } from './request-logger.middleware';

@Module({
  providers: [CorrelationIdService, CorrelationIdMiddleware, RequestLoggerMiddleware],
  exports: [CorrelationIdService, CorrelationIdMiddleware, RequestLoggerMiddleware],
})
export class ObservabilityModule {}
