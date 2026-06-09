export class DomainError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details: unknown | undefined;

  constructor(code: string, message: string, statusCode: number, details?: unknown) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
