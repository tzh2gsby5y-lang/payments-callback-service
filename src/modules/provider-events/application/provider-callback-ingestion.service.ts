import { Inject, Injectable, Optional } from '@nestjs/common';
import { DomainError } from '../../../shared/errors/domain-error';
import { StructuredLogger } from '../../../shared/observability/structured-logger.service';
import { CallbackSources } from '../../../shared/provider-events/domain/provider-callback-event';
import {
  PROVIDER_EVENT_INGESTION_STORE,
  ProviderEventIngestionStore,
} from './provider-event-ingestion.store';
import {
  ProviderWebhookHandoffState,
  ProviderWebhookResponseStatus,
} from '../../../shared/provider-events/domain/provider-webhook-response';
import { ProviderCallbackRegistry } from './provider-callback.registry';
import { ProviderIdempotencyService } from './services/provider-idempotency.service';
import { RawProviderCallbackInput } from '../../../shared/provider-events/application/ports/provider-callback-adapter';

export type ProviderCallbackIngestionCommand = {
  source: typeof CallbackSources.PSP;
  provider: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  parsedBody: unknown;
};

export type ProviderCallbackIngestionResult = {
  statusCode: number;
  body: {
    status: ProviderWebhookResponseStatus;
    eventId: string;
    provider: string;
    source: typeof CallbackSources.PSP;
    idempotencyKey: string;
    handoff: ProviderWebhookHandoffState;
    handoffId?: string;
  };
};

@Injectable()
export class ProviderCallbackIngestionService {
  private readonly adapters: ProviderCallbackRegistry;
  private readonly providerIdempotency: ProviderIdempotencyService;
  private readonly ingestionStore: ProviderEventIngestionStore;
  private readonly logger: StructuredLogger | undefined;

  constructor(
    adapters: ProviderCallbackRegistry,
    providerIdempotency: ProviderIdempotencyService,
    @Inject(PROVIDER_EVENT_INGESTION_STORE)
    ingestionStore: ProviderEventIngestionStore,
    @Optional() logger?: StructuredLogger,
  ) {
    this.adapters = adapters;
    this.providerIdempotency = providerIdempotency;
    this.ingestionStore = ingestionStore;
    this.logger = logger;
  }

  async ingest(
    command: ProviderCallbackIngestionCommand,
  ): Promise<ProviderCallbackIngestionResult> {
    const provider = command.provider.toLowerCase();
    const input: RawProviderCallbackInput = {
      ...command,
      provider,
      receivedAt: new Date(),
    };
    const adapter = this.adapters.get(command.source, provider);
    const signature = await adapter.verifySignature(input);

    if (!signature.valid) {
      this.logger?.warn('psp_callback_signature_rejected', {
        source: command.source,
        provider,
        reason: signature.reason,
      });
      throw new DomainError('INVALID_WEBHOOK_SIGNATURE', 'Webhook signature is invalid', 401, {
        provider,
        reason: signature.reason,
      });
    }

    const normalized = adapter.normalize(input);
    if (normalized.source !== CallbackSources.PSP) {
      this.logger?.error('psp_callback_source_mismatch', {
        provider,
        normalizedSource: normalized.source,
      });
      throw new DomainError(
        'PROVIDER_SOURCE_MISMATCH',
        'PSP ingestion received a non-PSP normalized event',
        500,
        { source: normalized.source, provider },
      );
    }

    const pspNormalized = normalized as typeof normalized & { source: typeof CallbackSources.PSP };
    const idempotency = this.providerIdempotency.build(pspNormalized);

    const result = await this.ingestionStore.persist({
      source: command.source,
      provider,
      headers: command.headers,
      rawBody: command.rawBody,
      parsedBody: command.parsedBody,
      normalized: pspNormalized,
      idempotencyKey: idempotency.key,
      requestHash: idempotency.fingerprintHash,
      fingerprintFields: idempotency.fingerprintFields,
    });

    if (result.kind === 'conflict') {
      this.logger?.warn('psp_callback_idempotency_conflict', {
        provider,
        brandId: pspNormalized.brandId,
        idempotencyKey: idempotency.key,
        providerEventId: pspNormalized.providerEventId,
      });
      throw new DomainError(
        'IDEMPOTENCY_PAYLOAD_MISMATCH',
        'Same idempotency key was used with a different payload',
        409,
      );
    }

    this.logger?.info('psp_callback_ingested', {
      provider,
      brandId: pspNormalized.brandId,
      eventId: result.body.eventId,
      providerEventId: pspNormalized.providerEventId,
      status: result.body.status,
      handoff: result.body.handoff,
    });

    return {
      statusCode: result.statusCode,
      body: result.body,
    };
  }
}
