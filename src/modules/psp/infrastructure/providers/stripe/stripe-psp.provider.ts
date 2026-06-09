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
import {
  CallbackSources,
  NormalizedCallbackEvent,
} from '../../../../../shared/provider-events/domain/provider-callback-event';
import { PspProviders } from '../../../../../shared/provider-events/domain/provider-ids';
import {
  ProviderCallbackAdapter,
  RawProviderCallbackInput,
  SignatureVerification,
} from '../../../../../shared/provider-events/application/ports/provider-callback-adapter';

@Injectable()
export class StripePspProvider implements ProviderCallbackAdapter {
  readonly source = CallbackSources.PSP;
  readonly provider = PspProviders.STRIPE;

  constructor(private readonly config: ConfigService<Env>) {}

  async verifySignature(input: RawProviderCallbackInput): Promise<SignatureVerification> {
    const secret = this.config.get('STRIPE_WEBHOOK_SECRET', { infer: true });
    if (!secret) {
      const nodeEnv = this.config.get('NODE_ENV', { infer: true });
      return nodeEnv === 'production'
        ? { valid: false, mode: 'failed', reason: 'missing_stripe_secret' }
        : { valid: true, mode: 'skipped' };
    }

    const signatureHeader = readHeader(input.headers, 'stripe-signature');
    if (!signatureHeader) {
      return { valid: false, mode: 'failed', reason: 'missing_stripe_signature' };
    }

    const timestamp = signatureHeader
      .split(',')
      .map((part) => part.trim())
      .find((part) => part.startsWith('t='))
      ?.slice(2);
    const expected = signatureHeader
      .split(',')
      .map((part) => part.trim())
      .find((part) => part.startsWith('v1='))
      ?.slice(3);

    if (!timestamp || !expected) {
      return { valid: false, mode: 'failed', reason: 'malformed_stripe_signature' };
    }

    const toleranceSeconds =
      this.config.get('STRIPE_SIGNATURE_TOLERANCE_SECONDS', { infer: true }) ?? 300;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const timestampSeconds = Number(timestamp);
    if (
      !Number.isFinite(timestampSeconds) ||
      Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds
    ) {
      return { valid: false, mode: 'failed', reason: 'stale_stripe_signature' };
    }

    const digest = createHmac('sha256', secret)
      .update(`${timestamp}.${input.rawBody}`)
      .digest('hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    const digestBuffer = Buffer.from(digest, 'hex');
    const valid =
      expectedBuffer.length === digestBuffer.length &&
      timingSafeEqual(expectedBuffer, digestBuffer);

    return valid
      ? { valid: true, mode: 'verified' }
      : { valid: false, mode: 'failed', reason: 'hmac_mismatch' };
  }

  normalize(input: RawProviderCallbackInput): NormalizedCallbackEvent {
    const payload = asRecord(input.parsedBody);
    const data = asRecord(payload['data']);
    const object = asRecord(data['object']);
    const metadata = asRecord(object['metadata']);

    const eventId = asString(payload['id']);
    const eventType = asString(payload['type']);
    const objectId = asString(object['id']);
    const brandId = asString(payload['brandId']) ?? asString(metadata['brandId']);

    if (!eventId || !eventType || !objectId || !brandId) {
      throw new DomainError(
        'MALFORMED_STRIPE_EVENT',
        'Stripe callback is missing required fields',
        400,
      );
    }

    const created =
      typeof payload['created'] === 'number' ? new Date(payload['created'] * 1000) : null;

    return {
      source: CallbackSources.PSP,
      provider: this.provider,
      brandId,
      providerEventId: eventId,
      eventType,
      aggregateType: 'payment',
      aggregateId: objectId,
      occurredAt: created,
      amount: asNumberString(object['amount']),
      currency: asString(object['currency'])?.toUpperCase() ?? null,
      playerId: asString(metadata['playerId']),
      raw: input.parsedBody,
    };
  }
}
