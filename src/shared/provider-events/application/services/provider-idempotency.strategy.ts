import { StableJsonHasher } from '../../../common/stable-json-hasher.service';
import { CallbackSource, NormalizedCallbackEvent } from '../../domain/provider-callback-event';

export type ProviderIdempotency = {
  key: string;
  fingerprintHash: string;
  fingerprintFields: Record<string, unknown>;
};

export interface ProviderIdempotencyStrategy {
  readonly source: CallbackSource;
  readonly provider: string;
  build(event: NormalizedCallbackEvent): ProviderIdempotency;
}

export abstract class BaseProviderIdempotencyStrategy implements ProviderIdempotencyStrategy {
  abstract readonly source: CallbackSource;
  abstract readonly provider: string;

  constructor(private readonly hasher: StableJsonHasher) {}

  abstract build(event: NormalizedCallbackEvent): ProviderIdempotency;

  protected buildResult(
    providerKey: string | null,
    fallbackKeyParts: string[],
    fingerprintFields: Record<string, unknown>,
  ): ProviderIdempotency {
    return {
      key: (providerKey ? [providerKey] : fallbackKeyParts).join(':'),
      fingerprintHash: this.hasher.hash(fingerprintFields),
      fingerprintFields,
    };
  }
}
