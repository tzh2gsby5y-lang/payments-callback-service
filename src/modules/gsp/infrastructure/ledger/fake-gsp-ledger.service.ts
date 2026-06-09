import { Injectable } from '@nestjs/common';
import {
  GspLedgerCommand,
  GspLedgerPort,
  GspLedgerResult,
} from '../../application/ports/gsp-ledger.port';
import {
  GspWalletBusinessStatuses,
  GspWalletErrorCode,
  GspWalletErrorCodes,
} from '../../domain/gsp-wallet-action';

type LedgerTransaction = {
  command: GspLedgerCommand;
  result: GspLedgerResult;
  deltaMinor: bigint;
  rolledBack: boolean;
};

@Injectable()
export class FakeGspLedgerService implements GspLedgerPort {
  private readonly balances = new Map<string, bigint>();
  private readonly transactions = new Map<string, LedgerTransaction>();

  resetForTests(): void {
    this.balances.clear();
    this.transactions.clear();
  }

  async execute(command: GspLedgerCommand): Promise<GspLedgerResult> {
    const existing = this.transactions.get(command.ledgerCommandId);
    if (existing) {
      return existing.result;
    }

    if (command.operation === 'balance') {
      return this.approve(command, 0n);
    }

    if (command.operation === 'rollback') {
      return this.rollback(command);
    }

    const amount = this.requireAmount(command);
    if (command.operation === 'bet') {
      const current = this.balanceFor(command);
      if (current < amount) {
        return this.decline(
          command,
          GspWalletErrorCodes.INSUFFICIENT_FUNDS,
          'Insufficient funds',
        );
      }

      return this.approve(command, -amount);
    }

    return this.approve(command, amount);
  }

  private rollback(command: GspLedgerCommand): GspLedgerResult {
    const originalId = command.originalProviderTransactionId;
    if (!originalId) {
      return this.decline(
        command,
        GspWalletErrorCodes.LEDGER_UNAVAILABLE,
        'Rollback original transaction is missing',
      );
    }

    const original = [...this.transactions.values()].find(
      (transaction) =>
        transaction.command.brandId === command.brandId &&
        transaction.command.provider === command.provider &&
        transaction.command.providerTransactionId === originalId,
    );

    if (!original) {
      return this.decline(
        command,
        GspWalletErrorCodes.LEDGER_UNAVAILABLE,
        'Rollback original transaction was not found',
      );
    }

    if (original.rolledBack) {
      return this.approve(command, 0n);
    }

    original.rolledBack = true;
    return this.approve(command, -original.deltaMinor);
  }

  private approve(command: GspLedgerCommand, deltaMinor: bigint): GspLedgerResult {
    const key = this.balanceKey(command);
    const next = this.balanceFor(command) + deltaMinor;
    this.balances.set(key, next);

    const result: GspLedgerResult = {
      status: GspWalletBusinessStatuses.APPROVED,
      walletTransactionId: `wallet:${command.ledgerCommandId}`,
      balance: this.formatAmount(next),
      currency: command.currency ?? 'EUR',
    };
    this.transactions.set(command.ledgerCommandId, {
      command,
      result,
      deltaMinor,
      rolledBack: false,
    });

    return result;
  }

  private decline(
    command: GspLedgerCommand,
    errorCode: GspWalletErrorCode,
    errorMessage: string,
  ): GspLedgerResult {
    const result: GspLedgerResult = {
      status: GspWalletBusinessStatuses.DECLINED,
      walletTransactionId: `wallet:${command.ledgerCommandId}`,
      balance: this.formatAmount(this.balanceFor(command)),
      currency: command.currency ?? 'EUR',
      errorCode,
      errorMessage,
    };
    this.transactions.set(command.ledgerCommandId, {
      command,
      result,
      deltaMinor: 0n,
      rolledBack: false,
    });

    return result;
  }

  private requireAmount(command: GspLedgerCommand): bigint {
    if (!command.amount) {
      return 0n;
    }

    return this.parseAmount(command.amount);
  }

  private balanceFor(command: GspLedgerCommand): bigint {
    return this.balances.get(this.balanceKey(command)) ?? 100_000n;
  }

  private balanceKey(command: GspLedgerCommand): string {
    return `${command.brandId}:${command.playerId}:${command.currency ?? 'EUR'}`;
  }

  private parseAmount(amount: string): bigint {
    const [whole = '0', fraction = ''] = amount.split('.');
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
  }

  private formatAmount(minor: bigint): string {
    const sign = minor < 0n ? '-' : '';
    const absolute = minor < 0n ? -minor : minor;
    return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
  }
}
