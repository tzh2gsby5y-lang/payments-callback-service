import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Env } from './config/env.schema';
import { AppModule } from './app.module';
import { setupOpenApi } from './openapi';
import { AppExceptionFilter } from './shared/errors/app-exception.filter';
import { CorrelationIdService } from './shared/observability/correlation-id.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService<Env>);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AppExceptionFilter(app.get(CorrelationIdService)));

  setupOpenApi(app);

  await app.listen(config.get('PORT', { infer: true }) ?? 3000);
}

void bootstrap();
