import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyKeyOrmEntity } from '../provider-events/infrastructure/typeorm/entities/idempotency-key.orm-entity';
import { RawEventOrmEntity } from '../provider-events/infrastructure/typeorm/entities/raw-event.orm-entity';
import { GSP_LEDGER_PORT } from './application/ports/gsp-ledger.port';
import { GSP_WALLET_PROVIDER_ADAPTERS } from './application/ports/gsp-wallet.tokens';
import { GspWalletProviderAdapter } from './application/ports/gsp-wallet-provider-adapter';
import { GSP_WALLET_ACTION_STORE } from './application/gsp-wallet-action.store';
import { GspWalletProviderRegistry } from './application/gsp-wallet-provider.registry';
import { ExecuteGspWalletActionUseCase } from './application/use-cases/execute-gsp-wallet-action.use-case';
import { LocalGspLedgerService } from './infrastructure/ledger/local-gsp-ledger.service';
import { PragmaticGspModule } from './infrastructure/providers/pragmatic/pragmatic-gsp.module';
import { PragmaticGspProvider } from './infrastructure/providers/pragmatic/pragmatic-gsp.provider';
import { GspWalletIntentOrmEntity } from './infrastructure/typeorm/entities/gsp-wallet-intent.orm-entity';
import { TypeOrmGspWalletActionStore } from './infrastructure/typeorm/typeorm-gsp-wallet-action.store';
import { GspWebhooksController } from './presentation/gsp-webhooks.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RawEventOrmEntity,
      IdempotencyKeyOrmEntity,
      GspWalletIntentOrmEntity,
    ]),
    PragmaticGspModule,
  ],
  controllers: [GspWebhooksController],
  providers: [
    {
      provide: GSP_WALLET_PROVIDER_ADAPTERS,
      inject: [PragmaticGspProvider],
      useFactory: (pragmatic: PragmaticGspProvider): GspWalletProviderAdapter[] => [pragmatic],
    },
    {
      provide: GspWalletProviderRegistry,
      inject: [GSP_WALLET_PROVIDER_ADAPTERS],
      useFactory: (adapters: GspWalletProviderAdapter[]): GspWalletProviderRegistry =>
        new GspWalletProviderRegistry(adapters),
    },
    TypeOrmGspWalletActionStore,
    {
      provide: GSP_WALLET_ACTION_STORE,
      useExisting: TypeOrmGspWalletActionStore,
    },
    {
      provide: GSP_LEDGER_PORT,
      useClass: LocalGspLedgerService,
    },
    ExecuteGspWalletActionUseCase,
  ],
})
export class GspModule {}
