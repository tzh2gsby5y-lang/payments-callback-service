import {
  RawProviderCallbackInput,
  SignatureVerification,
} from '../../../../shared/provider-events/application/ports/provider-callback-adapter';
import { GspWalletBusinessResult, NormalizedGspWalletAction } from '../../domain/gsp-wallet-action';

export interface GspWalletProviderAdapter {
  readonly provider: string;
  verifySignature(input: RawProviderCallbackInput): Promise<SignatureVerification>;
  normalizeWalletAction(input: RawProviderCallbackInput): NormalizedGspWalletAction;
  serializeWalletResponse(result: GspWalletBusinessResult): unknown;
}
