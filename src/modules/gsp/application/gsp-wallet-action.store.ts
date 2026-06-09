import {
  GspWalletIntentStatus,
  GspWalletIntentStatuses,
  NormalizedGspWalletAction,
} from '../domain/gsp-wallet-action';

export const GSP_WALLET_ACTION_STORE = Symbol('GSP_WALLET_ACTION_STORE');

export type GspWalletActionStoreInput = {
  provider: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  parsedBody: unknown;
  action: NormalizedGspWalletAction;
  idempotencyKey: string;
  requestHash: string;
  fingerprintFields: Record<string, unknown>;
  ledgerCommandId: string;
};

export type GspWalletIntentRecord = {
  id: string;
  rawEventId: string;
  idempotencyKeyId: string;
  ledgerCommandId: string;
  attemptCount: number;
};

export type GspWalletCachedResponse = {
  statusCode: number;
  body: unknown;
};

export type GspWalletActionBeginResult =
  | { kind: 'new'; intent: GspWalletIntentRecord }
  | { kind: 'duplicate_completed'; response: GspWalletCachedResponse }
  | {
      kind: 'processing';
      rawEventId: string;
      brandId: string;
      provider: string;
      idempotencyKey: string;
    }
  | { kind: 'conflict' };

export type GspWalletActionCompletion = {
  intentId: string;
  rawEventId: string;
  idempotencyKeyId: string;
  ledgerResult: unknown;
  intentStatus: Extract<
    GspWalletIntentStatus,
    | typeof GspWalletIntentStatuses.LEDGER_SUCCEEDED
    | typeof GspWalletIntentStatuses.LEDGER_DECLINED
    | typeof GspWalletIntentStatuses.LEDGER_RETRYABLE_FAILURE
  >;
  responseStatus: number;
  responseBody: unknown;
};

export type GspWalletActionFailure = {
  intentId: string;
  rawEventId: string;
  idempotencyKeyId: string;
  error: unknown;
  responseStatus: number;
  responseBody: unknown;
};

export interface GspWalletActionStore {
  begin(input: GspWalletActionStoreInput): Promise<GspWalletActionBeginResult>;
  complete(completion: GspWalletActionCompletion): Promise<void>;
  fail(failure: GspWalletActionFailure): Promise<void>;
  findCachedResponse(
    brandId: string,
    provider: string,
    idempotencyKey: string,
  ): Promise<GspWalletCachedResponse | null>;
  recordDuplicateResponse(rawEventId: string, response: GspWalletCachedResponse): Promise<void>;
}
