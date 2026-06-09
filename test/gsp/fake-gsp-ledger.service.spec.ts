import { FakeGspLedgerService } from '../../src/modules/gsp/infrastructure/ledger/fake-gsp-ledger.service';
import { GspLedgerCommand } from '../../src/modules/gsp/application/ports/gsp-ledger.port';

describe('FakeGspLedgerService', () => {
  let ledger: FakeGspLedgerService;

  beforeEach(() => {
    ledger = new FakeGspLedgerService();
  });

  it('returns the default balance and replays the same ledger command idempotently', async () => {
    const command = ledgerCommand({
      ledgerCommandId: 'cmd-balance',
      operation: 'balance',
      amount: null,
    });

    const first = await ledger.execute(command);
    const replay = await ledger.execute(command);

    expect(first).toEqual({
      status: 'approved',
      walletTransactionId: 'wallet:cmd-balance',
      balance: '1000.00',
      currency: 'EUR',
    });
    expect(replay).toEqual(first);
  });

  it('applies bet and win actions per tenant/player/currency balance key', async () => {
    await expect(
      ledger.execute(ledgerCommand({ ledgerCommandId: 'cmd-bet-a' })),
    ).resolves.toMatchObject({
      balance: '990.00',
    });
    await expect(
      ledger.execute(
        ledgerCommand({
          ledgerCommandId: 'cmd-win-a',
          operation: 'win',
          providerTransactionId: 'txn-win-a',
          amount: '5.50',
        }),
      ),
    ).resolves.toMatchObject({ balance: '995.50' });
    await expect(
      ledger.execute(
        ledgerCommand({
          ledgerCommandId: 'cmd-bet-b',
          brandId: 'brandB',
          providerTransactionId: 'txn-b',
        }),
      ),
    ).resolves.toMatchObject({ balance: '990.00' });
  });

  it('declines insufficient funds without mutating balance and replays the decline', async () => {
    const command = ledgerCommand({
      ledgerCommandId: 'cmd-big-bet',
      providerTransactionId: 'txn-big-bet',
      amount: '2000.00',
    });

    const declined = await ledger.execute(command);
    const replay = await ledger.execute(command);

    expect(declined).toMatchObject({
      status: 'declined',
      balance: '1000.00',
      errorCode: 'INSUFFICIENT_FUNDS',
    });
    expect(replay).toEqual(declined);
  });

  it('rolls back an original transaction once and treats later rollbacks as no-ops', async () => {
    await ledger.execute(ledgerCommand({ ledgerCommandId: 'cmd-bet-original' }));

    await expect(
      ledger.execute(
        ledgerCommand({
          ledgerCommandId: 'cmd-rollback-1',
          operation: 'rollback',
          providerTransactionId: 'txn-rollback-1',
          originalProviderTransactionId: 'txn-1',
          amount: null,
        }),
      ),
    ).resolves.toMatchObject({ status: 'approved', balance: '1000.00' });
    await expect(
      ledger.execute(
        ledgerCommand({
          ledgerCommandId: 'cmd-rollback-2',
          operation: 'rollback',
          providerTransactionId: 'txn-rollback-2',
          originalProviderTransactionId: 'txn-1',
          amount: null,
        }),
      ),
    ).resolves.toMatchObject({ status: 'approved', balance: '1000.00' });
  });

  it('declines rollback requests without a known original transaction', async () => {
    await expect(
      ledger.execute(
        ledgerCommand({
          ledgerCommandId: 'cmd-rollback-missing-id',
          operation: 'rollback',
          providerTransactionId: 'txn-rollback-missing-id',
          originalProviderTransactionId: null,
          amount: null,
        }),
      ),
    ).resolves.toMatchObject({
      status: 'declined',
      errorCode: 'LEDGER_UNAVAILABLE',
      errorMessage: 'Rollback original transaction is missing',
    });
    await expect(
      ledger.execute(
        ledgerCommand({
          ledgerCommandId: 'cmd-rollback-not-found',
          operation: 'rollback',
          providerTransactionId: 'txn-rollback-not-found',
          originalProviderTransactionId: 'unknown-original',
          amount: null,
        }),
      ),
    ).resolves.toMatchObject({
      status: 'declined',
      errorCode: 'LEDGER_UNAVAILABLE',
      errorMessage: 'Rollback original transaction was not found',
    });
  });

  it('supports zero-amount internal commands and explicit test resets', async () => {
    await ledger.execute(ledgerCommand({ ledgerCommandId: 'cmd-bet-before-reset' }));
    ledger.resetForTests();

    await expect(
      ledger.execute(
        ledgerCommand({
          ledgerCommandId: 'cmd-win-no-amount',
          operation: 'win',
          providerTransactionId: 'txn-win-no-amount',
          amount: null,
        }),
      ),
    ).resolves.toMatchObject({ balance: '1000.00' });
  });

  it('defaults nullable currency and whole-unit amounts safely', async () => {
    await expect(
      ledger.execute(
        ledgerCommand({
          ledgerCommandId: 'cmd-bet-whole',
          providerTransactionId: 'txn-bet-whole',
          amount: '10',
          currency: null,
        }),
      ),
    ).resolves.toMatchObject({ balance: '990.00', currency: 'EUR' });
    await expect(
      ledger.execute(
        ledgerCommand({
          ledgerCommandId: 'cmd-big-bet-null-currency',
          providerTransactionId: 'txn-big-bet-null-currency',
          amount: '2000',
          currency: null,
        }),
      ),
    ).resolves.toMatchObject({
      status: 'declined',
      balance: '990.00',
      currency: 'EUR',
      errorCode: 'INSUFFICIENT_FUNDS',
    });
  });
});

function ledgerCommand(patch: Partial<GspLedgerCommand> = {}): GspLedgerCommand {
  return {
    ledgerCommandId: 'cmd-bet',
    operation: 'bet',
    brandId: 'brandA',
    provider: 'pragmatic',
    providerTransactionId: 'txn-1',
    originalProviderTransactionId: null,
    roundId: 'round-1',
    playerId: 'player-1',
    amount: '10.00',
    currency: 'EUR',
    ...patch,
  };
}
