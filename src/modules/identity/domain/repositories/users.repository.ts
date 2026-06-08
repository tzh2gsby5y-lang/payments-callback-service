import { User } from '../user';

// Domain repository token: application use-cases depend on this contract, so persistence can be
// swapped from TypeORM to another implementation by changing the provider binding in the module.
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
