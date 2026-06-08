export const CallbackSources = {
  PSP: 'psp',
  GSP: 'gsp',
} as const;

export type CallbackSource = (typeof CallbackSources)[keyof typeof CallbackSources];

export const RawEventStatuses = {
  RECEIVED: 'RECEIVED',
  ACCEPTED: 'ACCEPTED',
  DUPLICATE: 'DUPLICATE',
  CONFLICT: 'CONFLICT',
  COMPLETED: 'COMPLETED',
  FAILED_RETRYABLE: 'FAILED_RETRYABLE',
  FAILED_FINAL: 'FAILED_FINAL',
} as const;

export type RawEventStatus = (typeof RawEventStatuses)[keyof typeof RawEventStatuses];

export const IdempotencyStatuses = {
  PROCESSING: 'PROCESSING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED_RETRYABLE: 'FAILED_RETRYABLE',
  FAILED_FINAL: 'FAILED_FINAL',
} as const;

export type IdempotencyStatus =
  (typeof IdempotencyStatuses)[keyof typeof IdempotencyStatuses];

export type NormalizedCallbackEvent = {
  source: CallbackSource;
  provider: string;
  brandId: string;
  providerEventId: string;
  eventType: string;
  aggregateType: 'payment' | 'game_round';
  aggregateId: string;
  occurredAt: Date | null;
  amount: string | null;
  currency: string | null;
  playerId: string | null;
  raw: unknown;
};

export type RawEvent = {
  id: string;
  brandId: string;
  source: CallbackSource;
  provider: string;
  providerEventId: string;
  idempotencyKey: string;
  eventType: string;
  status: RawEventStatus;
  signatureValid: boolean;
  requestHash: string;
  headers: Record<string, unknown>;
  rawBody: string;
  parsedBody: unknown;
  normalizedBody: unknown;
  responseStatus: number | null;
  responseBody: unknown;
  receivedAt: Date;
  updatedAt: Date;
};

export type IdempotencyRecord = {
  id: string;
  brandId: string;
  source: CallbackSource;
  provider: string;
  key: string;
  rawEventId: string;
  requestHash: string;
  status: IdempotencyStatus;
  responseStatus: number | null;
  responseBody: unknown;
  createdAt: Date;
  updatedAt: Date;
};
