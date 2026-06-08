import { createHash } from 'node:crypto';
import { PasswordHasher } from '../../src/modules/identity/application/password-hasher';
import { SessionTokenService } from '../../src/modules/identity/application/session-token.service';

describe('identity password and session token services', () => {
  it('hashes passwords using the scrypt storage contract without leaking the plain password', async () => {
    const hasher = new PasswordHasher();

    const stored = await hasher.hash('strong-password');
    const [algorithm, salt, hashHex] = stored.split(':');

    expect(algorithm).toBe('scrypt');
    expect(salt).toMatch(/^[a-f0-9]{32}$/);
    expect(hashHex).toMatch(/^[a-f0-9]{128}$/);
    expect(stored).not.toContain('strong-password');
    await expect(hasher.verify('strong-password', stored)).resolves.toBe(true);
  });

  it('uses a fresh salt for the same password and rejects malformed stored hashes safely', async () => {
    const hasher = new PasswordHasher();
    const first = await hasher.hash('same-password');
    const second = await hasher.hash('same-password');

    expect(first).not.toBe(second);
    await expect(hasher.verify('same-password', first)).resolves.toBe(true);
    await expect(hasher.verify('same-password', second)).resolves.toBe(true);

    await expect(hasher.verify('same-password', '')).resolves.toBe(false);
    await expect(hasher.verify('same-password', 'bcrypt:salt:hash')).resolves.toBe(false);
    await expect(hasher.verify('same-password', 'scrypt::abc')).resolves.toBe(false);
    await expect(hasher.verify('same-password', 'scrypt:salt:')).resolves.toBe(false);
    await expect(hasher.verify('same-password', 'scrypt:salt:abcd')).resolves.toBe(false);
  });

  it('creates opaque base64url session tokens and hashes them with stable SHA-256', () => {
    const tokens = new SessionTokenService();
    const generated = Array.from({ length: 25 }, () => tokens.createPlainToken());

    expect(new Set(generated).size).toBe(generated.length);
    for (const token of generated) {
      expect(token).toHaveLength(43);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(token).not.toContain('=');
    }

    const expected = createHash('sha256').update('token-1').digest('hex');
    expect(tokens.hashToken('token-1')).toBe(expected);
    expect(tokens.hashToken('token-1')).toMatch(/^[a-f0-9]{64}$/);
    expect(tokens.hashToken('token-1')).not.toBe(tokens.hashToken('token-2'));
  });
});
