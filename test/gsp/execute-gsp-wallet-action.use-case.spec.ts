import { ExecuteGspWalletActionUseCase } from '../../src/modules/gsp/application/use-cases/execute-gsp-wallet-action.use-case';
import { GspWalletActionStore } from '../../src/modules/gsp/application/gsp-wallet-action.store';
import { GspWalletProviderRegistry } from '../../src/modules/gsp/application/gsp-wallet-provider.registry';
import { GspLedgerPort } from '../../src/modules/gsp/application/ports/gsp-ledger.port';
import { GspWalletProviderAdapter } from '../../src/modules/gsp/application/ports/gsp-wallet-provider-adapter';
import { GspWalletBusinessResult } from '../../src/modules/gsp/domain/gsp-wallet-action';

describe('ExecuteGspWalletActionUseCase', () => {
  it('executes a new wallet action through the ledger port and stores the response', async () => {
    const { useCase, adapter, store, ledger } = createUseCase();

    await expect(useCase.execute(command())).resolves.toEqual({
      statusCode: 200,
      body: expect.objectContaining({
        status: 'approved',
        idempotencyKey: 'pragmatic:bet:txn-1',
      }),
    });

    expect(adapter.verifySignature).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'gsp' }),
    );
    expect(store.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'pragmatic',
        idempotencyKey: 'pragmatic:bet:txn-1',
        ledgerCommandId: 'gsp-wallet:brandA:pragmatic:bet:txn-1',
        fingerprintFields: expect.objectContaining({
          providerEventId: 'txn-1',
          amount: '10.00',
        }),
      }),
    );
    expect(ledger.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        ledgerCommandId: 'gsp-wallet:brandA:pragmatic:bet:txn-1',
        brandId: 'brandA',
      }),
    );
    expect(store.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        intentId: 'intent-1',
        intentStatus: 'LEDGER_SUCCEEDED',
        responseStatus: 200,
      }),
    );
  });

  it('rejects invalid signatures before persistence', async () => {
    const { useCase, adapter, store } = createUseCase();
    adapter.verifySignature.mockResolvedValue({ valid: false, mode: 'failed', reason: 'bad_sig' });

    await expect(useCase.execute(command())).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_SIGNATURE',
      statusCode: 401,
    });
    expect(store.begin).not.toHaveBeenCalled();
  });

  it('maps idempotency conflicts without calling the ledger', async () => {
    const { useCase, store, ledger } = createUseCase();
    store.begin.mockResolvedValue({ kind: 'conflict' });

    await expect(useCase.execute(command())).rejects.toMatchObject({
      code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
      statusCode: 409,
    });
    expect(ledger.execute).not.toHaveBeenCalled();
  });

  it('returns cached duplicate responses without calling the ledger', async () => {
    const { useCase, store, ledger } = createUseCase();
    const response = { statusCode: 200, body: { status: 'approved', balance: '990.00' } };
    store.begin.mockResolvedValue({ kind: 'duplicate_completed', response });

    await expect(useCase.execute(command())).resolves.toBe(response);
    expect(ledger.execute).not.toHaveBeenCalled();
  });

  it('waits for a processing duplicate and records the final cached response', async () => {
    const { useCase, store, ledger } = createUseCase();
    const response = { statusCode: 200, body: { status: 'approved', balance: '990.00' } };
    store.begin.mockResolvedValue({
      kind: 'processing',
      rawEventId: 'raw-duplicate',
      brandId: 'brandA',
      provider: 'pragmatic',
      idempotencyKey: 'pragmatic:bet:txn-1',
    });
    store.findCachedResponse.mockResolvedValueOnce(response);

    await expect(useCase.execute(command())).resolves.toBe(response);

    expect(store.findCachedResponse).toHaveBeenCalledWith(
      'brandA',
      'pragmatic',
      'pragmatic:bet:txn-1',
    );
    expect(store.recordDuplicateResponse).toHaveBeenCalledWith('raw-duplicate', response);
    expect(ledger.execute).not.toHaveBeenCalled();
  });

  it('returns a structured pending error when the original action has not completed', async () => {
    const { useCase, store } = createUseCase();
    store.begin.mockResolvedValue({
      kind: 'processing',
      rawEventId: 'raw-duplicate',
      brandId: 'brandA',
      provider: 'pragmatic',
      idempotencyKey: 'pragmatic:bet:txn-1',
    });
    store.findCachedResponse.mockResolvedValue(null);

    await expect(useCase.execute(command())).rejects.toMatchObject({
      code: 'GSP_WALLET_RESULT_PENDING',
      statusCode: 503,
    });
  });

  it('records a retryable failure when ledger execution throws after the intent is opened', async () => {
    const { useCase, store, ledger } = createUseCase();
    ledger.execute.mockRejectedValue(new Error('ledger down'));

    await expect(useCase.execute(command())).rejects.toMatchObject({
      code: 'GSP_LEDGER_UNAVAILABLE',
      statusCode: 503,
    });

    expect(store.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        intentId: 'intent-1',
        rawEventId: 'raw-1',
        idempotencyKeyId: 'idem-1',
        responseStatus: 503,
        responseBody: {
          error: {
            code: 'GSP_LEDGER_UNAVAILABLE',
            message: 'Ledger execution failed',
            statusCode: 503,
          },
        },
        error: {
          name: 'Error',
          message: 'ledger down',
        },
      }),
    );
    expect(store.complete).not.toHaveBeenCalled();
  });

  it('rejects unsupported GSP providers through the registry', async () => {
    const { useCase } = createUseCase();

    await expect(useCase.execute({ ...command(), provider: 'missing' })).rejects.toMatchObject({
      code: 'UNSUPPORTED_PROVIDER',
      statusCode: 404,
    });
  });
});

