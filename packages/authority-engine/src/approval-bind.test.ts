import { describe, it, expect, beforeEach } from 'vitest';
import { canonicalJson, hashCanonicalCall, verifyApprovalBinding } from './canonical-hash.js';

describe('Canonical Hash', () => {
  it('produces the same hash for logically identical objects', () => {
    const a = { name: 'Alice', age: 30 };
    const b = { age: 30, name: 'Alice' }; // different key order
    expect(hashCanonicalCall(a)).toBe(hashCanonicalCall(b));
  });

  it('produces different hashes for different objects', () => {
    const a = { body: 'Hello' };
    const b = { body: 'Goodbye' };
    expect(hashCanonicalCall(a)).not.toBe(hashCanonicalCall(b));
  });

  it('verifyApprovalBinding detects exact matches', () => {
    const approved = { to: 'bob@example.com', subject: 'Hi' };
    const same = { subject: 'Hi', to: 'bob@example.com' };
    const different = { subject: 'Hi', to: 'alice@example.com' };

    expect(verifyApprovalBinding(approved, same)).toBe(true);
    expect(verifyApprovalBinding(approved, different)).toBe(false);
  });

  it('detects even small changes', () => {
    const approved = { body: 'Hello, world!' };
    const modified = { body: 'Hello, world.' };
    expect(verifyApprovalBinding(approved, modified)).toBe(false);
  });

  it('handles nested objects deterministically', () => {
    const a = { user: { name: 'Alice', id: 1 }, action: 'send' };
    const b = { action: 'send', user: { id: 1, name: 'Alice' } };
    expect(hashCanonicalCall(a)).toBe(hashCanonicalCall(b));
  });

  it('sorts nested object keys recursively', () => {
    const a = {
      outer: {
        zebra: { beta: 2, alpha: 1 },
        apple: { delta: 4, charlie: 3 },
      },
    };
    const b = {
      outer: {
        apple: { charlie: 3, delta: 4 },
        zebra: { alpha: 1, beta: 2 },
      },
    };

    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(hashCanonicalCall(a)).toBe(hashCanonicalCall(b));
  });

  it('preserves array order', () => {
    const approved = { steps: ['read', 'write', 'audit'] };
    const reordered = { steps: ['write', 'read', 'audit'] };

    expect(hashCanonicalCall(approved)).not.toBe(hashCanonicalCall(reordered));
  });

  it('treats null and missing fields differently', () => {
    const withNull = { path: 'note.txt', metadata: null };
    const missing = { path: 'note.txt' };

    expect(hashCanonicalCall(withNull)).not.toBe(hashCanonicalCall(missing));
  });

  it('does not normalize unicode strings', () => {
    const composed = { value: '\u00e9' };
    const decomposed = { value: 'e\u0301' };

    expect(composed.value.normalize('NFC')).toBe(decomposed.value.normalize('NFC'));
    expect(hashCanonicalCall(composed)).not.toBe(hashCanonicalCall(decomposed));
  });

  it('serializes 1 and 1.0 identically under JavaScript JSON semantics', () => {
    const integerLiteral = { amount: 1 };
    const decimalLiteral = { amount: 1.0 };

    expect(canonicalJson(integerLiteral)).toBe('{"amount":1}');
    expect(hashCanonicalCall(integerLiteral)).toBe(hashCanonicalCall(decimalLiteral));
  });

  it('preserves whitespace inside strings', () => {
    const singleSpace = { body: 'hello world' };
    const doubleSpace = { body: 'hello  world' };
    const trailingSpace = { body: 'hello world ' };

    expect(hashCanonicalCall(singleSpace)).not.toBe(hashCanonicalCall(doubleSpace));
    expect(hashCanonicalCall(singleSpace)).not.toBe(hashCanonicalCall(trailingSpace));
  });

  it('handles deeply nested canonical JSON deterministically', () => {
    const a = {
      z: {
        y: {
          x: {
            c: [{ b: 2, a: 1 }],
            b: null,
            a: { right: true, left: false },
          },
        },
      },
    };
    const b = {
      z: {
        y: {
          x: {
            a: { left: false, right: true },
            b: null,
            c: [{ a: 1, b: 2 }],
          },
        },
      },
    };

    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(hashCanonicalCall(a)).toBe(hashCanonicalCall(b));
  });
});

describe('Approval Store', () => {
  // Import the module to get fresh state
  let approvalStore: typeof import('../src/approval-store.js');

  beforeEach(async () => {
    // Re-import to get a fresh module with cleared state
    approvalStore = await import('../src/approval-store.js');
    approvalStore.clearApprovals();
  });

  it('validates an exact match', () => {
    const args = { to: 'bob@example.com', body: 'Hi' };
    const grant = approvalStore.storeApproval('test-1', 'send_email', args);
    const result = approvalStore.validateApproval('test-1', args);
    expect(result.valid).toBe(true);
  });

  it('rejects a mismatch', () => {
    const args = { to: 'bob@example.com', body: 'Hi' };
    const modified = { to: 'bob@example.com', body: 'Bye' };
    approvalStore.storeApproval('test-2', 'send_email', args);
    const result = approvalStore.validateApproval('test-2', modified);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('APPROVAL_HASH_MISMATCH');
  });

  it('rejects already-consumed approvals', () => {
    const args = { body: 'Hi' };
    approvalStore.storeApproval('test-3', 'send_email', args);
    approvalStore.consumeApproval('test-3');
    const result = approvalStore.validateApproval('test-3', args);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Approval already used');
  });
});
