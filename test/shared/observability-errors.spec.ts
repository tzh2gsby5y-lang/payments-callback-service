import { ArgumentsHost, BadRequestException, HttpException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AppExceptionFilter } from '../../src/shared/errors/app-exception.filter';
import { DomainError } from '../../src/shared/errors/domain-error';
import {
  CorrelationIdMiddleware,
  RequestWithCorrelation,
} from '../../src/shared/observability/correlation-id.middleware';
import { CorrelationIdService } from '../../src/shared/observability/correlation-id.service';
import { RequestLoggerMiddleware } from '../../src/shared/observability/request-logger.middleware';

describe('observability and structured errors', () => {
  it('propagates an incoming correlation id to request, response, and async context', () => {
    const correlationIds = new CorrelationIdService();
    const middleware = new CorrelationIdMiddleware(correlationIds);
    const req = correlationRequestMock('req-123');
    const res = headerResponseMock();
    const next = jest.fn(() => {
      expect(correlationIds.getRequestId()).toBe('req-123');
    });

    middleware.use(asCorrelationRequest(req), asResponse(res), next);

    expect(req.requestId).toBe('req-123');
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'req-123');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('isolates correlation ids across concurrent async contexts', async () => {
    const correlationIds = new CorrelationIdService();

    const [first, second] = await Promise.all([
      correlationIds.run('req-a', async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return correlationIds.getRequestId();
      }),
      correlationIds.run('req-b', async () => {
        await Promise.resolve();
        return correlationIds.getRequestId();
      }),
    ]);

    expect(first).toBe('req-a');
    expect(second).toBe('req-b');
    expect(correlationIds.getRequestId()).toBeUndefined();
  });

  it('generates a correlation id when a request header is blank', () => {
    const correlationIds = new CorrelationIdService();
    const middleware = new CorrelationIdMiddleware(correlationIds);
    const req = correlationRequestMock('   ');
    const res = headerResponseMock();

    middleware.use(asCorrelationRequest(req), asResponse(res), jest.fn());

    expect(req.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', req.requestId);
  });

  it('formats domain errors with code, details, and correlation id', () => {
    const filter = new AppExceptionFilter(correlationIdsMock('req-domain'));
    const response = responseMock();

    filter.catch(
      new DomainError('PAYLOAD_CONFLICT', 'Payload mismatch', 409, { key: 'stripe:evt_1' }),
      hostMock(response),
    );

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'PAYLOAD_CONFLICT',
        message: 'Payload mismatch',
        statusCode: 409,
        requestId: 'req-domain',
        details: { key: 'stripe:evt_1' },
      },
    });
  });

  it('formats Nest HTTP exceptions without leaking implementation internals', () => {
    const filter = new AppExceptionFilter(correlationIdsMock('req-http'));
    const response = responseMock();

    filter.catch(new BadRequestException(['brandId must be a string']), hostMock(response));

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'Bad Request',
        message: ['brandId must be a string'],
        statusCode: 400,
        requestId: 'req-http',
      },
    });
  });

  it('falls back to exception metadata when HTTP exception objects omit error and message', () => {
    const filter = new AppExceptionFilter(correlationIdsMock('req-object-fallback'));
    const response = responseMock();

    filter.catch(new HttpException({ unexpected: 'shape' }, 422), hostMock(response));

    expect(response.status).toHaveBeenCalledWith(422);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'HttpException',
        message: 'Http Exception',
        statusCode: 422,
        requestId: 'req-object-fallback',
      },
    });
  });

  it('formats string HTTP exception responses using the exception class name', () => {
    const filter = new AppExceptionFilter(correlationIdsMock('req-string'));
    const response = responseMock();

    filter.catch(new HttpException('Plain failure', 418), hostMock(response));

    expect(response.status).toHaveBeenCalledWith(418);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'HttpException',
        message: 'Plain failure',
        statusCode: 418,
        requestId: 'req-string',
      },
    });
  });

  it('formats unknown exceptions as a stable internal server error', () => {
    const filter = new AppExceptionFilter(correlationIdsMock(undefined));
    const response = responseMock();

    filter.catch(new Error('database password in stack'), hostMock(response));

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unexpected server error',
        statusCode: 500,
        requestId: undefined,
      },
    });
  });

  it('logs request completion with correlation id and response status', () => {
    const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const middleware = new RequestLoggerMiddleware(correlationIdsMock('req-log'));
    const callbacks = new Map<string, () => void>();
    const req = loggerRequestMock('POST', '/webhooks/psp/stripe');
    const res = loggerResponseMock(202, callbacks);
    const next = jest.fn();

    middleware.use(asRequest(req), asResponse(res), next);
    callbacks.get('finish')?.();

    expect(next).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(expect.stringContaining('"path":"/webhooks/psp/stripe"'));
    expect(write).toHaveBeenCalledWith(expect.stringContaining('"requestId":"req-log"'));
    write.mockRestore();
  });
});

type CorrelationIdsMock = Pick<CorrelationIdService, 'getRequestId'>;
type CorrelationRequestMock = {
  header: (name: string) => string | undefined;
  requestId?: string;
};
type HeaderResponseMock = Pick<Response, 'setHeader'>;
type JsonResponseMock = Pick<Response, 'status' | 'json'>;
type LoggerRequestMock = Pick<Request, 'method' | 'originalUrl'>;
type LoggerResponseMock = {
  statusCode: number;
  on: (event: string, callback: () => void) => LoggerResponseMock;
};

function correlationIdsMock(requestId: string | undefined): CorrelationIdService {
  const correlationIds: CorrelationIdsMock = {
    getRequestId: () => requestId,
  };

  return correlationIds as CorrelationIdService;
}

function correlationRequestMock(requestIdHeader: string | undefined): CorrelationRequestMock {
  return {
    header: (name: string) => (name === 'x-request-id' ? requestIdHeader : undefined),
  };
}

function headerResponseMock(): HeaderResponseMock {
  return {
    setHeader: jest.fn(),
  };
}

function loggerRequestMock(method: string, originalUrl: string): LoggerRequestMock {
  return {
    method,
    originalUrl,
  };
}

function loggerResponseMock(
  statusCode: number,
  callbacks: Map<string, () => void>,
): LoggerResponseMock {
  const response: LoggerResponseMock = {
    statusCode,
    on: jest.fn((event: string, callback: () => void): LoggerResponseMock => {
      callbacks.set(event, callback);
      return response;
    }),
  };

  return response;
}

function responseMock(): JsonResponseMock {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

function hostMock(response: JsonResponseMock): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  } as ArgumentsHost;
}

function asCorrelationRequest(request: CorrelationRequestMock): RequestWithCorrelation {
  return request as RequestWithCorrelation;
}

function asRequest(request: LoggerRequestMock): Request {
  return request as Request;
}

function asResponse(response: HeaderResponseMock | LoggerResponseMock): Response {
  return response as Response;
}
