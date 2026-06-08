import { Provider } from '@nestjs/common';
import { ProviderCallbackAdapter } from '../../../shared/provider-events/application/ports/provider-callback-adapter';
import { ProviderIdempotencyStrategy } from '../../../shared/provider-events/application/services/provider-idempotency.strategy';
import { ProviderCallbackRegistry } from './provider-callback.registry';
import { ProviderIdempotencyService } from './services/provider-idempotency.service';

export function createProviderCallbackRegistryProvider(adaptersToken: symbol): Provider {
  return {
    provide: ProviderCallbackRegistry,
    inject: [adaptersToken],
    useFactory: (adapters: ProviderCallbackAdapter[]): ProviderCallbackRegistry =>
      new ProviderCallbackRegistry(adapters),
  };
}

export function createProviderIdempotencyServiceProvider(strategiesToken: symbol): Provider {
  return {
    provide: ProviderIdempotencyService,
    inject: [strategiesToken],
    useFactory: (strategies: ProviderIdempotencyStrategy[]): ProviderIdempotencyService =>
      new ProviderIdempotencyService(strategies),
  };
}
