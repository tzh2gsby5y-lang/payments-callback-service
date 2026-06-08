import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function createOpenApiDocument(app: INestApplication) {
  const documentConfig = new DocumentBuilder()
    .setTitle('PSP/GSP Callback MVP')
    .setDescription('Identity, safe webhook ingestion, idempotency, and tenant isolation.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  return SwaggerModule.createDocument(app, documentConfig);
}

export function setupOpenApi(app: INestApplication): void {
  SwaggerModule.setup('/docs', app, createOpenApiDocument(app));
}
