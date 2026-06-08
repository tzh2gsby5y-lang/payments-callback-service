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
  constructor(
    @InjectRepository(SessionOrmEntity)
    private readonly repository: Repository<SessionOrmEntity>,
  ) {}

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
