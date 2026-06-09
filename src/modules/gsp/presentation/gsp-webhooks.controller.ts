import { Body, Controller, Param, Post, Req, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiExtraModels,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { StructuredErrorResponseDto } from '../../../shared/errors/dto/structured-error-response.dto';
import { RequestWithCorrelation } from '../../../shared/observability/correlation-id.middleware';
import { GspProviders } from '../../../shared/provider-events/domain/provider-ids';
import { PragmaticWebhookPayloadDto } from '../../../shared/provider-events/presentation/dto/provider-webhook-docs.dto';
import { ExecuteGspWalletActionUseCase } from '../application/use-cases/execute-gsp-wallet-action.use-case';
import { GspWalletResponseDto } from './dto/gsp-wallet-response.dto';

@ApiTags('gsp')
@ApiExtraModels(PragmaticWebhookPayloadDto)
@Controller('/webhooks/gsp')
export class GspWebhooksController {
  private readonly executeWalletAction: ExecuteGspWalletActionUseCase;

  constructor(executeWalletAction: ExecuteGspWalletActionUseCase) {
    this.executeWalletAction = executeWalletAction;
  }

  @Post('/:provider')
  @ApiParam({ name: 'provider', enum: Object.values(GspProviders) })
  @ApiHeader({
    name: 'x-pragmatic-signature',
    required: false,
    description: 'Required when PRAGMATIC_WEBHOOK_SECRET is configured.',
  })
  @ApiHeader({
    name: 'x-signature',
    required: false,
    description: 'Fallback Pragmatic-like HMAC signature header.',
  })
  @ApiBody({
    schema: {
      allOf: [{ $ref: getSchemaPath(PragmaticWebhookPayloadDto) }],
      anyOf: [
        { required: ['reference'] },
        { required: ['transactionId'] },
        { required: ['txId'] },
        { required: ['roundId'] },
        { required: ['requestId'] },
      ],
    },
  })
  @ApiOkResponse({
    description: 'Wallet action was executed synchronously and a business result was returned.',
    type: GspWalletResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Malformed GSP provider payload.',
    type: StructuredErrorResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid provider signature.',
    type: StructuredErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Unsupported GSP provider.',
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
    const result = await this.executeWalletAction.execute({
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
