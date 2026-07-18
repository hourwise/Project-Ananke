import { describe, expect, it } from 'vitest';
import {
  CompatibilityManifestSchema,
  RuntimeHealthSchema,
  RuntimeIdentitySchema,
  RuntimeReadinessSchema,
  RuntimeRegistrationSchema,
} from 'project-runtime-contracts';
import { Gateway } from './index.js';
import { createGatewayRoutes } from './routes.js';

const trustedContext = {
  authenticatedPrincipal: { id: 'host-1', kind: 'service', tenantId: 'tenant-1' },
  actingPrincipal: { id: 'agent-1', kind: 'agent', tenantId: 'tenant-1' },
  runtimeId: 'ananke',
  runtimeInstanceId: 'runtime-test-1',
  tenantId: 'tenant-1',
  sessionId: 'session-1',
  resourceScope: {
    mode: 'bounded',
    tenantId: 'tenant-1',
    resourceType: 'filesystem',
    resourceIds: ['workspace-1'],
    operations: ['read', 'write'],
  },
  correlation: { requestId: 'request-1', correlationId: 'correlation-1', actionId: 'action-1' },
  policyVersion: 'builtin:0.1.0',
};

function gateway() {
  return new Gateway({
    autoLoadPolicy: false,
    developmentMode: true,
    embeddedExecutionContext: trustedContext,
  });
}

describe('runtime inspection and protocol negotiation', () => {
  it('returns schema-valid, stable, non-secret runtime snapshots', async () => {
    const runtime = gateway();
    const routes = createGatewayRoutes(runtime);
    const identity = await (await routes.request('/runtime/identity')).json();
    const health = await (await routes.request('/runtime/health')).json();
    const readiness = await (await routes.request('/runtime/readiness')).json();
    const registration = await (await routes.request('/runtime/registration')).json();
    const compatibility = await (await routes.request('/runtime/compatibility')).json();

    expect(RuntimeIdentitySchema.safeParse(identity).success).toBe(true);
    expect(RuntimeHealthSchema.safeParse(health).success).toBe(true);
    expect(RuntimeReadinessSchema.safeParse(readiness).success).toBe(true);
    expect(RuntimeRegistrationSchema.safeParse(registration).success).toBe(true);
    expect(CompatibilityManifestSchema.safeParse(compatibility).success).toBe(true);
    expect(runtime.runtimeIdentity().instanceId).toBe(runtime.runtimeIdentity().instanceId);
    expect(JSON.stringify({ identity, health, readiness, registration, compatibility })).not.toContain(
      'dev-execution-token',
    );
  });

  it('negotiates protocol ranges semantically and reports invalid peers', async () => {
    const routes = createGatewayRoutes(gateway());
    const request = async (protocolVersion: string, minimumProtocolVersion: string) =>
      (await routes.request('/runtime/negotiate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ protocolVersion, minimumProtocolVersion }),
      })).json();

    await expect(request('1.4.0', '1.0.0')).resolves.toMatchObject({
      compatible: true,
      negotiatedVersion: '1.4.0',
    });
    await expect(request('1.2.0', '1.0.0')).resolves.toMatchObject({
      compatible: true,
      negotiatedVersion: '1.2.0',
    });
    await expect(request('1.5.0', '1.5.0')).resolves.toMatchObject({
      compatible: false,
      reason: 'no_overlap',
    });
    await expect(request('2.0.0', '2.0.0')).resolves.toMatchObject({
      compatible: false,
      reason: 'unsupported_major',
    });
    await expect(request('invalid', '1.0.0')).resolves.toMatchObject({
      compatible: false,
      reason: 'malformed_version',
    });
    await expect(request('1.0.0', '1.4.0')).resolves.toMatchObject({
      compatible: false,
      reason: 'invalid_range',
    });
  });
});

describe('trusted correlation and approval binding', () => {
  it('ignores body identity, generates request IDs per HTTP attempt, and retains safe audit linkage', async () => {
    const runtime = gateway();
    runtime.registerTool({
      name: 'files.write',
      server: 'test',
      riskClass: 'INTERNAL_WRITE',
      requiredPermissions: [],
      requiresApproval: true,
    });
    runtime.setExecutor('files.write', async () => ({ written: true, token: 'must-not-leak' }));
    const routes = createGatewayRoutes(runtime);
    const response = await routes.request('/execute', {
      method: 'POST',
      headers: {
        authorization: 'Bearer dev-execution-token',
        'content-type': 'application/json',
        'x-ananke-correlation-id': 'correlation-http-1',
      },
      body: JSON.stringify({
        toolName: 'files.write',
        arguments: { secret: 'must-not-leak' },
        authenticatedPrincipal: { id: 'body-agent', kind: 'agent' },
        actingPrincipal: { id: 'body-human', kind: 'human' },
      }),
    });
    const result = await response.json();
    const grant = runtime.approvals.get(result.approvalGrantId);
    const event = runtime.audit.all().find((entry) => entry.eventType === 'TOOL_CALL_REQUESTED');

    expect(response.status).toBe(200);
    expect(grant?.executionContext.authenticatedPrincipal.kind).toBe('service');
    expect(grant?.executionContext.actingPrincipal.kind).toBe('agent');
    expect(event?.metadata).toMatchObject({ correlationId: 'correlation-http-1' });
    expect(event?.arguments).toEqual({ _redacted: true, fieldCount: 1 });
    expect(JSON.stringify(event)).not.toContain('must-not-leak');
  });

  it('allows an approved retry with a new per-attempt requestId but rejects a bound scope mutation', async () => {
    const runtime = gateway();
    runtime.approvals.clear();
    runtime.registerTool({
      name: 'files.write',
      server: 'test',
      riskClass: 'INTERNAL_WRITE',
      requiredPermissions: [],
      requiresApproval: true,
    });
    runtime.setExecutor('files.write', async () => ({ written: true }));

    const requested = await runtime.execute('files.write', { path: 'a.txt' });
    runtime.approvals.approve(requested.approvalGrantId!, {
      operatorId: 'operator-1',
      sessionId: 'operator-session-1',
      authMethod: 'dev-token',
      roles: ['admin'],
      authenticatedAt: new Date().toISOString(),
    });
    const approved = runtime.approvals.get(requested.approvalGrantId!)!;
    const retry = await runtime.execute('files.write', { path: 'a.txt' }, {
      approvalId: approved.id,
      executionContext: {
        ...approved.executionContext,
        correlation: { ...approved.executionContext.correlation, requestId: 'request-retry-2' },
      },
    });
    expect(retry.outcome.state).toBe('COMPLETED');

    const second = await runtime.execute('files.write', { path: 'b.txt' });
    runtime.approvals.approve(second.approvalGrantId!, {
      operatorId: 'operator-1',
      sessionId: 'operator-session-1',
      authMethod: 'dev-token',
      roles: ['admin'],
      authenticatedAt: new Date().toISOString(),
    });
    const secondGrant = runtime.approvals.get(second.approvalGrantId!)!;
    const mutated = await runtime.execute('files.write', { path: 'b.txt' }, {
      approvalId: secondGrant.id,
      executionContext: {
        ...secondGrant.executionContext,
        resourceScope: { ...secondGrant.executionContext.resourceScope, resourceIds: ['workspace-2'] },
      },
    });
    expect(mutated.outcome).toMatchObject({
      state: 'APPROVAL_INVALIDATED',
      reasonCode: 'APPROVAL_HASH_MISMATCH',
    });
  });
});
