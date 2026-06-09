import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { stableStringify } from '../../../../shared/common/canonical-json';
import { DomainError } from '../../../../shared/errors/domain-error';
import { StructuredLogger } from '../../../../shared/observability/structured-logger.service';
import { RawProviderCallbackInput } from '../../../../shared/provider-events/application/ports/provider-callback-adapter';
import { CallbackSources } from '../../../../shared/provider-events/domain/provider-callback-event';
import {
  GspWalletBusinessResult,
  GspWalletBusinessStatuses,
  GspWalletIntentStatuses,
  NormalizedGspWalletAction,
} from '../../domain/gsp-wallet-action';
import {
  GspWalletActionStore,
  GspWalletActionStoreInput,
  GSP_WALLET_ACTION_STORE,
} from '../gsp-wallet-action.store';
import { GspWalletProviderRegistry } from '../gsp-wallet-provider.registry';
import { GSP_LEDGER_PORT, GspLedgerPort, GspLedgerResult } from '../ports/gsp-ledger.port';

export type ExecuteGspWalletActionCommand = {
  provider: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  parsedBody: unknown;
};

export type ExecuteGspWalletActionResult = {
  statusCode: number;
  body: unknown;
};

@Injectable()
export class ExecuteGspWalletActionUseCase {
  private readonly providers: GspWalletProviderRegistry;
  private readonly store: GspWalletActionStore;
  private readonly ledger: GspLedgerPort;
  private readonly logger: StructuredLogger | undefined;

  constructor(
    providers: GspWalletProviderRegistry,
    @Inject(GSP_WALLET_ACTION_STORE) store: GspWalletActionStore,
    @Inject(GSP_LEDGER_PORT) ledger: GspLedgerPort,
    @Optional() logger?: StructuredLogger,
  ) {
    this.providers = providers;
    this.store = store;
    this.ledger = ledger;
    this.logger = logger;
  }

  async execute(command: ExecuteGspWalletActionCommand): Promise<ExecuteGspWalletActionResult> {
    const providerName = command.provider.toLowerCase();
    const input: RawProviderCallbackInput = {
      ...command,
      provider: providerName,
      source: CallbackSources.GSP,
      receivedAt: new Date(),
    };
    const provider = this.providers.get(providerName);
    const signature = await provider.verifySignature(input);

    if (!signature.valid) {
      this.logger?.warn('gsp_wallet_signature_rejected', {
        source: CallbackSources.GSP,
        provider: providerName,
        reason: signature.reason,
      });
      throw new DomainError('INVALID_WEBHOOK_SIGNATURE', 'Webhook signature is invalid', 401, {
        provider: providerName,
        reason: signature.reason,
      });
    }

    const action = provider.normalizeWalletAction(input);
    const idempotency = this.buildIdempotency(action);
    const ledgerCommandId = this.buildLedgerCommandId(action.brandId, idempotency.key);
    const storeInput: GspWalletActionStoreInput = {
      provider: providerName,
      headers: command.headers,
      rawBody: command.rawBody,
      parsedBody: command.parsedBody,
      action,
      idempotencyKey: idempotency.key,
      requestHash: idempotency.fingerprintHash,
      fingerprintFields: idempotency.fingerprintFields,
      ledgerCommandId,
    };
    const begin = await this.store.begin(storeInput);

    if (begin.kind === 'conflict') {
      this.logger?.warn('gsp_wallet_idempotency_conflict', {
        provider: providerName,
        brandId: action.brandId,
        idempotencyKey: idempotency.key,
        providerEventId: action.providerEventId,
        operation: action.operation,
      });
      throw new DomainError(
        'IDEMPOTENCY_PAYLOAD_MISMATCH',
        'Same idempotency key was used with a different wallet payload',
        409,
      );
    }

    if (begin.kind === 'duplicate_completed') {
      this.logger?.info('gsp_wallet_duplicate_replayed', {
        provider: providerName,
        brandId: action.brandId,
        idempotencyKey: idempotency.key,
        providerEventId: action.providerEventId,
        operation: action.operation,
      });
      return begin.response;
    }

    if (begin.kind === 'processing') {
      const cached = await this.waitForCachedResponse(
        begin.brandId,
        begin.provider,
        begin.idempotencyKey,
      );
      if (cached) {
        await this.store.recordDuplicateResponse(begin.rawEventId, cached);
        this.logger?.info('gsp_wallet_processing_duplicate_replayed', {
          provider: begin.provider,
          brandId: begin.brandId,
          idempotencyKey: begin.idempotencyKey,
          rawEventId: begin.rawEventId,
        });
        return cached;
      }

      this.logger?.warn('gsp_wallet_result_pending', {
        provider: begin.provider,
        brandId: begin.brandId,
        idempotencyKey: begin.idempotencyKey,
        rawEventId: begin.rawEventId,
      });
      throw new DomainError(
        'GSP_WALLET_RESULT_PENDING',
        'Original wallet action is still being processed',
        503,
      );
    }

    let ledgerResult: GspLedgerResult;
    let responseBody: unknown;
    try {
      ledgerResult = await this.ledger.execute({
        ledgerCommandId,
        operation: action.operation,
        brandId: action.brandId,
        provider: providerName,
        providerTransactionId: action.providerEventId,
        originalProviderTransactionId: action.originalProviderEventId,
        roundId: action.roundId,
        playerId: action.playerId,
        amount: action.amount,
        currency: action.currency,
      });
      const businessResult = this.toBusinessResult(
        action,
        providerName,
        idempotency.key,
        ledgerCommandId,
        ledgerResult,
      );
      responseBody = provider.serializeWalletResponse(businessResult);
    } catch (error) {
      this.logger?.error('gsp_wallet_ledger_failed', {
        provider: providerName,
        brandId: action.brandId,
        idempotencyKey: idempotency.key,
        providerEventId: action.providerEventId,
        operation: action.operation,
        error: this.serializeError(error),
      });
      const responseBody = {
        error: {
          code: 'GSP_LEDGER_UNAVAILABLE',
          message: 'Ledger execution failed',
          statusCode: 503,
        },
      };
      await this.store.fail({
        intentId: begin.intent.id,
        rawEventId: begin.intent.rawEventId,
        idempotencyKeyId: begin.intent.idempotencyKeyId,
        error: this.serializeError(error),
        responseStatus: 503,
        responseBody,
      });
      throw new DomainError('GSP_LEDGER_UNAVAILABLE', 'Ledger execution failed', 503);
    }

    await this.store.complete({
      intentId: begin.intent.id,
      rawEventId: begin.intent.rawEventId,
      idempotencyKeyId: begin.intent.idempotencyKeyId,
      ledgerResult,
      intentStatus:
        ledgerResult.status === GspWalletBusinessStatuses.APPROVED
          ? GspWalletIntentStatuses.LEDGER_SUCCEEDED
          : GspWalletIntentStatuses.LEDGER_DECLINED,
      responseStatus: 200,
      responseBody,
    });

    this.logger?.info('gsp_wallet_completed', {
      provider: providerName,
      brandId: action.brandId,
      idempotencyKey: idempotency.key,
      providerEventId: action.providerEventId,
      operation: action.operation,
      ledgerStatus: ledgerResult.status,
      rawEventId: begin.intent.rawEventId,
    });

    return {
      statusCode: 200,
      body: responseBody,
    };
  }

