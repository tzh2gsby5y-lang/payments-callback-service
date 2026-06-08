export type Session = {
  id: string;
  brandId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
};
