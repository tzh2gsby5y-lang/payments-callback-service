import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Session } from '../../domain/session';
import {
  CreateSessionInput,
  SessionsRepository,
} from '../../domain/repositories/sessions.repository';
import { SessionOrmEntity } from './entities/session.orm-entity';

@Injectable()
export class TypeOrmSessionsRepository implements SessionsRepository {
  private readonly repository: Repository<SessionOrmEntity>;

  constructor(
    @InjectRepository(SessionOrmEntity)
    repository: Repository<SessionOrmEntity>,
  ) {
    this.repository = repository;
  }

  async create(input: CreateSessionInput): Promise<Session> {
    const entity = this.repository.create(input);
    return this.repository.save(entity);
  }

  async findValidByTokenHash(tokenHash: string, now: Date): Promise<Session | null> {
    return this.repository.findOne({
      where: {
        tokenHash,
        expiresAt: MoreThan(now),
      },
    });
  }
}
