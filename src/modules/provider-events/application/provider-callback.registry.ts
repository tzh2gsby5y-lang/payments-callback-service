import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../shared/errors/domain-error';
import { ProviderCallbackAdapter } from '../../../shared/provider-events/application/ports/provider-callback-adapter';
import { CallbackSource } from '../../../shared/provider-events/domain/provider-callback-event';

@Injectable()
export class ProviderCallbackRegistry {
  private readonly adapters = new Map<string, ProviderCallbackAdapter>();

  constructor(adapters: ProviderCallbackAdapter[]) {
    for (const adapter of adapters) {
      this.adapters.set(this.makeKey(adapter.source, adapter.provider), adapter);
    }
  }

  get(source: CallbackSource, provider: string): ProviderCallbackAdapter {
    const adapter = this.adapters.get(this.makeKey(source, provider.toLowerCase()));

    if (!adapter) {
      throw new DomainError('UNSUPPORTED_PROVIDER', `Unsupported ${source} provider`, 404, {
        provider,
      });
    }

    return adapter;
  }

  private makeKey(source: CallbackSource, provider: string): string {
    return `${source}:${provider.toLowerCase()}`;
  }
}
