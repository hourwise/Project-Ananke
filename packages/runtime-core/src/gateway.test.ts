import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach } from 'vitest';
import { Gateway } from './index.js';
import { createGatewayRoutes } from './routes.js';

const TEST_OPERATOR = {
  operatorId: 'tester',
  displayName: 'Test Operator',
  sessionId: 'test-session',
  authMethod: 'dev-token' as const,
  roles: ['admin' as const],
  authenticatedAt: '2026-01-01T00:00:00.000Z',
};

const TEST_EXECUTION_CONTEXT = {
  agentPrincipalId: 'test-agent',
  tenantId: 'test-tenant',
  resourceScope: 'test:*',
  sessionId: 'test-agent-session',
  policyVersion: 'builtin:0.1.0',
};

const APPROVAL_AUTH_HEADERS = {
  authorization: 'Bearer dev-approval-token',
  'content-type': 'application/json',
};

function createGateway(): Gateway {
  const gw = new Gateway({
    developmentMode: true,
    embeddedExecutionContext: TEST_EXECUTION_CONTEXT,
  });
  gw.approvals.clear();

  gw.registerTool({
    name: 'calendar.list_events',
    server: 'test',
    description: 'List calendar events',
    riskClass: 'READ_ONLY',
    requiredPermissions: [],
    retryable: false,
    requiresApproval: false,
  });

  gw.registerTool({
    name: 'gmail.send_email',
    server: 'test',
    description: 'Send an email',
    riskClass: 'EXTERNAL_SEND',
    requiredPermissions: [],
    retryable: false,
    requiresApproval: true,
  });

  gw.registerTool({
    name: 'github.delete_branch',
    server: 'test',
    description: 'Delete a git branch',
    riskClass: 'DELETE',
    requiredPermissions: [],
    retryable: false,
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

describe('Gateway â€” Safe Read (Test 1)', () => {
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

describe('Gateway â€” Risky Write (Test 2)', () => {
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

  it('returns WAITING_FOR_APPROVAL state, not DENIED', async () => {
    const result = await gw.execute('gmail.send_email', {
      to: 'bob@example.com',
      subject: 'Update',
      body: 'Here is the update.',
    });
    expect(result.outcome.state).toBe('WAITING_FOR_APPROVAL');
    expect(result.outcome.reasonCode).toBe('APPROVAL_REQUIRED');
    expect(result.outcome.retryable).toBe(true);
  });
});

describe('Gateway â€” Approval Binding (Tests 3 & 4)', () => {
  let gw: Gateway;

  beforeEach(() => {
    gw = createGateway();
  });

  it('executes when exact approved args are retried', async () => {
    const emailArgs = { to: 'bob@example.com', subject: 'Update', body: 'Approved body.' };

    // First attempt â€” should require approval
    const r1 = await gw.execute('gmail.send_email', emailArgs);
    expect(r1.approvalRequired).toBe(true);
    expect(r1.approvalGrantId).toBeDefined();
    gw.approvals.approve(r1.approvalGrantId!, TEST_OPERATOR);

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
    gw.approvals.approve(r1.approvalGrantId!, TEST_OPERATOR);

    // Try with modified args
    const r2 = await gw.execute('gmail.send_email', modifiedArgs, {
      approvalId: r1.approvalGrantId,
    });
    expect(r2.outcome.state).toBe('APPROVAL_INVALIDATED');
    expect(r2.outcome.reasonCode).toBe('APPROVAL_HASH_MISMATCH');
  });

  it('blocks approval reuse across tools even when arguments are identical', async () => {
    gw.registerTool({
      name: 'gmail.forward_email',
      server: 'test',
      riskClass: 'EXTERNAL_SEND',
      requiredPermissions: [],
      retryable: false,
      requiresApproval: true,
    });
    gw.setExecutor('gmail.forward_email', async () => ({ forwarded: true }));
    const args = { to: 'bob@example.com', subject: 'Update', body: 'Approved body.' };
    const requested = await gw.execute('gmail.send_email', args);
    gw.approvals.approve(requested.approvalGrantId!, TEST_OPERATOR);

    const reused = await gw.execute('gmail.forward_email', args, {
      approvalId: requested.approvalGrantId,
    });
    expect(reused.outcome.state).toBe('APPROVAL_INVALIDATED');
    expect(reused.outcome.reasonCode).toBe('APPROVAL_HASH_MISMATCH');
  });

  it('blocks approval reuse across execution principals', async () => {
    const args = { to: 'bob@example.com', subject: 'Update', body: 'Approved body.' };
    const requested = await gw.execute('gmail.send_email', args);
    gw.approvals.approve(requested.approvalGrantId!, TEST_OPERATOR);

    const reused = await gw.execute('gmail.send_email', args, {
      approvalId: requested.approvalGrantId,
      executionContext: { ...TEST_EXECUTION_CONTEXT, agentPrincipalId: 'other-agent' },
    });
    expect(reused.outcome.state).toBe('APPROVAL_INVALIDATED');
  });
});

describe('Gateway execution authentication', () => {
  it('fails closed for embedded execution without an explicit context', async () => {
    const gateway = new Gateway({ autoLoadPolicy: false });
    gateway.registerTool({
      name: 'safe.read',
      server: 'test',
      riskClass: 'READ_ONLY',
      requiredPermissions: [],
      retryable: false,
      requiresApproval: false,
    });
    gateway.setExecutor('safe.read', async () => ({ secret: 'must-not-run' }));
    const result = await gateway.execute('safe.read', {});
    expect(result.outcome).toMatchObject({ state: 'DENIED', reasonCode: 'PERMISSION_DENIED' });
  });

  it('requires a workload credential on the HTTP execute route', async () => {
    const response = await createGatewayRoutes(createGateway()).request('/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ toolName: 'calendar.list_events', arguments: {} }),
    });
    expect(response.status).toBe(401);
  });

  it('accepts the bundled execution token only with explicit development mode', async () => {
    const body = JSON.stringify({ toolName: 'calendar.list_events', arguments: {} });
    const headers = {
      authorization: 'Bearer dev-execution-token',
      'content-type': 'application/json',
    };
    const closed = createGatewayRoutes(new Gateway({ autoLoadPolicy: false }));
    expect((await closed.request('/execute', { method: 'POST', headers, body })).status).toBe(401);
    expect(
      (
        await createGatewayRoutes(createGateway()).request('/execute', {
          method: 'POST',
          headers,
          body,
        })
      ).status,
    ).toBe(200);
  });

  it('does not enable the bundled admin token by default', async () => {
    const routes = createGatewayRoutes(new Gateway({ autoLoadPolicy: false }));
    expect((await routes.request('/auth/me', { headers: APPROVAL_AUTH_HEADERS })).status).toBe(401);
  });
});

describe('Gateway â€” Policy Deny (Test 6)', () => {
  it('denies unknown unregistered tools', async () => {
    const gw = createGateway();
    const result = await gw.execute('dangerous_unknown_tool', {});
    expect(result.outcome.state).toBe('DENIED');
    expect(result.outcome.reasonCode).toBe('POLICY_DENIED');
    expect(result.outcome.retryable).toBe(false);
  });
});

describe('Gateway policy file loading', () => {
  it('loads explicit policy file overrides', async () => {
    const dir = join(tmpdir(), `ananke-gateway-policy-${crypto.randomUUID()}`);
    mkdirSync(dir, { recursive: true });

    try {
      const policyFile = join(dir, 'ananke.policy.yaml');
      writeFileSync(
        policyFile,
        [
          'tools:',
          '  gmail.send_email:',
          '    risk: EXTERNAL_SEND',
          '    approval: never',
          '',
        ].join('\n'),
      );

      const configured = new Gateway({
        policyFile,
        embeddedExecutionContext: TEST_EXECUTION_CONTEXT,
      });
      configured.approvals.clear();
      configured.registerTool({
        name: 'gmail.send_email',
        server: 'test',
        description: 'Send an email',
        riskClass: 'EXTERNAL_SEND',
        requiredPermissions: [],
        retryable: false,
        requiresApproval: true,
      });
      configured.setExecutor('gmail.send_email', async () => ({ sent: true }));

      const result = await configured.execute('gmail.send_email', {
        to: 'a@b.com',
        subject: 'S',
        body: 'B',
      });

      expect(result.outcome.state).toBe('COMPLETED');
      expect(result.approvalRequired).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Gateway â€” Outcome Semantics: DENIED vs WAITING_FOR_APPROVAL vs APPROVAL_INVALIDATED', () => {
  it('DENIED is final and non-retryable â€” agents must not retry', async () => {
    const gw = createGateway();
    const result = await gw.execute('dangerous_unknown_tool', {});
    expect(result.outcome.state).toBe('DENIED');
    expect(result.outcome.reasonCode).toBe('POLICY_DENIED');
    expect(result.outcome.retryable).toBe(false);
    expect(result.outcome.safeToContinue).toBe(false);
    expect(result.approvalRequired).toBeUndefined();
    expect(result.approvalGrantId).toBeUndefined();
  });

  it('WAITING_FOR_APPROVAL is recoverable â€” agent can retry with approvalId', async () => {
    const gw = createGateway();
    const result = await gw.execute('gmail.send_email', {
      to: 'bob@example.com',
      subject: 'Update',
      body: 'Please approve.',
    });
    expect(result.outcome.state).toBe('WAITING_FOR_APPROVAL');
    expect(result.outcome.reasonCode).toBe('APPROVAL_REQUIRED');
    expect(result.outcome.retryable).toBe(true);
    expect(result.outcome.requiresUser).toBe(true);
    expect(result.approvalRequired).toBe(true);
    expect(result.approvalGrantId).toBeDefined();
    // The grant ID lets the agent retry the exact same call
    expect(result.outcome.nextAction).toContain(result.approvalGrantId);
  });

  it('APPROVAL_INVALIDATED means the approved content was tampered with', async () => {
    const gw = createGateway();
    const originalArgs = { to: 'bob@example.com', subject: 'Update', body: 'Approved body.' };
    const modifiedArgs = { to: 'bob@example.com', subject: 'Update', body: 'Malicious body!' };

    const r1 = await gw.execute('gmail.send_email', originalArgs);
    expect(r1.outcome.state).toBe('WAITING_FOR_APPROVAL');
    gw.approvals.approve(r1.approvalGrantId!, TEST_OPERATOR);

    const r2 = await gw.execute('gmail.send_email', modifiedArgs, {
      approvalId: r1.approvalGrantId,
    });
    expect(r2.outcome.state).toBe('APPROVAL_INVALIDATED');
    expect(r2.outcome.reasonCode).toBe('APPROVAL_HASH_MISMATCH');
    expect(r2.outcome.retryable).toBe(false);
    expect(r2.outcome.requiresUser).toBe(true);
    expect(r2.approvalRequired).toBeUndefined();
  });

  it('agents can programmatically distinguish all three states', async () => {
    const gw = createGateway();

    // DENIED
    const denied = await gw.execute('dangerous_unknown_tool', {});
    expect(denied.outcome.state).toBe('DENIED');
    expect(denied.outcome.retryable).toBe(false);
    expect(denied.approvalRequired).toBeUndefined();

    // WAITING_FOR_APPROVAL
    const waiting = await gw.execute('gmail.send_email', {
      to: 'a@b.com',
      subject: 'S',
      body: 'B',
    });
    expect(waiting.outcome.state).toBe('WAITING_FOR_APPROVAL');
    expect(waiting.outcome.retryable).toBe(true);
    expect(waiting.approvalRequired).toBe(true);
    expect(waiting.approvalGrantId).toBeDefined();
    gw.approvals.approve(waiting.approvalGrantId!, TEST_OPERATOR);

    // APPROVAL_INVALIDATED
    const invalidated = await gw.execute(
      'gmail.send_email',
      { to: 'a@b.com', subject: 'S', body: 'Tampered!' },
      { approvalId: waiting.approvalGrantId },
    );
    expect(invalidated.outcome.state).toBe('APPROVAL_INVALIDATED');
    expect(invalidated.outcome.reasonCode).toBe('APPROVAL_HASH_MISMATCH');
    expect(invalidated.outcome.retryable).toBe(false);
    expect(invalidated.approvalRequired).toBeUndefined();

    // All three states are distinct
    const states = [denied.outcome.state, waiting.outcome.state, invalidated.outcome.state];
    expect(new Set(states).size).toBe(3);
  });
});

describe('Gateway â€” Permission Errors', () => {
  it('returns typed error for permission denied', async () => {
    const gw = createGateway();

    // Request approval first
    const r1 = await gw.execute('github.delete_branch', { branch: 'main' });
    expect(r1.approvalGrantId).toBeDefined();
    gw.approvals.approve(r1.approvalGrantId!, TEST_OPERATOR);

    // Execute with approval â€” should fail with PERMISSION_DENIED
    const r2 = await gw.execute(
      'github.delete_branch',
      { branch: 'main' },
      { approvalId: r1.approvalGrantId },
    );
    expect(r2.outcome.state).toBe('FAILED');
    expect(r2.outcome.reasonCode).toBe('PERMISSION_DENIED');
  });
});

describe('Gateway â€” Audit Completeness', () => {
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

describe('Gateway approval API', () => {
  it('lists pending approvals with risk class and canonical payload', async () => {
    const gw = createGateway();
    await gw.execute('gmail.send_email', { to: 'a@b.com', subject: 'S', body: 'B' });

    const routes = createGatewayRoutes(gw);
    const response = await routes.request('/approvals', {
      headers: APPROVAL_AUTH_HEADERS,
    });
    expect(response.status).toBe(200);

    const approvals = (await response.json()) as Array<{
      riskClass: string;
      canonicalPayload: string;
      status: string;
    }>;
    expect(approvals).toHaveLength(1);
    expect(approvals[0]!.riskClass).toBe('EXTERNAL_SEND');
    expect(approvals[0]!.status).toBe('pending');
    expect(approvals[0]!.canonicalPayload).toBe('{"body":"B","subject":"S","to":"a@b.com"}');
  });

  it('requires dashboard approval before retry succeeds', async () => {
    const gw = createGateway();
    const args = { to: 'a@b.com', subject: 'S', body: 'B' };
    const requested = await gw.execute('gmail.send_email', args);

    const beforeApproval = await gw.execute('gmail.send_email', args, {
      approvalId: requested.approvalGrantId,
    });
    expect(beforeApproval.outcome.state).toBe('WAITING_FOR_APPROVAL');

    const routes = createGatewayRoutes(gw);
    const approveResponse = await routes.request(
      `/approvals/${requested.approvalGrantId}/approve`,
      {
        method: 'POST',
        body: JSON.stringify({ approvedBy: 'spoofed-attacker' }),
        headers: APPROVAL_AUTH_HEADERS,
      },
    );
    expect(approveResponse.status).toBe(200);
    const approvedGrant = (await approveResponse.json()) as {
      approvedBy: string;
      approvedBySessionId: string;
    };
    expect(approvedGrant.approvedBy).toBe('local-dashboard');
    expect(approvedGrant.approvedBySessionId).toBe('local-dev-session');

    const grantedEvent = gw.audit.query({ eventType: 'APPROVAL_GRANTED' }).at(-1);
    expect(grantedEvent?.metadata).toMatchObject({
      decision: 'approved',
      operatorId: expect.stringMatching(/^sha256:/),
      sessionId: expect.stringMatching(/^sha256:/),
      authMethod: 'dev-token',
      operatorRoles: ['admin'],
    });

    const afterApproval = await gw.execute('gmail.send_email', args, {
      approvalId: requested.approvalGrantId,
    });
    expect(afterApproval.outcome.state).toBe('COMPLETED');
  });

  it('rejects approvals through the API', async () => {
    const gw = createGateway();
    const args = { to: 'a@b.com', subject: 'S', body: 'B' };
    const requested = await gw.execute('gmail.send_email', args);

    const routes = createGatewayRoutes(gw);
    const rejectResponse = await routes.request(`/approvals/${requested.approvalGrantId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejectedBy: 'spoofed-attacker' }),
      headers: APPROVAL_AUTH_HEADERS,
    });
    expect(rejectResponse.status).toBe(200);
    const rejectedGrant = (await rejectResponse.json()) as {
      rejectedBy: string;
      rejectedBySessionId: string;
    };
    expect(rejectedGrant.rejectedBy).toBe('local-dashboard');
    expect(rejectedGrant.rejectedBySessionId).toBe('local-dev-session');

    const deniedEvent = gw.audit.query({ eventType: 'APPROVAL_DENIED' }).at(-1);
    expect(deniedEvent?.metadata).toMatchObject({
      decision: 'rejected',
      operatorId: expect.stringMatching(/^sha256:/),
      sessionId: expect.stringMatching(/^sha256:/),
      authMethod: 'dev-token',
      operatorRoles: ['admin'],
    });

    const afterRejection = await gw.execute('gmail.send_email', args, {
      approvalId: requested.approvalGrantId,
    });
    expect(afterRejection.outcome.state).toBe('DENIED');
    expect(gw.approvals.pending()).toHaveLength(0);
  });

  it('rejects unauthenticated approval decisions', async () => {
    const gw = createGateway();
    const requested = await gw.execute('gmail.send_email', {
      to: 'a@b.com',
      subject: 'S',
      body: 'B',
    });

    const routes = createGatewayRoutes(gw);
    const approveResponse = await routes.request(
      `/approvals/${requested.approvalGrantId}/approve`,
      {
        method: 'POST',
      },
    );

    expect(approveResponse.status).toBe(401);
    expect(gw.approvals.get(requested.approvalGrantId!)?.status).toBe('pending');
  });

  it('rejects invalid approval operator tokens', async () => {
    const gw = createGateway();
    const requested = await gw.execute('gmail.send_email', {
      to: 'a@b.com',
      subject: 'S',
      body: 'B',
    });

    const routes = createGatewayRoutes(gw);
    const approveResponse = await routes.request(
      `/approvals/${requested.approvalGrantId}/approve`,
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer not-valid',
        },
      },
    );

    expect(approveResponse.status).toBe(401);
    expect(gw.approvals.get(requested.approvalGrantId!)?.status).toBe('pending');
  });
});

describe('Gateway audit API', () => {
  it('requires an authenticated operator because audit events can contain tool arguments', async () => {
    const gw = createGateway();
    await gw.execute('calendar.list_events', { calendarId: 'private-calendar' });

    const routes = createGatewayRoutes(gw);
    const response = await routes.request('/audit');

    expect(response.status).toBe(401);
  });

  it('returns authenticated, filtered audit events', async () => {
    const gw = createGateway();
    await gw.execute('calendar.list_events', {});
    await gw.execute('gmail.send_email', { to: 'a@b.com', subject: 'S', body: 'B' });

    const routes = createGatewayRoutes(gw);
    const response = await routes.request('/audit?eventType=APPROVAL_REQUESTED', {
      headers: APPROVAL_AUTH_HEADERS,
    });

    expect(response.status).toBe(200);
    const events = (await response.json()) as Array<{ eventType: string; toolName: string }>;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'APPROVAL_REQUESTED',
      toolName: 'gmail.send_email',
    });
  });

  it('rejects invalid audit query filters', async () => {
    const gw = createGateway();
    const routes = createGatewayRoutes(gw);

    const invalidEventType = await routes.request('/audit?eventType=NOT_A_REAL_EVENT', {
      headers: APPROVAL_AUTH_HEADERS,
    });
    expect(invalidEventType.status).toBe(400);

    const invalidSince = await routes.request('/audit?since=not-a-timestamp', {
      headers: APPROVAL_AUTH_HEADERS,
    });
    expect(invalidSince.status).toBe(400);

    const invalidLimit = await routes.request('/audit?limit=501', {
      headers: APPROVAL_AUTH_HEADERS,
    });
    expect(invalidLimit.status).toBe(400);
  });
});

describe('Gateway operator RBAC', () => {
  const tokens = {
    'viewer-token': {
      operatorId: 'viewer-1',
      sessionId: 'viewer-session',
      roles: ['viewer' as const],
    },
    'approver-token': {
      operatorId: 'approver-1',
      sessionId: 'approver-session',
      roles: ['approver' as const],
    },
    'auditor-token': {
      operatorId: 'auditor-1',
      sessionId: 'auditor-session',
      roles: ['auditor' as const],
    },
  };

  function headers(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` };
  }

  it('exposes the authenticated principal and effective permissions', async () => {
    const routes = createGatewayRoutes(new Gateway({ operatorAuth: { tokens } }));
    const response = await routes.request('/auth/me', { headers: headers('approver-token') });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      operatorId: 'approver-1',
      sessionId: 'approver-session',
      roles: ['approver'],
      permissions: ['approvals:read', 'approvals:decide', 'stats:read'],
    });
  });

  it('allows approvers to decide approvals but denies access to audit data', async () => {
    const gw = new Gateway({ operatorAuth: { tokens } });
    const { grant } = gw.approvals.requestApproval(
      'test',
      'example.write',
      { value: 1 },
      TEST_EXECUTION_CONTEXT,
      new Date(Date.now() + 60_000).toISOString(),
    );
    const routes = createGatewayRoutes(gw);

    const approve = await routes.request(`/approvals/${grant.id}/approve`, {
      method: 'POST',
      headers: headers('approver-token'),
    });
    expect(approve.status).toBe(200);
    expect(gw.approvals.get(grant.id)?.approvedBy).toBe('approver-1');

    const audit = await routes.request('/audit', { headers: headers('approver-token') });
    expect(audit.status).toBe(403);
  });

  it('allows auditors to read audit data but denies approval decisions', async () => {
    const gw = new Gateway({ operatorAuth: { tokens } });
    const { grant } = gw.approvals.requestApproval(
      'test',
      'example.write',
      { value: 1 },
      TEST_EXECUTION_CONTEXT,
      new Date(Date.now() + 60_000).toISOString(),
    );
    const routes = createGatewayRoutes(gw);

    const audit = await routes.request('/audit', { headers: headers('auditor-token') });
    expect(audit.status).toBe(200);

    const approve = await routes.request(`/approvals/${grant.id}/approve`, {
      method: 'POST',
      headers: headers('auditor-token'),
    });
    expect(approve.status).toBe(403);
    expect(gw.approvals.get(grant.id)?.status).toBe('pending');
  });

  it('limits viewers to runtime statistics', async () => {
    const gw = new Gateway({ operatorAuth: { tokens } });
    const routes = createGatewayRoutes(gw);

    expect((await routes.request('/stats', { headers: headers('viewer-token') })).status).toBe(200);
    expect((await routes.request('/approvals', { headers: headers('viewer-token') })).status).toBe(
      403,
    );
    expect((await routes.request('/audit', { headers: headers('viewer-token') })).status).toBe(403);
  });

  it('requires authentication for runtime statistics', async () => {
    const routes = createGatewayRoutes(new Gateway({ operatorAuth: { tokens } }));
    expect((await routes.request('/stats')).status).toBe(401);
  });
});
