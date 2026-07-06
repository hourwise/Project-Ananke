import { describe, it, expect, beforeEach } from 'vitest';
import { hashCanonicalCall, verifyApprovalBinding } from '../src/canonical-hash.js';

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
