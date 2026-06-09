import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../../config/env.schema';
import { CorrelationIdService } from './correlation-id.service';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

@Injectable()
export class StructuredLogger {
  private readonly correlationIds: CorrelationIdService;
  private readonly config: ConfigService<Env> | undefined;

  constructor(correlationIds: CorrelationIdService, @Optional() config?: ConfigService<Env>) {
    this.correlationIds = correlationIds;
    this.config = config;
  }

  debug(message: string, fields: LogFields = {}): void {
    this.write('debug', message, fields);
  }

  info(message: string, fields: LogFields = {}): void {
    this.write('info', message, fields);
  }

  warn(message: string, fields: LogFields = {}): void {
    this.write('warn', message, fields);
  }

  error(message: string, fields: LogFields = {}): void {
    this.write('error', message, fields);
  }

  private write(level: LogLevel, message: string, fields: LogFields): void {
    if (!this.shouldWrite(level)) {
      return;
    }

    const requestId = this.correlationIds.getRequestId();
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...fields,
      ...(requestId ? { requestId } : {}),
    };
    const line = `${JSON.stringify(entry)}\n`;

    if (level === 'error') {
      process.stderr.write(line);
      return;
    }

    process.stdout.write(line);
  }

  private shouldWrite(level: LogLevel): boolean {
    const configuredLevel = this.config?.get('LOG_LEVEL', { infer: true }) ?? 'info';

    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[configuredLevel];
  }
}
