import {
  CallbackSources,
  NormalizedCallbackEvent,
} from '../../../shared/provider-events/domain/provider-callback-event';
import {
  ProviderWebhookHandoffState,
  ProviderWebhookResponseStatus,
} from '../../../shared/provider-events/domain/provider-webhook-response';

export const PROVIDER_EVENT_INGESTION_STORE = Symbol('PROVIDER_EVENT_INGESTION_STORE');

export type ProviderEventHandoffState = ProviderWebhookHandoffState;

export type ProviderEventIngestionResponseBody = {
  status: ProviderWebhookResponseStatus;
  eventId: string;
  provider: string;
  source: typeof CallbackSources.PSP;
  idempotencyKey: string;
  handoff: ProviderEventHandoffState;
  handoffId?: string;
};

export type ProviderEventIngestionStoreInput = {
  source: typeof CallbackSources.PSP;
  provider: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  parsedBody: unknown;
  normalized: NormalizedCallbackEvent & { source: typeof CallbackSources.PSP };
  idempotencyKey: string;
  requestHash: string;
  fingerprintFields: Record<string, unknown>;
};

export type ProviderEventIngestionStoreResult =
  | {
      kind: 'accepted';
      statusCode: 202;
      body: ProviderEventIngestionResponseBody;
    }
  | {
      kind: 'duplicate';
      statusCode: 200 | 202;
      body: ProviderEventIngestionResponseBody;
    }
  | {
      kind: 'conflict';
    };

export interface ProviderEventIngestionStore {
  persist(input: ProviderEventIngestionStoreInput): Promise<ProviderEventIngestionStoreResult>;
}
