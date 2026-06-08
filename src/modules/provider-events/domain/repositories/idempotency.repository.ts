import {
  CallbackSource,
  IdempotencyRecord,
  IdempotencyStatus,
} from '../../../../shared/provider-events/domain/provider-callback-event';

// Domain repository token: idempotency is a domain safety boundary, while the concrete storage
// can be replaced by changing the Nest provider binding.
export const IDEMPOTENCY_REPOSITORY = Symbol('IDEMPOTENCY_REPOSITORY');

export type ClaimIdempotencyInput = {
  brandId: string;
  source: CallbackSource;
  provider: string;
  key: string;
  rawEventId: string;
  requestHash: string;
};

export type IdempotencyClaimResult =
  | { kind: 'new'; record: IdempotencyRecord }
  | { kind: 'duplicate'; record: IdempotencyRecord }
  | { kind: 'conflict'; record: IdempotencyRecord };

export interface IdempotencyRepository {
  claim(input: ClaimIdempotencyInput): Promise<IdempotencyClaimResult>;
  markCompleted(
    id: string,
    status: Extract<IdempotencyStatus, 'SUCCEEDED' | 'FAILED_FINAL'>,
    responseStatus: number,
    responseBody: unknown,
  ): Promise<void>;
}
