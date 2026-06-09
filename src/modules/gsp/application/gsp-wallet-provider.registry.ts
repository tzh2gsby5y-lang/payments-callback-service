import { DomainError } from '../../../shared/errors/domain-error';
import { GspWalletProviderAdapter } from './ports/gsp-wallet-provider-adapter';

export class GspWalletProviderRegistry {
  private readonly adapters: Map<string, GspWalletProviderAdapter>;

  constructor(adapters: GspWalletProviderAdapter[]) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.provider, adapter]));
  }

  get(provider: string): GspWalletProviderAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new DomainError('UNSUPPORTED_PROVIDER', `Unsupported GSP provider: ${provider}`, 404);
    }

    return adapter;
  }
}
