import { Injectable } from '@nestjs/common';
import { StableJsonHasher } from '../../../../../shared/common/stable-json-hasher.service';
import {
  CallbackSources,
  NormalizedCallbackEvent,
} from '../../../../../shared/provider-events/domain/provider-callback-event';
import { PspProviders } from '../../../../../shared/provider-events/domain/provider-ids';
import {
  BaseProviderIdempotencyStrategy,
  ProviderIdempotency,
} from '../../../../../shared/provider-events/application/services/provider-idempotency.strategy';

@Injectable()
export class StripeIdempotencyStrategy extends BaseProviderIdempotencyStrategy {
  readonly source = CallbackSources.PSP;
  readonly provider = PspProviders.STRIPE;

  constructor(hasher: StableJsonHasher) {
    super(hasher);
  }

  build(event: NormalizedCallbackEvent): ProviderIdempotency {
    return this.buildResult(
      `${PspProviders.STRIPE}:${event.providerEventId}`,
      [PspProviders.STRIPE, event.eventType, event.aggregateId],
      {
        provider: event.provider,
        providerEventId: event.providerEventId,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        amount: event.amount,
        currency: event.currency,
        playerId: event.playerId,
      },
    );
  }
}
