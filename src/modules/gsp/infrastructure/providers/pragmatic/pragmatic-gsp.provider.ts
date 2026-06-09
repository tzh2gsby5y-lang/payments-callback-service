import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Env } from '../../../../../config/env.schema';
import { DomainError } from '../../../../../shared/errors/domain-error';
import {
  asNumberString,
  asRecord,
  asString,
  readHeader,
} from '../../../../../shared/common/header-utils';
import { CallbackSources } from '../../../../../shared/provider-events/domain/provider-callback-event';
import { GspProviders } from '../../../../../shared/provider-events/domain/provider-ids';
import {
  RawProviderCallbackInput,
  SignatureVerification,
} from '../../../../../shared/provider-events/application/ports/provider-callback-adapter';
import {
  GspWalletBusinessResult,
  GspWalletOperations,
  NormalizedGspWalletAction,
} from '../../../domain/gsp-wallet-action';
import { GspWalletProviderAdapter } from '../../../application/ports/gsp-wallet-provider-adapter';

@Injectable()
export class PragmaticGspProvider implements GspWalletProviderAdapter {
  readonly source = CallbackSources.GSP;
  readonly provider = GspProviders.PRAGMATIC;

  constructor(private readonly config: ConfigService<Env>) {}

  async verifySignature(input: RawProviderCallbackInput): Promise<SignatureVerification> {
    const secret = this.config.get('PRAGMATIC_WEBHOOK_SECRET', { infer: true });
    if (!secret) {
      const nodeEnv = this.config.get('NODE_ENV', { infer: true });
      return nodeEnv === 'production'
        ? { valid: false, mode: 'failed', reason: 'missing_pragmatic_secret' }
        : { valid: true, mode: 'skipped' };
    }

    const signature =
      readHeader(input.headers, 'x-pragmatic-signature') ??
      readHeader(input.headers, 'x-signature');
    if (!signature) {
      return { valid: false, mode: 'failed', reason: 'missing_pragmatic_signature' };
    }

    const digest = createHmac('sha256', secret).update(input.rawBody).digest('hex');
    const expectedBuffer = Buffer.from(signature, 'hex');
    const digestBuffer = Buffer.from(digest, 'hex');
    const valid =
      expectedBuffer.length === digestBuffer.length &&
      timingSafeEqual(expectedBuffer, digestBuffer);

    return valid
      ? { valid: true, mode: 'verified' }
      : { valid: false, mode: 'failed', reason: 'hmac_mismatch' };
  }

  normalizeWalletAction(input: RawProviderCallbackInput): NormalizedGspWalletAction {
    const payload = asRecord(input.parsedBody);
    const action = (asString(payload['action']) ?? asString(payload['type']))?.toLowerCase();
    const reference = asString(payload['reference']);
    const transactionId =
      reference ?? asString(payload['transactionId']) ?? asString(payload['txId']);
    const roundId = asString(payload['roundId']);
    const requestId = asString(payload['requestId']);
    const brandId = asString(payload['brandId']);
    const playerId = asString(payload['playerId']) ?? asString(payload['userId']);
    const operation = this.parseOperation(action);

    if (!operation || !brandId || !playerId || (!transactionId && !roundId && !requestId)) {
      throw new DomainError(
        'MALFORMED_PRAGMATIC_EVENT',
        'Pragmatic wallet callback is missing required fields',
        400,
      );
    }

    const amount = asNumberString(payload['amount']);
    const currency = asString(payload['currency'])?.toUpperCase() ?? 'EUR';
    if ((operation === 'bet' || operation === 'win') && (!amount || !currency)) {
      throw new DomainError(
        'MALFORMED_PRAGMATIC_EVENT',
        'Pragmatic wallet mutation is missing amount or currency',
        400,
      );
    }
    if (amount && !this.isPositiveMoney(amount)) {
      throw new DomainError(
        'MALFORMED_PRAGMATIC_EVENT',
        'Pragmatic wallet mutation amount must be a positive decimal value',
        400,
      );
    }

    const aggregateId = (roundId ?? transactionId ?? requestId) as string;
    const providerEventId =
      transactionId ??
      (roundId
        ? `${roundId}:${operation}:${requestId ?? 'no-request'}`
        : `${aggregateId}:${operation}`);
    const timestamp = asString(payload['timestamp']);

    return {
      source: CallbackSources.GSP,
      provider: this.provider,
      brandId,
      providerEventId,
      operation,
      roundId: roundId ?? null,
      aggregateId,
      occurredAt: timestamp ? new Date(timestamp) : null,
      amount,
      currency,
      playerId,
      originalProviderEventId:
        asString(payload['originalTransactionId']) ??
        asString(payload['originalReference']) ??
        asString(payload['originalTxId']),
      raw: input.parsedBody,
    };
  }

  serializeWalletResponse(result: GspWalletBusinessResult): unknown {
    return {
      status: result.status,
      action: result.operation,
      provider: result.provider,
      brandId: result.brandId,
      playerId: result.playerId,
      providerTransactionId: result.providerTransactionId,
      walletTransactionId: result.walletTransactionId,
      roundId: result.roundId,
      balance: result.balance,
      currency: result.currency,
      idempotencyKey: result.idempotencyKey,
      ...(result.errorCode
        ? { errorCode: result.errorCode, errorMessage: result.errorMessage }
        : {}),
    };
  }

  private parseOperation(
    action: string | undefined,
  ): NormalizedGspWalletAction['operation'] | null {
    if (
      action === GspWalletOperations.BALANCE ||
      action === GspWalletOperations.BET ||
      action === GspWalletOperations.WIN ||
      action === GspWalletOperations.ROLLBACK
    ) {
      return action;
    }

    return null;
  }

  private isPositiveMoney(amount: string): boolean {
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      return false;
    }

    return Number(amount) > 0;
  }
}
