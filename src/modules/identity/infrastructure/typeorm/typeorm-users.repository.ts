import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../domain/user';
import { CreateUserInput, UsersRepository } from '../../domain/repositories/users.repository';
import { UserOrmEntity } from './entities/user.orm-entity';

@Injectable()
export class TypeOrmUsersRepository implements UsersRepository {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly repository: Repository<UserOrmEntity>,
  ) {}

  async create(input: CreateUserInput): Promise<User> {
    const entity = this.repository.create(input);
    return this.repository.save(entity);
  }

  async findByBrandAndEmail(brandId: string, email: string): Promise<User | null> {
    return this.repository.findOne({ where: { brandId, email } });
  }

  async findByIdForBrand(brandId: string, userId: string): Promise<User | null> {
    return this.repository.findOne({ where: { id: userId, brandId } });
  }
}
