import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { DomainError } from './domain-error';
import { CorrelationIdService } from '../observability/correlation-id.service';

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  constructor(private readonly correlationIds: CorrelationIdService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const requestId = this.correlationIds.getRequestId();

    if (exception instanceof DomainError) {
      response.status(exception.statusCode).json({
        error: {
          code: exception.code,
          message: exception.message,
          statusCode: exception.statusCode,
          requestId,
          details: exception.details,
        },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : ((exceptionResponse as { message?: unknown }).message ?? exception.message);
      const code =
        typeof exceptionResponse === 'object' && exceptionResponse !== null
          ? ((exceptionResponse as { error?: string }).error ?? exception.name)
          : exception.name;

      response.status(statusCode).json({
        error: {
          code,
          message,
          statusCode,
          requestId,
        },
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unexpected server error',
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        requestId,
      },
    });
  }
}
