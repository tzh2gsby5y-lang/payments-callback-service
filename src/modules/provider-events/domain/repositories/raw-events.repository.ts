import {
  CallbackSource,
  RawEvent,
  RawEventStatus,
} from '../../../../shared/provider-events/domain/provider-callback-event';

export const RAW_EVENTS_REPOSITORY = Symbol('RAW_EVENTS_REPOSITORY');

export type CreateRawEventInput = {
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
};

export interface RawEventsRepository {
  create(input: CreateRawEventInput): Promise<RawEvent>;
  updateStatus(
    id: string,
    status: RawEventStatus,
    responseStatus?: number,
    responseBody?: unknown,
  ): Promise<void>;
}
