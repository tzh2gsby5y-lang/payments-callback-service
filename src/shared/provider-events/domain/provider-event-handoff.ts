import { CallbackSources } from './provider-callback-event';

export const ProviderEventHandoffStatuses = {
  PENDING_EVALUATION: 'PENDING_EVALUATION',
  EVALUATING: 'EVALUATING',
  EVALUATED_NOOP: 'EVALUATED_NOOP',
  READY_FOR_LEDGER: 'READY_FOR_LEDGER',
  DISPATCHING: 'DISPATCHING',
  DISPATCHED: 'DISPATCHED',
  FAILED_RETRYABLE: 'FAILED_RETRYABLE',
  FAILED_FINAL: 'FAILED_FINAL',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
} as const;

export type ProviderEventHandoffStatus =
  (typeof ProviderEventHandoffStatuses)[keyof typeof ProviderEventHandoffStatuses];

export type ProviderEventHandoff = {
  id: string;
  brandId: string;
  source: typeof CallbackSources.PSP;
  provider: string;
  rawEventId: string;
  idempotencyKey: string;
  providerEventId: string;
  eventType: string;
  aggregateType: 'payment' | 'game_round';
  aggregateId: string;
  playerId: string | null;
  amount: string | null;
  currency: string | null;
  status: ProviderEventHandoffStatus;
  payload: unknown;
  attemptCount: number;
  nextAttemptAt: Date | null;
  lastError: unknown;
  createdAt: Date;
  updatedAt: Date;
};
