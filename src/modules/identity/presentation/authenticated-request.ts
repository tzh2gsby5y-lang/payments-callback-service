import { Request } from 'express';
import { AuthenticatedPrincipal } from '../application/use-cases/get-profile.use-case';

export type AuthenticatedRequest = Request & {
  principal: AuthenticatedPrincipal;
};