  private buildIdempotency(action: NormalizedGspWalletAction): {
    key: string;
    fingerprintHash: string;
    fingerprintFields: Record<string, unknown>;
  } {
    const key = `${action.provider}:${action.operation}:${action.providerEventId}`;
    const fingerprintFields = {
      provider: action.provider,
      providerEventId: action.providerEventId,
      operation: action.operation,
      roundId: action.roundId,
      playerId: action.playerId,
      amount: action.amount,
      currency: action.currency,
      originalProviderEventId: action.originalProviderEventId,
    };

    return {
      key,
      fingerprintHash: createHash('sha256')
        .update(stableStringify(fingerprintFields))
        .digest('hex'),
      fingerprintFields,
    };
  }

  private buildLedgerCommandId(brandId: string, idempotencyKey: string): string {
    return `gsp-wallet:${brandId}:${idempotencyKey}`;
  }

  private toBusinessResult(
    action: NormalizedGspWalletAction,
    provider: string,
    idempotencyKey: string,
    ledgerCommandId: string,
    ledgerResult: GspLedgerResult,
  ): GspWalletBusinessResult {
    const result: GspWalletBusinessResult = {
      status: ledgerResult.status,
      operation: action.operation,
      provider,
      brandId: action.brandId,
      playerId: action.playerId,
      providerTransactionId: action.providerEventId,
      walletTransactionId: ledgerResult.walletTransactionId,
      roundId: action.roundId,
      balance: ledgerResult.balance,
      currency: ledgerResult.currency,
      idempotencyKey,
      ledgerCommandId,
    };

    return {
      ...result,
      ...(ledgerResult.errorCode ? { errorCode: ledgerResult.errorCode } : {}),
      ...(ledgerResult.errorMessage ? { errorMessage: ledgerResult.errorMessage } : {}),
    };
  }

  private async waitForCachedResponse(
    brandId: string,
    provider: string,
    idempotencyKey: string,
  ): Promise<ExecuteGspWalletActionResult | null> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const cached = await this.store.findCachedResponse(brandId, provider, idempotencyKey);
      if (cached) {
        return cached;
      }
    }

    return null;
  }

  private serializeError(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
      };
    }

    return { message: String(error) };
  }
}
