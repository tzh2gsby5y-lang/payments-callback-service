import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Env } from '../../config/env.schema';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env>) => {
        const synchronize = config.get('DB_SYNCHRONIZE', { infer: true }) ?? false;
        return {
          type: 'postgres',
          url: config.getOrThrow('DATABASE_URL', { infer: true }),
          autoLoadEntities: true,
          synchronize,
          logging:
            config.get('NODE_ENV', { infer: true }) === 'development' ? ['error', 'warn'] : false,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
