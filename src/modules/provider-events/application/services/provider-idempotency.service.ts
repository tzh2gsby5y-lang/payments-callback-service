import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../../shared/errors/domain-error';
import {
  ProviderIdempotency,
  ProviderIdempotencyStrategy,
} from '../../../../shared/provider-events/application/services/provider-idempotency.strategy';
import {
  CallbackSource,
  NormalizedCallbackEvent,
} from '../../../../shared/provider-events/domain/provider-callback-event';

@Injectable()
export class ProviderIdempotencyService {
  private readonly strategies = new Map<string, ProviderIdempotencyStrategy>();

  constructor(strategies: ProviderIdempotencyStrategy[]) {
    for (const strategy of strategies) {
      this.strategies.set(this.makeKey(strategy.source, strategy.provider), strategy);
    }
  }

  build(event: NormalizedCallbackEvent): ProviderIdempotency {
    const strategy = this.strategies.get(this.makeKey(event.source, event.provider));

    if (!strategy) {
      throw new DomainError(
        'UNSUPPORTED_IDEMPOTENCY_STRATEGY',
        'Unsupported idempotency strategy',
        500,
        {
          source: event.source,
          provider: event.provider,
        },
      );
    }

    return strategy.build(event);
  }

  private makeKey(source: CallbackSource, provider: string): string {
    return `${source}:${provider.toLowerCase()}`;
  }
}
