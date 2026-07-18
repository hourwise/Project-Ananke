import { describe, it, expect, beforeEach } from 'vitest';
import { canonicalJson, hashCanonicalCall, verifyApprovalBinding } from './canonical-hash.js';

const TEST_OPERATOR = {
  operatorId: 'tester',
  displayName: 'Test Operator',
  sessionId: 'test-session',
  authMethod: 'dev-token' as const,
  roles: ['admin' as const],
  authenticatedAt: '2026-01-01T00:00:00.000Z',
};

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

  it('rejects JavaScript-only values instead of coercing them into the approved JSON payload', () => {
    const unsupportedValues = [
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -0,
      1n,
      new Date('2026-01-01T00:00:00.000Z'),
      () => undefined,
      Symbol('value'),
    ];

    for (const value of unsupportedValues) {
      expect(() => canonicalJson({ value })).toThrow(
        'Approval payload must contain only JSON data',
      );
    }
  });

  it('blocks values that JSON.stringify would collide with null or an omitted field', () => {
    expect(hashCanonicalCall({ value: null })).not.toBe(hashCanonicalCall({ value: 'null' }));
    expect(() => hashCanonicalCall({ value: Number.NaN })).toThrow('numbers must be finite');
    expect(() => hashCanonicalCall({ value: undefined })).toThrow('unsupported undefined value');
  });

  it('rejects sparse arrays, accessors, non-enumerable fields, and shared references', () => {
    const sparse = ['approved', , 'payload'];
    expect(() => canonicalJson({ sparse })).toThrow('sparse arrays are not supported');

    const accessor: Record<string, unknown> = {};
    Object.defineProperty(accessor, 'value', { enumerable: true, get: () => 'approved' });
    expect(() => canonicalJson(accessor)).toThrow('accessor properties are not supported');

    const hidden: Record<string, unknown> = { value: 'approved' };
    Object.defineProperty(hidden, 'internal', { value: 'not-hashed' });
    expect(() => canonicalJson(hidden)).toThrow('non-enumerable properties are not supported');

    const shared = { value: 'approved' };
    expect(() => canonicalJson({ first: shared, second: shared })).toThrow(
      'shared object references are not supported',
    );
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

  const executionContext = {
    authenticatedPrincipal: { id: 'service-1', kind: 'service', tenantId: 'tenant-1' },
    actingPrincipal: { id: 'agent-1', kind: 'agent', tenantId: 'tenant-1' },
    runtimeId: 'ananke',
    runtimeInstanceId: 'test-runtime',
    tenantId: 'tenant-1',
    resourceScope: {
      mode: 'bounded',
      tenantId: 'tenant-1',
      resourceType: 'mail',
      resourceIds: ['mailbox-1'],
      operations: ['send'],
    },
    sessionId: 'agent-session-1',
    correlation: { requestId: 'request-1', correlationId: 'correlation-1', actionId: 'action-1' },
    policyVersion: 'policy-v1',
  };
  const expiresAt = '2999-01-01T00:00:00.000Z';

  function store(id: string, args: Record<string, unknown>, expiry = expiresAt) {
    return approvalStore.storeApproval(
      id,
      'mail-server',
      'send_email',
      args,
      executionContext,
      expiry,
    );
  }

  function validate(id: string, args: Record<string, unknown>, overrides = {}) {
    return approvalStore.validateApproval(id, {
      serverName: 'mail-server',
      toolName: 'send_email',
      arguments: args,
      executionContext,
      ...overrides,
    });
  }

  it('validates an exact match', () => {
    const args = { to: 'bob@example.com', body: 'Hi' };
    store('test-1', args);
    approvalStore.approveApproval('test-1', TEST_OPERATOR);
    const result = validate('test-1', args);
    expect(result.valid).toBe(true);
    expect(result.grant?.approvedBy).toBe('tester');
    expect(result.grant?.approvedBySessionId).toBe('test-session');
  });

  it('does not validate an approval before human approval', () => {
    const args = { to: 'bob@example.com', body: 'Hi' };
    store('test-pending', args);
    const result = validate('test-pending', args);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Approval pending');
  });

  it('does not validate a rejected approval', () => {
    const args = { to: 'bob@example.com', body: 'Hi' };
    store('test-rejected', args);
    approvalStore.rejectApproval('test-rejected', TEST_OPERATOR);
    const result = validate('test-rejected', args);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Approval rejected');
  });

  it('rejects a mismatch', () => {
    const args = { to: 'bob@example.com', body: 'Hi' };
    const modified = { to: 'bob@example.com', body: 'Bye' };
    store('test-2', args);
    approvalStore.approveApproval('test-2', TEST_OPERATOR);
    const result = validate('test-2', modified);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('APPROVAL_HASH_MISMATCH');
  });

  it('rejects already-consumed approvals', () => {
    const args = { body: 'Hi' };
    store('test-3', args);
    approvalStore.approveApproval('test-3', TEST_OPERATOR);
    approvalStore.consumeApproval('test-3');
    const result = validate('test-3', args);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Approval already used');
  });

  it('rejects expired approvals', () => {
    const args = { body: 'Hi' };
    store('test-expired', args, '2000-01-01T00:00:00.000Z');
    const approval = approvalStore.approveApproval('test-expired', TEST_OPERATOR);
    const result = validate('test-expired', args);

    expect(approval).toBeUndefined();
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Approval expired');
  });

  it.each([
    ['server', { serverName: 'other-server' }],
    ['tool', { toolName: 'delete_email' }],
    [
      'acting agent principal',
      {
        executionContext: {
          ...executionContext,
          actingPrincipal: { ...executionContext.actingPrincipal, id: 'agent-2' },
        },
      },
    ],
    [
      'authenticated principal',
      {
        executionContext: {
          ...executionContext,
          authenticatedPrincipal: { ...executionContext.authenticatedPrincipal, id: 'service-2' },
        },
      },
    ],
    ['tenant', { executionContext: { ...executionContext, tenantId: 'tenant-2' } }],
    [
      'resource scope',
      {
        executionContext: {
          ...executionContext,
          resourceScope: { ...executionContext.resourceScope, resourceIds: ['mailbox-2'] },
        },
      },
    ],
    ['agent session', { executionContext: { ...executionContext, sessionId: 'agent-session-2' } }],
    ['policy version', { executionContext: { ...executionContext, policyVersion: 'policy-v2' } }],
  ])('rejects reuse for a different %s', (_label, override) => {
    const args = { body: 'Hi' };
    store('fully-bound', args);
    approvalStore.approveApproval('fully-bound', TEST_OPERATOR);

    expect(validate('fully-bound', args, override).reason).toBe('APPROVAL_HASH_MISMATCH');
  });

  it('rejects a tampered human binding', () => {
    const args = { body: 'Hi' };
    const grant = store('human-bound', args);
    approvalStore.approveApproval('human-bound', TEST_OPERATOR);
    grant.approvedBy = 'different-human';

    expect(validate('human-bound', args).reason).toBe('APPROVAL_HASH_MISMATCH');
  });
});
