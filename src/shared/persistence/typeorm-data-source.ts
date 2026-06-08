import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { IdempotencyKeyOrmEntity } from '../../modules/provider-events/infrastructure/typeorm/entities/idempotency-key.orm-entity';
import { ProviderEventHandoffOrmEntity } from '../../modules/provider-events/infrastructure/typeorm/entities/provider-event-handoff.orm-entity';
import { RawEventOrmEntity } from '../../modules/provider-events/infrastructure/typeorm/entities/raw-event.orm-entity';
import { SessionOrmEntity } from '../../modules/identity/infrastructure/typeorm/entities/session.orm-entity';
import { UserOrmEntity } from '../../modules/identity/infrastructure/typeorm/entities/user.orm-entity';
import { GspWalletIntentOrmEntity } from '../../modules/gsp/infrastructure/typeorm/entities/gsp-wallet-intent.orm-entity';

config();

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for TypeORM datasource commands');
}

export default new DataSource({
  type: 'postgres',
  url: databaseUrl,
  entities: [
    UserOrmEntity,
    SessionOrmEntity,
    RawEventOrmEntity,
    IdempotencyKeyOrmEntity,
    ProviderEventHandoffOrmEntity,
    GspWalletIntentOrmEntity,
  ],
  migrations: ['src/shared/persistence/migrations/*.ts'],
  synchronize: false,
});
