import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

type CorrelationStore = {
  requestId: string;
};

@Injectable()
export class CorrelationIdService {
  private readonly storage = new AsyncLocalStorage<CorrelationStore>();

  run<T>(requestId: string, callback: () => T): T {
    return this.storage.run({ requestId }, callback);
  }

  getRequestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }
}
