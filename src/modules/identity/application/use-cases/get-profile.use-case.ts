import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../../../shared/errors/domain-error';
import { USERS_REPOSITORY, UsersRepository } from '../../domain/repositories/users.repository';

export type AuthenticatedPrincipal = {
  userId: string;
  brandId: string;
  sessionId: string;
};

@Injectable()
export class GetProfileUseCase {
  private readonly users: UsersRepository;

  constructor(@Inject(USERS_REPOSITORY) users: UsersRepository) {
    this.users = users;
  }

  async execute(
    principal: AuthenticatedPrincipal,
  ): Promise<{ id: string; brandId: string; email: string }> {
    const user = await this.users.findByIdForBrand(principal.brandId, principal.userId);

    if (!user) {
      throw new DomainError(
        'USER_NOT_FOUND',
        'Authenticated user was not found in this brand',
        404,
      );
    }

    return {
      id: user.id,
      brandId: user.brandId,
      email: user.email,
    };
  }
}
