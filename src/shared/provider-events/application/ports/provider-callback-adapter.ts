import { CallbackSource, NormalizedCallbackEvent } from '../../domain/provider-callback-event';

export type RawProviderCallbackInput = {
  source: CallbackSource;
  provider: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  parsedBody: unknown;
  receivedAt: Date;
};

export type SignatureVerification = {
  valid: boolean;
  mode: 'verified' | 'skipped' | 'failed';
  reason?: string;
};

export interface ProviderCallbackAdapter {
  readonly source: CallbackSource;
  readonly provider: string;
  verifySignature(input: RawProviderCallbackInput): Promise<SignatureVerification>;
  normalize(input: RawProviderCallbackInput): NormalizedCallbackEvent;
}
