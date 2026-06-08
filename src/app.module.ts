import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module';
import { GspModule } from './modules/gsp/gsp.module';
import { IdentityModule } from './modules/identity/identity.module';
import { PspModule } from './modules/psp/psp.module';
import { CorrelationIdMiddleware } from './shared/observability/correlation-id.middleware';
import { ObservabilityModule } from './shared/observability/observability.module';
import { RequestLoggerMiddleware } from './shared/observability/request-logger.middleware';
import { DatabaseModule } from './shared/persistence/database.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    AppConfigModule,
    ObservabilityModule,
    DatabaseModule,
    IdentityModule,
    PspModule,
    GspModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware, RequestLoggerMiddleware).forRoutes('*');
  }
}
