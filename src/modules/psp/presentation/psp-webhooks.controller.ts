import { Body, Controller, Param, Post, Req, Res } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { StructuredErrorResponseDto } from '../../../shared/errors/dto/structured-error-response.dto';
import { RequestWithCorrelation } from '../../../shared/observability/correlation-id.middleware';
import {
  ProviderWebhookResponseDto,
  StripeWebhookPayloadDto,
} from '../../../shared/provider-events/presentation/dto/provider-webhook-docs.dto';
import { PspProviders } from '../../../shared/provider-events/domain/provider-ids';
import { IngestPspCallbackUseCase } from '../application/use-cases/ingest-psp-callback.use-case';

@ApiTags('psp')
@Controller('/webhooks/psp')
export class PspWebhooksController {
  constructor(private readonly ingestPspCallback: IngestPspCallbackUseCase) {}

  @Post('/:provider')
  @ApiParam({ name: 'provider', enum: Object.values(PspProviders) })
  @ApiHeader({
    name: 'stripe-signature',
    required: false,
    description: 'Required when STRIPE_WEBHOOK_SECRET is configured.',
  })
  @ApiBody({ type: StripeWebhookPayloadDto })
  @ApiAcceptedResponse({
    description: 'Callback was verified, persisted, deduplicated, and queued for evaluation.',
    type: ProviderWebhookResponseDto,
  })
  @ApiOkResponse({
    description: 'Duplicate callback was acknowledged without creating a second handoff.',
    type: ProviderWebhookResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Malformed PSP provider payload.',
    type: StructuredErrorResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid provider signature.',
    type: StructuredErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Unsupported PSP provider.',
    type: StructuredErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'Same provider idempotency key was reused with different semantic payload.',
    type: StructuredErrorResponseDto,
  })
  async handle(
    @Param('provider') provider: string,
    @Body() body: unknown,
    @Req() request: RequestWithCorrelation & Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.ingestPspCallback.execute({
      provider,
      headers: request.headers,
      rawBody: this.getRawBody(request, body),
      parsedBody: body,
    });

    response.status(result.statusCode);
    return result.body;
  }

  private getRawBody(request: RequestWithCorrelation, body: unknown): string {
    return request.rawBody?.toString('utf8') ?? JSON.stringify(body);
  }
}
