import {
  createProviderCallbackRegistryProvider,
  createProviderIdempotencyServiceProvider,
} from '../../../src/modules/provider-events/application/provider-events.provider-factories';
import { ProviderCallbackRegistry } from '../../../src/modules/provider-events/application/provider-callback.registry';
import { ProviderIdempotencyService } from '../../../src/modules/provider-events/application/services/provider-idempotency.service';

describe('provider-events provider factories', () => {
  it('creates a registry provider bound to the supplied adapter token', () => {
    const adaptersToken = Symbol('adapters');
    const provider = createProviderCallbackRegistryProvider(adaptersToken) as FactoryProvider;

    expect(provider).toMatchObject({
      provide: ProviderCallbackRegistry,
      inject: [adaptersToken],
    });
    expect(provider.useFactory([])).toBeInstanceOf(ProviderCallbackRegistry);
  });

  it('creates an idempotency service provider bound to the supplied strategy token', () => {
    const strategiesToken = Symbol('strategies');
    const provider = createProviderIdempotencyServiceProvider(strategiesToken) as FactoryProvider;

    expect(provider).toMatchObject({
      provide: ProviderIdempotencyService,
      inject: [strategiesToken],
    });
    expect(provider.useFactory([])).toBeInstanceOf(ProviderIdempotencyService);
  });
});

type FactoryProvider = {
  provide: unknown;
  inject: unknown[];
  useFactory: (items: never[]) => unknown;
};
