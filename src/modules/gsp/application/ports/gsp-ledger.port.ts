import {
  GspWalletBusinessStatus,
  GspWalletErrorCode,
  GspWalletOperation,
} from '../../domain/gsp-wallet-action';

export const GSP_LEDGER_PORT = Symbol('GSP_LEDGER_PORT');

export type GspLedgerCommand = {
  ledgerCommandId: string;
  operation: GspWalletOperation;
  brandId: string;
  provider: string;
  providerTransactionId: string;
  originalProviderTransactionId: string | null;
  roundId: string | null;
  playerId: string;
  amount: string | null;
  currency: string | null;
};

export type GspLedgerResult = {
  status: GspWalletBusinessStatus;
  walletTransactionId: string;
  balance: string;
  currency: string;
  errorCode?: GspWalletErrorCode;
  errorMessage?: string;
};

export interface GspLedgerPort {
  execute(command: GspLedgerCommand): Promise<GspLedgerResult>;
}