function createUseCase() {
  const adapter: jest.Mocked<GspWalletProviderAdapter> = {
    provider: 'pragmatic',
    verifySignature: jest.fn().mockResolvedValue({ valid: true, mode: 'skipped' }),
    normalizeWalletAction: jest.fn().mockReturnValue({
      source: 'gsp',
      provider: 'pragmatic',
      brandId: 'brandA',
      providerEventId: 'txn-1',
      operation: 'bet',
      roundId: 'round-1',
      aggregateId: 'round-1',
      playerId: 'player-1',
      amount: '10.00',
      currency: 'EUR',
      originalProviderEventId: null,
      occurredAt: new Date('2026-06-08T12:00:00Z'),
      raw: {},
    }),
    serializeWalletResponse: jest.fn((result: GspWalletBusinessResult) => ({
      status: result.status,
      action: result.operation,
      provider: result.provider,
      brandId: result.brandId,
      playerId: result.playerId,
      providerTransactionId: result.providerTransactionId,
      walletTransactionId: result.walletTransactionId,
      roundId: result.roundId,
      balance: result.balance,
      currency: result.currency,
      idempotencyKey: result.idempotencyKey,
    })),
  };
  const store: jest.Mocked<GspWalletActionStore> = {
    begin: jest.fn().mockResolvedValue({
      kind: 'new',
      intent: {
        id: 'intent-1',
        rawEventId: 'raw-1',
        idempotencyKeyId: 'idem-1',
        ledgerCommandId: 'gsp-wallet:brandA:pragmatic:bet:txn-1',
        attemptCount: 1,
      },
    }),
    complete: jest.fn(),
    fail: jest.fn(),
    findCachedResponse: jest.fn(),
    recordDuplicateResponse: jest.fn(),
  };
  const ledger: jest.Mocked<GspLedgerPort> = {
    execute: jest.fn().mockResolvedValue({
      status: 'approved',
      walletTransactionId: 'wallet:gsp-wallet:brandA:pragmatic:bet:txn-1',
      balance: '990.00',
      currency: 'EUR',
    }),
  };

  return {
    adapter,
    store,
    ledger,
    useCase: new ExecuteGspWalletActionUseCase(
      new GspWalletProviderRegistry([adapter]),
      store,
      ledger,
    ),
  };
}

function command() {
  return {
    provider: 'PRAGMATIC',
    headers: { 'x-request-id': 'req-1' },
    rawBody: '{"action":"bet"}',
    parsedBody: { action: 'bet' },
  };
}
