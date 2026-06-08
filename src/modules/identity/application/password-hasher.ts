import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

@Injectable()
export class PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derived = (await scrypt(password, salt, 64)) as Buffer;

    return `scrypt:${salt}:${derived.toString('hex')}`;
  }

  async verify(password: string, storedHash: string): Promise<boolean> {
    const [algorithm, salt, hashHex] = storedHash.split(':');

    if (algorithm !== 'scrypt' || !salt || !hashHex) {
      return false;
    }

    const candidate = (await scrypt(password, salt, 64)) as Buffer;
    const stored = Buffer.from(hashHex, 'hex');

    return stored.length === candidate.length && timingSafeEqual(stored, candidate);
  }
}
