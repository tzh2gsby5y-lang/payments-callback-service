import { Module } from '@nestjs/common';
import {
  createProviderCallbackRegistryProvider,
  createProviderIdempotencyServiceProvider,
} from '../provider-events/application/provider-events.provider-factories';
import { ProviderCallbackIngestionService } from '../provider-events/application/provider-callback-ingestion.service';
import { ProviderEventsPersistenceModule } from '../provider-events/infrastructure/provider-events-persistence.module';
import { ProviderCallbackAdapter } from '../../shared/provider-events/application/ports/provider-callback-adapter';
import { ProviderIdempotencyStrategy } from '../../shared/provider-events/application/services/provider-idempotency.strategy';
import {
  PSP_PROVIDER_CALLBACK_ADAPTERS,
  PSP_PROVIDER_IDEMPOTENCY_STRATEGIES,
} from './application/ports/psp-provider.tokens';
import { IngestPspCallbackUseCase } from './application/use-cases/ingest-psp-callback.use-case';
import { StripeIdempotencyStrategy } from './infrastructure/providers/stripe/stripe-idempotency.strategy';
import { StripePspModule } from './infrastructure/providers/stripe/stripe-psp.module';
import { StripePspProvider } from './infrastructure/providers/stripe/stripe-psp.provider';
import { PspWebhooksController } from './presentation/psp-webhooks.controller';

@Module({
  imports: [ProviderEventsPersistenceModule, StripePspModule],
  controllers: [PspWebhooksController],
  providers: [
    {
      provide: PSP_PROVIDER_CALLBACK_ADAPTERS,
      inject: [StripePspProvider],
      // Register PSP providers here; ingestion consumes this token without knowing concrete classes.
      useFactory: (stripe: StripePspProvider): ProviderCallbackAdapter[] => [stripe],
    },
    {
      provide: PSP_PROVIDER_IDEMPOTENCY_STRATEGIES,
      inject: [StripeIdempotencyStrategy],
      useFactory: (stripe: StripeIdempotencyStrategy): ProviderIdempotencyStrategy[] => [stripe],
    },
    createProviderCallbackRegistryProvider(PSP_PROVIDER_CALLBACK_ADAPTERS),
    createProviderIdempotencyServiceProvider(PSP_PROVIDER_IDEMPOTENCY_STRATEGIES),
    ProviderCallbackIngestionService,
    IngestPspCallbackUseCase,
  ],
})
export class PspModule {}
