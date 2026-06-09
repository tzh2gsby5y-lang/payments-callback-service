import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CallbackSources } from '../../domain/provider-callback-event';
import { PspProviders } from '../../domain/provider-ids';
import {
  ProviderWebhookHandoffState,
  ProviderWebhookHandoffStates,
  ProviderWebhookResponseStatus,
  ProviderWebhookResponseStatuses,
} from '../../domain/provider-webhook-response';

export class ProviderWebhookResponseDto {
  @ApiProperty({
    enum: Object.values(ProviderWebhookResponseStatuses),
    example: ProviderWebhookResponseStatuses.ACCEPTED,
  })
  status!: ProviderWebhookResponseStatus;

  @ApiProperty({ format: 'uuid', example: '7d63fdd7-7708-4753-8ad6-f00e9b3300ad' })
  eventId!: string;

  @ApiProperty({ example: PspProviders.STRIPE })
  provider!: string;

  @ApiProperty({ enum: [CallbackSources.PSP], example: CallbackSources.PSP })
  source!: typeof CallbackSources.PSP;

  @ApiProperty({ example: `${PspProviders.STRIPE}:evt_demo_1` })
  idempotencyKey!: string;

  @ApiProperty({
    enum: Object.values(ProviderWebhookHandoffStates),
    example: ProviderWebhookHandoffStates.PENDING_EVALUATION,
  })
  handoff!: ProviderWebhookHandoffState;

  @ApiPropertyOptional({ format: 'uuid', example: '5df1d3e6-206f-4543-ae2f-6975140341da' })
  handoffId?: string;
}

export class StripeMetadataDto {
  @ApiProperty({ example: 'brandA' })
  brandId!: string;

  @ApiPropertyOptional({ example: 'player-1' })
  playerId?: string;
}

export class StripePaymentObjectDto {
  @ApiProperty({ example: 'pi_demo_1' })
  id!: string;

  @ApiPropertyOptional({ oneOf: [{ type: 'number' }, { type: 'string' }], example: 2500 })
  amount?: number | string;

  @ApiPropertyOptional({ example: 'usd' })
  currency?: string;

  @ApiPropertyOptional({ type: () => StripeMetadataDto })
  metadata?: StripeMetadataDto;
}

export class StripeWebhookDataDto {
  @ApiProperty({ type: () => StripePaymentObjectDto })
  object!: StripePaymentObjectDto;
}

export class StripeWebhookPayloadDto {
  @ApiProperty({ example: 'evt_demo_1' })
  id!: string;

  @ApiPropertyOptional({ example: 'event' })
  object?: string;

  @ApiProperty({ example: 'payment_intent.succeeded' })
  type!: string;

  @ApiPropertyOptional({ example: 1735689600 })
  created?: number;

  @ApiPropertyOptional({
    example: 'brandA',
    description: 'Optional top-level tenant id; data.object.metadata.brandId is also supported.',
  })
  brandId?: string;

  @ApiProperty({ type: () => StripeWebhookDataDto })
  data!: StripeWebhookDataDto;
}

export class PragmaticWebhookPayloadDto {
  @ApiProperty({ example: 'brandA' })
  brandId!: string;

  @ApiPropertyOptional({
    example: 'req-1',
    description:
      'Retry/request identifier. At least one event identity field is expected: reference, transactionId, txId, roundId, or requestId.',
  })
  requestId?: string;

  @ApiPropertyOptional({ example: 'ref-1' })
  reference?: string;

  @ApiPropertyOptional({ example: 'txn-1' })
  transactionId?: string;

  @ApiPropertyOptional({ example: 'txn-1' })
  txId?: string;

  @ApiPropertyOptional({ example: 'round-1' })
  roundId?: string;

  @ApiProperty({ example: 'bet', description: '`type` is also accepted as a provider fallback.' })
  action!: string;

  @ApiPropertyOptional({ example: 'bet' })
  type?: string;

  @ApiProperty({ example: 'player-1', description: '`userId` is also accepted as a fallback.' })
  playerId!: string;

  @ApiPropertyOptional({ example: 'player-1' })
  userId?: string;

  @ApiPropertyOptional({ example: 'game-demo' })
  gameId?: string;

  @ApiPropertyOptional({ oneOf: [{ type: 'number' }, { type: 'string' }], example: '10.00' })
  amount?: number | string;

  @ApiPropertyOptional({ example: 'EUR' })
  currency?: string;

  @ApiPropertyOptional({ format: 'date-time', example: '2026-06-08T12:00:00.000Z' })
  timestamp?: string;
}
