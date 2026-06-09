import { Session } from '../session';

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
