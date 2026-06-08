import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { AppExceptionFilter } from '../../src/shared/errors/app-exception.filter';
import { CorrelationIdService } from '../../src/shared/observability/correlation-id.service';
import { GSP_LEDGER_PORT } from '../../src/modules/gsp/application/ports/gsp-ledger.port';
import { setupOpenApi } from '../../src/openapi';

export type TypeOrmTestAppContext = {
  app: INestApplication;
  container: StartedPostgreSqlContainer;
  dataSource: DataSource;
  close: () => Promise<void>;
  resetDatabase: () => Promise<void>;
};

export type TypeOrmTestingAppOptions = {
  config?: Partial<
    Record<
      'STRIPE_WEBHOOK_SECRET' | 'STRIPE_SIGNATURE_TOLERANCE_SECONDS' | 'PRAGMATIC_WEBHOOK_SECRET',
      string
    >
  >;
  setupOpenApi?: boolean;
};

type SavedEnv = Partial<
  Record<
    | 'NODE_ENV'
    | 'DATABASE_URL'
    | 'DB_SYNCHRONIZE'
    | 'SESSION_TTL_SECONDS'
    | 'STRIPE_WEBHOOK_SECRET'
    | 'STRIPE_SIGNATURE_TOLERANCE_SECONDS'
    | 'PRAGMATIC_WEBHOOK_SECRET',
    string | undefined
  >
>;

export async function createTypeOrmTestingApp(
  options: TypeOrmTestingAppOptions = {},
): Promise<TypeOrmTestAppContext> {
  const savedEnv: SavedEnv = {
    NODE_ENV: process.env['NODE_ENV'],
    DATABASE_URL: process.env['DATABASE_URL'],
    DB_SYNCHRONIZE: process.env['DB_SYNCHRONIZE'],
    SESSION_TTL_SECONDS: process.env['SESSION_TTL_SECONDS'],
    STRIPE_WEBHOOK_SECRET: process.env['STRIPE_WEBHOOK_SECRET'],
    STRIPE_SIGNATURE_TOLERANCE_SECONDS: process.env['STRIPE_SIGNATURE_TOLERANCE_SECONDS'],
    PRAGMATIC_WEBHOOK_SECRET: process.env['PRAGMATIC_WEBHOOK_SECRET'],
  };

  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('app_test')
    .withUsername('app_test')
    .withPassword('app_test')
    .start();

  process.env['NODE_ENV'] = 'test';
  process.env['DATABASE_URL'] = container.getConnectionUri();
  process.env['DB_SYNCHRONIZE'] = 'true';
  process.env['SESSION_TTL_SECONDS'] = '86400';
  process.env['STRIPE_WEBHOOK_SECRET'] = options.config?.STRIPE_WEBHOOK_SECRET ?? '';
  process.env['STRIPE_SIGNATURE_TOLERANCE_SECONDS'] =
    options.config?.STRIPE_SIGNATURE_TOLERANCE_SECONDS ?? '300';
  process.env['PRAGMATIC_WEBHOOK_SECRET'] = options.config?.PRAGMATIC_WEBHOOK_SECRET ?? '';

  const { AppModule } = await import('../../src/app.module');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication({ rawBody: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AppExceptionFilter(app.get(CorrelationIdService)));
  if (options.setupOpenApi) {
    setupOpenApi(app);
  }
  await app.init();

  const dataSource = app.get(DataSource);

  return {
    app,
    container,
    dataSource,
    close: async () => {
      await app.close();
      await container.stop();
      restoreEnv(savedEnv);
    },
    resetDatabase: async () => {
      await dataSource.query(
        'TRUNCATE TABLE gsp_wallet_intents, provider_event_handoffs, idempotency_keys, raw_events, sessions, users RESTART IDENTITY CASCADE',
      );
      const ledger = app.get<{ resetForTests?: () => void }>(GSP_LEDGER_PORT, { strict: false });
      ledger.resetForTests?.();
    },
  };
}

function restoreEnv(savedEnv: SavedEnv): void {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (typeof value === 'undefined') {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
