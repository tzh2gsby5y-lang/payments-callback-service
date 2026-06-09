import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  IdempotencyStatus,
  IdempotencyStatuses,
} from '../../../../shared/provider-events/domain/provider-callback-event';
import {
  ClaimIdempotencyInput,
  IdempotencyClaimResult,
  IdempotencyRepository,
} from '../../domain/repositories/idempotency.repository';
import { IdempotencyKeyOrmEntity } from './entities/idempotency-key.orm-entity';

type PostgresError = Error & {
  code?: string;
  driverError?: {
    code?: string;
  };
};

@Injectable()
export class TypeOrmIdempotencyRepository implements IdempotencyRepository {
  private readonly repository: Repository<IdempotencyKeyOrmEntity>;

  constructor(
    @InjectRepository(IdempotencyKeyOrmEntity)
    repository: Repository<IdempotencyKeyOrmEntity>,
  ) {
    this.repository = repository;
  }

  async claim(input: ClaimIdempotencyInput): Promise<IdempotencyClaimResult> {
    try {
      const entity = this.repository.create({
        ...input,
        status: IdempotencyStatuses.PROCESSING,
        responseStatus: null,
        responseBody: null,
      });
      const record = await this.repository.save(entity);

      return { kind: 'new', record };
    } catch (error) {
      const postgresError = error as PostgresError;
      const errorCode = postgresError.code ?? postgresError.driverError?.code;
      if (errorCode !== '23505') {
        throw error;
      }

      const existing = await this.repository.findOneOrFail({
        where: {
          brandId: input.brandId,
          source: input.source,
          provider: input.provider,
          key: input.key,
        },
      });

      return existing.requestHash === input.requestHash
        ? { kind: 'duplicate', record: existing }
        : { kind: 'conflict', record: existing };
    }
  }

  async markCompleted(
    id: string,
    status: Extract<IdempotencyStatus, 'SUCCEEDED' | 'FAILED_FINAL'>,
    responseStatus: number,
    responseBody: unknown,
  ): Promise<void> {
    await this.repository.save(
      this.repository.create({
        id,
        status,
        responseStatus,
        responseBody,
      }),
    );
  }
}
