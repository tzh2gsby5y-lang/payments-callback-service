import { Request, Response } from 'express';
import { ExecuteGspWalletActionUseCase } from '../../../src/modules/gsp/application/use-cases/execute-gsp-wallet-action.use-case';
import { GspWebhooksController } from '../../../src/modules/gsp/presentation/gsp-webhooks.controller';
import {
  ProviderCallbackIngestionResult,
  ProviderCallbackIngestionService,
} from '../../../src/modules/provider-events/application/provider-callback-ingestion.service';
import { PspWebhooksController } from '../../../src/modules/psp/presentation/psp-webhooks.controller';
import { IngestPspCallbackUseCase } from '../../../src/modules/psp/application/use-cases/ingest-psp-callback.use-case';
import { RequestWithCorrelation } from '../../../src/shared/observability/correlation-id.middleware';

describe('PSP/GSP source entrypoints', () => {
  const ingestionResult: ProviderCallbackIngestionResult = {
    statusCode: 202,
    body: {
      status: 'accepted',
      eventId: 'raw-1',
      provider: 'stripe',
      source: 'psp',
      idempotencyKey: 'stripe:evt-1',
      handoff: 'pending_evaluation',
    },
  } as const;

  it('PSP use-case stamps source before delegating to provider-event ingestion', async () => {
    const ingestion = providerIngestionMock(ingestionResult);
    const useCase = new IngestPspCallbackUseCase(asProviderIngestionService(ingestion));

    await expect(
      useCase.execute({
        provider: 'stripe',
        headers: { 'x-request-id': 'req-1' },
        rawBody: '{}',
        parsedBody: {},
      }),
    ).resolves.toBe(ingestionResult);
    expect(ingestion.ingest).toHaveBeenCalledWith({
      source: 'psp',
      provider: 'stripe',
      headers: { 'x-request-id': 'req-1' },
      rawBody: '{}',
      parsedBody: {},
    });
  });

  it('PSP use-case overwrites a casted source value on the incoming command', async () => {
    const ingestion = providerIngestionMock(ingestionResult);
    const useCase = new IngestPspCallbackUseCase(asProviderIngestionService(ingestion));
    const commandWithSource = {
      source: 'gsp',
      provider: 'stripe',
      headers: {},
      rawBody: '{}',
      parsedBody: {},
    };

    await useCase.execute(commandWithSource);

    expect(ingestion.ingest).toHaveBeenCalledWith(expect.objectContaining({ source: 'psp' }));
  });

  it('PSP controller prefers Express rawBody for signature-sensitive payloads', async () => {
    const useCase = pspUseCaseMock(ingestionResult);
    const controller = new PspWebhooksController(asPspUseCase(useCase));
    const response = responseMock();
    const rawBody = Buffer.from('{"id":"evt_raw"}');

    const body = await controller.handle(
      'stripe',
      { id: 'evt_parsed' },
      requestMock({ headers: { 'stripe-signature': 'sig' }, rawBody }),
      asResponse(response),
    );

    expect(response.status).toHaveBeenCalledWith(202);
    expect(body).toBe(ingestionResult.body);
    expect(useCase.execute).toHaveBeenCalledWith({
      provider: 'stripe',
      headers: { 'stripe-signature': 'sig' },
      rawBody: '{"id":"evt_raw"}',
      parsedBody: { id: 'evt_parsed' },
    });
  });

  it('GSP controller falls back to stable JSON body when rawBody is unavailable', async () => {
    const result = {
      statusCode: 200,
      body: {
        status: 'approved',
        action: 'bet',
        provider: 'pragmatic',
        brandId: 'brandA',
        playerId: 'player-1',
        providerTransactionId: 'txn-1',
        walletTransactionId: 'wallet:gsp-wallet:brandA:pragmatic:bet:txn-1',
        roundId: 'round-1',
        balance: '990.00',
        currency: 'EUR',
        idempotencyKey: 'pragmatic:bet:txn-1',
      },
    };
    const useCase = gspUseCaseMock(result);
    const controller = new GspWebhooksController(asGspUseCase(useCase));
    const response = responseMock();

    await controller.handle(
      'pragmatic',
      { action: 'bet', brandId: 'brandA' },
      requestMock({ headers: {} }),
      asResponse(response),
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(useCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'pragmatic',
        rawBody: '{"action":"bet","brandId":"brandA"}',
      }),
    );
  });

  it('PSP controller falls back to JSON body when rawBody is unavailable', async () => {
    const useCase = pspUseCaseMock(ingestionResult);
    const controller = new PspWebhooksController(asPspUseCase(useCase));

    await controller.handle(
      'stripe',
      { id: 'evt_json' },
      requestMock({ headers: {} }),
      asResponse(responseMock()),
    );

    expect(useCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        rawBody: '{"id":"evt_json"}',
      }),
    );
  });
});

type ProviderIngestionMock = Pick<ProviderCallbackIngestionService, 'ingest'>;
type PspUseCaseMock = Pick<IngestPspCallbackUseCase, 'execute'>;
type GspUseCaseMock = Pick<ExecuteGspWalletActionUseCase, 'execute'>;
type ResponseMock = Pick<Response, 'status'>;

function providerIngestionMock(result: ProviderCallbackIngestionResult): ProviderIngestionMock {
  return {
    ingest: jest.fn().mockResolvedValue(result),
  };
}

function pspUseCaseMock(result: ProviderCallbackIngestionResult): PspUseCaseMock {
  return {
    execute: jest.fn().mockResolvedValue(result),
  };
}

function gspUseCaseMock(
  result: Awaited<ReturnType<ExecuteGspWalletActionUseCase['execute']>>,
): GspUseCaseMock {
  return {
    execute: jest.fn().mockResolvedValue(result),
  };
}

function requestMock(request: Pick<RequestWithCorrelation & Request, 'headers' | 'rawBody'>) {
  return request as RequestWithCorrelation & Request;
}

function responseMock(): ResponseMock {
  return {
    status: jest.fn(),
  };
}

function asProviderIngestionService(
  ingestion: ProviderIngestionMock,
): ProviderCallbackIngestionService {
  return ingestion as ProviderCallbackIngestionService;
}

function asPspUseCase(useCase: PspUseCaseMock): IngestPspCallbackUseCase {
  return useCase as IngestPspCallbackUseCase;
}

function asGspUseCase(useCase: GspUseCaseMock): ExecuteGspWalletActionUseCase {
  return useCase as ExecuteGspWalletActionUseCase;
}

function asResponse(response: ResponseMock): Response {
  return response as Response;
}
