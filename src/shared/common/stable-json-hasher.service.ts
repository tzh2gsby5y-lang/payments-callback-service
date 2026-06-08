import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { stableStringify } from './canonical-json';

@Injectable()
export class StableJsonHasher {
  hash(value: unknown): string {
    return createHash('sha256').update(stableStringify(value)).digest('hex');
  }
}
