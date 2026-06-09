import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { OpenAPIObject } from '@nestjs/swagger';
import { HealthController } from '../../src/health.controller';
import { createOpenApiDocument } from '../../src/openapi';
import { GetProfileUseCase } from '../../src/modules/identity/application/use-cases/get-profile.use-case';
import { LoginUserUseCase } from '../../src/modules/identity/application/use-cases/login-user.use-case';
import { PasswordHasher } from '../../src/modules/identity/application/password-hasher';
import { RegisterUserUseCase } from '../../src/modules/identity/application/use-cases/register-user.use-case';
import { SessionTokenService } from '../../src/modules/identity/application/session-token.service';
import { SESSIONS_REPOSITORY } from '../../src/modules/identity/domain/repositories/sessions.repository';
import { USERS_REPOSITORY } from '../../src/modules/identity/domain/repositories/users.repository';
import { IdentityController } from '../../src/modules/identity/presentation/identity.controller';
import { SessionAuthGuard } from '../../src/modules/identity/presentation/session-auth.guard';
import { IngestPspCallbackUseCase } from '../../src/modules/psp/application/use-cases/ingest-psp-callback.use-case';
import { PspWebhooksController } from '../../src/modules/psp/presentation/psp-webhooks.controller';
import {
  componentSchema,
  getRequestBodySchemaRef,
  getResponseSchemaRef,
  noopUseCase,
} from '../support/openapi-contract-helpers';

@Module({
  controllers: [HealthController, IdentityController, PspWebhooksController],
  providers: [
    PasswordHasher,
    SessionAuthGuard,
    SessionTokenService,
    { provide: USERS_REPOSITORY, useValue: {} },
    { provide: SESSIONS_REPOSITORY, useValue: {} },
    { provide: RegisterUserUseCase, useValue: noopUseCase },
    { provide: LoginUserUseCase, useValue: noopUseCase },
    { provide: GetProfileUseCase, useValue: noopUseCase },
    { provide: IngestPspCallbackUseCase, useValue: noopUseCase },
  ],
})
class PspWebhookContractOpenApiModule {}

describe('PSP webhook payload OpenAPI contract', () => {
  let document: OpenAPIObject;

  beforeAll(async () => {
    const app = await NestFactory.create(PspWebhookContractOpenApiModule, { logger: false });
    document = createOpenApiDocument(app);
    await app.close();
  });

  it('documents Stripe-like callbacks as asynchronous provider-event ingestion', () => {
    const requestSchema = getRequestBodySchemaRef(document, '/webhooks/psp/{provider}');
    const acceptedSchema = getResponseSchemaRef(document, '/webhooks/psp/{provider}', '202');
    const duplicateSchema = getResponseSchemaRef(document, '/webhooks/psp/{provider}', '200');
    const stripePayloadSchema = componentSchema(document, 'StripeWebhookPayloadDto');
    const stripeDataSchema = componentSchema(document, 'StripeWebhookDataDto');
    const stripePaymentSchema = componentSchema(document, 'StripePaymentObjectDto');
    const responseSchema = componentSchema(document, 'ProviderWebhookResponseDto');

    expect(requestSchema.$ref).toBe('#/components/schemas/StripeWebhookPayloadDto');
    expect(acceptedSchema.$ref).toBe('#/components/schemas/ProviderWebhookResponseDto');
    expect(duplicateSchema.$ref).toBe('#/components/schemas/ProviderWebhookResponseDto');
    expect(stripePayloadSchema.required).toEqual(['id', 'type', 'data']);
    expect(stripeDataSchema.required).toEqual(['object']);
    expect(stripePaymentSchema.required).toEqual(['id']);
    expect(responseSchema.required).toEqual(
      expect.arrayContaining([
        'status',
        'eventId',
        'provider',
        'source',
        'idempotencyKey',
        'handoff',
      ]),
    );
    expect(responseSchema.properties?.['source']?.enum).toEqual(['psp']);
  });
});
