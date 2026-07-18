import { describe, expect, it } from 'vitest';
import {
  CompatibilityManifestSchema,
  RuntimeHealthSchema,
  RuntimeIdentitySchema,
  RuntimeReadinessSchema,
  RuntimeRegistrationSchema,
} from 'project-runtime-contracts';
import {
  PrincipalKind,
  ResourceScopeMode,
  anankeRuntimeCapabilities,
  createAnankeApprovalReference,
  createAnankeAuditReference,
  createAnankeCompatibilityManifest,
  createAnankeHealth,
  createAnankeReadiness,
  createAnankeRegistration,
  createAnankeRuntimeIdentity,
  negotiateAnankeProtocol,
  safeParseGovernedExecutionContext,
  toCorrelationContext,
  toResourceScope,
} from './index.js';

const context = {
  authenticatedPrincipal: {
    id: 'workload-host',
    kind: PrincipalKind.Service,
    tenantId: 'tenant-1',
  },
  actingPrincipal: { id: 'agent-1', kind: PrincipalKind.Agent, tenantId: 'tenant-1' },
  runtimeId: 'ananke',
  runtimeInstanceId: 'ananke-test-instance',
  sessionId: 'session-1',
  tenantId: 'tenant-1',
  resourceScope: {
    mode: ResourceScopeMode.Bounded,
    tenantId: 'tenant-1',
    resourceType: 'filesystem',
    resourceIds: ['workspace-1'],
    operations: ['read'],
  },
  correlation: { requestId: 'request-1', correlationId: 'correlation-1', actionId: 'action-1' },
  policyVersion: 'policy-1',
};

describe('Ananke Adrasteia adapter', () => {
  it('accepts a service principal and distinct agent principal', () => {
    expect(safeParseGovernedExecutionContext(context).success).toBe(true);
  });

  it('rejects an acting human, authenticated agent, tenant conflict, and wildcard scope', () => {
    expect(
      safeParseGovernedExecutionContext({
        ...context,
        actingPrincipal: { ...context.actingPrincipal, kind: PrincipalKind.Human },
      }).success,
    ).toBe(false);
    expect(
      safeParseGovernedExecutionContext({
        ...context,
        authenticatedPrincipal: { ...context.authenticatedPrincipal, kind: PrincipalKind.Agent },
      }).success,
    ).toBe(false);
    expect(
      safeParseGovernedExecutionContext({
        ...context,
        authenticatedPrincipal: undefined,
        representedPrincipal: { id: 'human-1', kind: PrincipalKind.Human },
      }).success,
    ).toBe(false);
    expect(
      safeParseGovernedExecutionContext({
        ...context,
        resourceScope: { ...context.resourceScope, tenantId: 'other-tenant' },
      }).success,
    ).toBe(false);
    expect(() =>
      toResourceScope({ ...context.resourceScope, resourceIds: ['workspace-*'] }),
    ).toThrow('Wildcard');
    expect(() => toResourceScope({ mode: ResourceScopeMode.Bounded })).toThrow();
    expect(() =>
      toResourceScope({
        mode: ResourceScopeMode.Unscoped,
        tenantId: 'tenant-1',
        resourceIds: ['workspace-1'],
      }),
    ).toThrow();
  });

  it('requires an explicit valid correlation context', () => {
    expect(() => toCorrelationContext({ requestId: 'request-1' })).toThrow();
    expect(() =>
      toCorrelationContext({ requestId: 'request-1', correlationId: 'invalid value' }),
    ).toThrow('Invalid correlation');
  });

  it('maps portable references without treating them as authority', () => {
    expect(createAnankeApprovalReference('approval-1', 'policy-1')).toEqual({
      approvalId: 'approval-1',
      sourceRuntime: 'ananke',
      policyVersion: 'policy-1',
    });
    expect(createAnankeAuditReference('audit-1')).toEqual({
      auditId: 'audit-1',
      sourceRuntime: 'ananke',
    });
  });

  it('emits canonical runtime snapshots', () => {
    const identity = createAnankeRuntimeIdentity({
      version: '0.1.0',
      instanceId: 'ananke-test-instance',
      capabilities: anankeRuntimeCapabilities,
    });
    const health = createAnankeHealth({ uptimeMs: 1 });
    const readiness = createAnankeReadiness({
      ready: true,
      dependencies: [{ dependencyId: 'adapter', status: 'ready', required: true }],
    });
    const registration = createAnankeRegistration({
      identity,
      health,
      readiness,
      endpointBaseUrl: 'http://localhost:3000',
    });
    const manifest = createAnankeCompatibilityManifest({
      runtimeVersion: '0.1.0',
      capabilities: anankeRuntimeCapabilities,
    });

    expect(RuntimeIdentitySchema.safeParse(identity).success).toBe(true);
    expect(RuntimeHealthSchema.safeParse(health).success).toBe(true);
    expect(RuntimeReadinessSchema.safeParse(readiness).success).toBe(true);
    expect(RuntimeRegistrationSchema.safeParse(registration).success).toBe(true);
    expect(CompatibilityManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it('uses canonical semantic protocol negotiation', () => {
    expect(negotiateAnankeProtocol('1.4.0', '1.0.0')).toMatchObject({
      compatible: true,
      negotiatedVersion: '1.4.0',
    });
    expect(negotiateAnankeProtocol('1.2.0', '1.0.0')).toMatchObject({
      compatible: true,
      negotiatedVersion: '1.2.0',
    });
    expect(negotiateAnankeProtocol('1.5.0', '1.5.0')).toMatchObject({
      compatible: false,
      reason: 'no_overlap',
    });
    expect(negotiateAnankeProtocol('2.0.0', '2.0.0')).toMatchObject({
      compatible: false,
      reason: 'unsupported_major',
    });
    expect(negotiateAnankeProtocol('not-semver', '1.0.0')).toMatchObject({
      compatible: false,
      reason: 'malformed_version',
    });
    expect(negotiateAnankeProtocol('1.0.0', '1.4.0')).toMatchObject({
      compatible: false,
      reason: 'invalid_range',
    });
  });
});
