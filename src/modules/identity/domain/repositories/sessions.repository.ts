import { Session } from '../session';

// Domain repository token: swapping the injected provider changes the storage implementation
// without changing application use-cases.
export const SESSIONS_REPOSITORY = Symbol('SESSIONS_REPOSITORY');

export type CreateSessionInput = {
  brandId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};

export interface SessionsRepository {
  create(input: CreateSessionInput): Promise<Session>;
  findValidByTokenHash(tokenHash: string, now: Date): Promise<Session | null>;
}
