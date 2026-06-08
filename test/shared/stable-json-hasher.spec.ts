import { createHash } from 'node:crypto';
import { stableStringify } from '../../src/shared/common/canonical-json';
import { StableJsonHasher } from '../../src/shared/common/stable-json-hasher.service';

describe('stable JSON hashing', () => {
  it('canonicalizes object keys recursively while keeping array order significant', () => {
    expect(stableStringify({ b: 1, a: { d: 4, c: 3 } })).toBe(
      stableStringify({ a: { c: 3, d: 4 }, b: 1 }),
    );
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });

  it('produces stable SHA-256 hex hashes for semantically equivalent objects', () => {
    const hasher = new StableJsonHasher();
    const first = hasher.hash({ b: 2, a: { z: 'last', m: 'middle' } });
    const second = hasher.hash({ a: { m: 'middle', z: 'last' }, b: 2 });
    const changed = hasher.hash({ a: { m: 'changed', z: 'last' }, b: 2 });

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(
      createHash('sha256')
        .update(stableStringify({ a: { m: 'middle', z: 'last' }, b: 2 }))
        .digest('hex'),
    );
    expect(changed).not.toBe(first);
  });

  it('locks non-JSON value semantics so fingerprint changes are explicit', () => {
    expect(stableStringify({ a: undefined })).toBe('{"a":undefined}');
    expect(stableStringify([undefined])).toBe('[]');
  });
});
