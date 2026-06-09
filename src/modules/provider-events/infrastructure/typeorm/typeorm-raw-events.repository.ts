import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RawEvent,
  RawEventStatus,
} from '../../../../shared/provider-events/domain/provider-callback-event';
import {
  CreateRawEventInput,
  RawEventsRepository,
} from '../../domain/repositories/raw-events.repository';
import { RawEventOrmEntity } from './entities/raw-event.orm-entity';

@Injectable()
export class TypeOrmRawEventsRepository implements RawEventsRepository {
  private readonly repository: Repository<RawEventOrmEntity>;

  constructor(
    @InjectRepository(RawEventOrmEntity)
    repository: Repository<RawEventOrmEntity>,
  ) {
    this.repository = repository;
  }

  async create(input: CreateRawEventInput): Promise<RawEvent> {
    const entity = this.repository.create({
      ...input,
      responseStatus: null,
      responseBody: null,
    });

    return this.repository.save(entity);
  }

  async updateStatus(
    id: string,
    status: RawEventStatus,
    responseStatus?: number,
    responseBody?: unknown,
  ): Promise<void> {
    await this.repository.save(
      this.repository.create({
        id,
        status,
        responseStatus: responseStatus ?? null,
        responseBody: responseBody ?? null,
      }),
    );
  }
}
