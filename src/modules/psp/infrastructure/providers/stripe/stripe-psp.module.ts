import { Module } from '@nestjs/common';
import { StableJsonHasher } from '../../../../../shared/common/stable-json-hasher.service';
import { StripeIdempotencyStrategy } from './stripe-idempotency.strategy';
import { StripePspProvider } from './stripe-psp.provider';

@Module({
  providers: [StableJsonHasher, StripePspProvider, StripeIdempotencyStrategy],
  exports: [StripePspProvider, StripeIdempotencyStrategy],
})
export class StripePspModule {}
