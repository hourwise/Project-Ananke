import { describe, it, expect, beforeEach } from 'vitest';
import { Gateway } from '../src/index.js';

function createGateway(): Gateway {
  const gw = new Gateway();

  gw.registerTool({
    name: 'calendar.list_events',
    server: 'test',
    description: 'List calendar events',
    riskClass: 'READ_ONLY',
    requiresApproval: false,
  });

  gw.registerTool({
    name: 'gmail.send_email',
    server: 'test',
    description: 'Send an email',
    riskClass: 'EXTERNAL_SEND',
    requiresApproval: true,
  });

  gw.registerTool({
    name: 'github.delete_branch',
    server: 'test',
    description: 'Delete a git branch',
    riskClass: 'DELETE',
    requiresApproval: true,
  });

  gw.setExecutor('calendar.list_events', async () => ({
    events: [{ id: '1', title: 'Test' }],
  }));

  let lastEmail: Record<string, unknown> | null = null;
  gw.setExecutor('gmail.send_email', async (args) => {
    lastEmail = args;
    const body = String(args.body ?? '');
    if (body.includes('Ignore previous instructions')) {
      return { sent: true, flagged: true };
    }
    return { sent: true, messageId: 'msg_test' };
  });

  gw.setExecutor('github.delete_branch', async (args) => {
    if (String(args.branch) === 'main') {
      throw new Error('PERMISSION_DENIED: Cannot delete protected branch');
    }
    return { deleted: true };
  });

  return gw;
}

describe('Gateway — Safe Read (Test 1)', () => {
  let gw: Gateway;

  beforeEach(() => {
    gw = createGateway();
  });

  it('allows safe read without approval', async () => {
    const result = await gw.execute('calendar.list_events', {});
    expect(result.outcome.state).toBe('COMPLETED');
    expect(result.approvalRequired).toBeUndefined();
  });

  it('does not require approval for READ_ONLY tools', async () => {
    const result = await gw.execute('calendar.list_events', { date: '2026-07-06' });
    expect(result.approvalRequired).toBeUndefined();
    expect(result.outcome.state).toBe('COMPLETED');
  });
});

describe('Gateway — Risky Write (Test 2)', () => {
  let gw: Gateway;

  beforeEach(() => {
    gw = createGateway();
  });

  it('requires approval for external send', async () => {
    const result = await gw.execute('gmail.send_email', {
      to: 'bob@example.com',
      subject: 'Update',
      body: 'Here is the update.',
    });
    expect(result.approvalRequired).toBe(true);
    expect(result.approvalGrantId).toBeDefined();
  });
});

describe('Gateway — Approval Binding (Tests 3 & 4)', () => {
  let gw: Gateway;

  beforeEach(() => {
    gw = createGateway();
  });

  it('executes when exact approved args are retried', async () => {
    const emailArgs = { to: 'bob@example.com', subject: 'Update', body: 'Approved body.' };

    // First attempt — should require approval
    const r1 = await gw.execute('gmail.send_email', emailArgs);
    expect(r1.approvalRequired).toBe(true);
    expect(r1.approvalGrantId).toBeDefined();

    // Retry with approval
    const r2 = await gw.execute('gmail.send_email', emailArgs, { approvalId: r1.approvalGrantId });
    expect(r2.outcome.state).toBe('COMPLETED');
  });

  it('blocks execution when approved args are modified', async () => {
    const originalArgs = { to: 'bob@example.com', subject: 'Update', body: 'Approved body.' };
    const modifiedArgs = { to: 'bob@example.com', subject: 'Update', body: 'Malicious body!' };

    // Get approval for original
    const r1 = await gw.execute('gmail.send_email', originalArgs);
    expect(r1.approvalGrantId).toBeDefined();

    // Try with modified args
    const r2 = await gw.execute('gmail.send_email', modifiedArgs, { approvalId: r1.approvalGrantId });
    expect(r2.outcome.state).toBe('APPROVAL_INVALIDATED');
    expect(r2.outcome.reasonCode).toBe('APPROVAL_HASH_MISMATCH');
  });
});

describe('Gateway — Policy Deny (Test 6)', () => {
  it('denies unknown unregistered tools', async () => {
    const gw = createGateway();
    const result = await gw.execute('dangerous_unknown_tool', {});
    expect(result.outcome.state).toBe('DENIED');
    expect(result.outcome.reasonCode).toBe('POLICY_DENIED');
    expect(result.outcome.retryable).toBe(false);
  });
});

describe('Gateway — Permission Errors', () => {
  it('returns typed error for permission denied', async () => {
    const gw = createGateway();

    // Request approval first
    const r1 = await gw.execute('github.delete_branch', { branch: 'main' });
    expect(r1.approvalGrantId).toBeDefined();

    // Execute with approval — should fail with PERMISSION_DENIED
    const r2 = await gw.execute('github.delete_branch', { branch: 'main' }, { approvalId: r1.approvalGrantId });
    expect(r2.outcome.state).toBe('FAILED');
    expect(r2.outcome.reasonCode).toBe('PERMISSION_DENIED');
  });
});

describe('Gateway — Audit Completeness', () => {
  it('logs every stage of a safe read', async () => {
    const gw = createGateway();
    await gw.execute('calendar.list_events', {});
    const events = gw.audit.all();

    const types = events.map((e) => e.eventType);
    expect(types).toContain('TOOL_CALL_REQUESTED');
    expect(types).toContain('POLICY_CHECKED');
    expect(types).toContain('TOOL_EXECUTED');
    expect(types).toContain('OUTCOME_GENERATED');
  });

  it('logs approval flow stages', async () => {
    const gw = createGateway();
    const args = { to: 'a@b.com', subject: 'S', body: 'B' };

    await gw.execute('gmail.send_email', args);

    const events = gw.audit.all();
    const types = events.map((e) => e.eventType);
    expect(types).toContain('APPROVAL_REQUESTED');
  });
});
