import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { OpenAPIObject } from '@nestjs/swagger';
import { HealthController } from '../../src/health.controller';
import { createOpenApiDocument } from '../../src/openapi';
import { ExecuteGspWalletActionUseCase } from '../../src/modules/gsp/application/use-cases/execute-gsp-wallet-action.use-case';
import { GspWebhooksController } from '../../src/modules/gsp/presentation/gsp-webhooks.controller';
import {
  componentSchema,
  getRequestBodySchemaRef,
  getResponseSchemaRef,
  noopUseCase,
} from '../support/openapi-contract-helpers';

@Module({
  controllers: [HealthController, GspWebhooksController],
  providers: [{ provide: ExecuteGspWalletActionUseCase, useValue: noopUseCase }],
})
class GspWebhookContractOpenApiModule {}

describe('GSP webhook payload OpenAPI contract', () => {
  let document: OpenAPIObject;

  beforeAll(async () => {
    const app = await NestFactory.create(GspWebhookContractOpenApiModule, { logger: false });
    document = createOpenApiDocument(app);
    await app.close();
  });

  it('documents Pragmatic-like callbacks as synchronous wallet actions', () => {
    const requestSchema = getRequestBodySchemaRef(document, '/webhooks/gsp/{provider}');
    const okSchema = getResponseSchemaRef(document, '/webhooks/gsp/{provider}', '200');
    const conflictSchema = getResponseSchemaRef(document, '/webhooks/gsp/{provider}', '409');
    const pragmaticPayloadSchema = componentSchema(document, 'PragmaticWebhookPayloadDto');
    const responseSchema = componentSchema(document, 'GspWalletResponseDto');

    expect(requestSchema.allOf?.[0]?.$ref).toBe('#/components/schemas/PragmaticWebhookPayloadDto');
    expect(requestSchema.anyOf).toEqual([
      { required: ['reference'] },
      { required: ['transactionId'] },
      { required: ['txId'] },
      { required: ['roundId'] },
      { required: ['requestId'] },
    ]);
    expect(okSchema.$ref).toBe('#/components/schemas/GspWalletResponseDto');
    expect(conflictSchema.$ref).toBe('#/components/schemas/StructuredErrorResponseDto');
    expect(document.paths['/webhooks/gsp/{provider}']?.post?.responses['202']).toBeUndefined();
    expect(pragmaticPayloadSchema.required).toEqual(['brandId', 'action', 'playerId']);
    expect(responseSchema.required).toEqual(
      expect.arrayContaining([
        'status',
        'action',
        'provider',
        'brandId',
        'playerId',
        'providerTransactionId',
        'walletTransactionId',
        'balance',
        'currency',
        'idempotencyKey',
      ]),
    );
    expect(responseSchema.properties?.['handoff']).toBeUndefined();
  });
});
