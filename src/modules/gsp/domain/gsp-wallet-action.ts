import { CallbackSources } from '../../../shared/provider-events/domain/provider-callback-event';

export const GspWalletOperations = {
  BALANCE: 'balance',
  BET: 'bet',
  WIN: 'win',
  ROLLBACK: 'rollback',
} as const;

export type GspWalletOperation = (typeof GspWalletOperations)[keyof typeof GspWalletOperations];

export const GspWalletIntentStatuses = {
  LEDGER_IN_FLIGHT: 'LEDGER_IN_FLIGHT',
  LEDGER_SUCCEEDED: 'LEDGER_SUCCEEDED',
  LEDGER_DECLINED: 'LEDGER_DECLINED',
  LEDGER_RETRYABLE_FAILURE: 'LEDGER_RETRYABLE_FAILURE',
  LEDGER_TIMEOUT_UNKNOWN: 'LEDGER_TIMEOUT_UNKNOWN',
  FAILED_FINAL: 'FAILED_FINAL',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
} as const;

export type GspWalletIntentStatus =
  (typeof GspWalletIntentStatuses)[keyof typeof GspWalletIntentStatuses];

export const GspWalletBusinessStatuses = {
  APPROVED: 'approved',
  DECLINED: 'declined',
} as const;

export type GspWalletBusinessStatus =
  (typeof GspWalletBusinessStatuses)[keyof typeof GspWalletBusinessStatuses];

export const GspWalletErrorCodes = {
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
  LEDGER_UNAVAILABLE: 'LEDGER_UNAVAILABLE',
} as const;

export type GspWalletErrorCode = (typeof GspWalletErrorCodes)[keyof typeof GspWalletErrorCodes];

export type NormalizedGspWalletAction = {
  source: typeof CallbackSources.GSP;
  provider: string;
  brandId: string;
  providerEventId: string;
  operation: GspWalletOperation;
  roundId: string | null;
  aggregateId: string;
  playerId: string;
  amount: string | null;
  currency: string | null;
  originalProviderEventId: string | null;
  occurredAt: Date | null;
  raw: unknown;
};

export type GspWalletBusinessResult = {
  status: GspWalletBusinessStatus;
  operation: GspWalletOperation;
  provider: string;
  brandId: string;
  playerId: string;
  providerTransactionId: string;
  walletTransactionId: string;
  roundId: string | null;
  balance: string;
  currency: string;
  idempotencyKey: string;
  ledgerCommandId: string;
  errorCode?: GspWalletErrorCode;
  errorMessage?: string;
};
