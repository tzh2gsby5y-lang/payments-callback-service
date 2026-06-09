import { User } from '../user';

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');

export type CreateUserInput = {
  brandId: string;
  email: string;
  passwordHash: string;
};

export interface UsersRepository {
  create(input: CreateUserInput): Promise<User>;
  findByBrandAndEmail(brandId: string, email: string): Promise<User | null>;
  findByIdForBrand(brandId: string, userId: string): Promise<User | null>;
}
