import {
  ActingAgentPrincipalSchema,
  AgentExecutionContextSchema,
  ApprovalReferenceSchema,
  AuditReferenceSchema,
  AuthenticatedPrincipalSchema,
  CapabilitySchema,
  CapabilityCategory,
  CapabilityExposure,
  CompatibilityManifestSchema,
  CorrelationContextSchema,
  GrantReferenceSchema,
  RuntimeHealthSchema,
  RuntimeHealthStatus,
  RuntimeIdentitySchema,
  RuntimeKind,
  RuntimeReadinessSchema,
  RuntimeReadinessStatus,
  RuntimeRegistrationSchema,
  RuntimeTransport,
  PrincipalKind,
  ResourceScopeMode,
  ResourceScopeSchema,
  negotiateDetailed,
  type ActingAgentPrincipal,
  type AgentExecutionContext,
  type ApprovalReference,
  type AuditReference,
  type AuthenticatedPrincipal,
  type CompatibilityManifest,
  type CorrelationContext,
  type GrantReference,
  type ResourceScope,
  type RuntimeHealth,
  type RuntimeIdentity,
  type RuntimeReadiness,
  type RuntimeRegistration,
} from 'project-runtime-contracts';

export const ANANKE_PROTOCOL_VERSION = '1.4.0';
export const ANANKE_MINIMUM_PROTOCOL_VERSION = '1.0.0';
export const ANANKE_PROTOCOL_RANGE = {
  minimum: ANANKE_MINIMUM_PROTOCOL_VERSION,
  maximum: ANANKE_PROTOCOL_VERSION,
} as const;
export const ADRASTEIA_RUNTIME_CONTRACTS_PACKAGE = 'project-runtime-contracts@0.4.0';

export { PrincipalKind, ResourceScopeMode, RuntimeReadinessStatus };

export type {
  ActingAgentPrincipal,
  AgentExecutionContext,
  ApprovalReference,
  AuditReference,
  AuthenticatedPrincipal,
  CompatibilityManifest,
  CorrelationContext,
  GrantReference,
  ResourceScope,
  RuntimeHealth,
  RuntimeIdentity,
  RuntimeReadiness,
  RuntimeRegistration,
};

export type AnankeRuntimeCapability = NonNullable<RuntimeIdentity['capabilities']>[number];

/**
 * Ananke-owned additions to the portable AgentExecutionContext. This is an
 * identity/session declaration, never proof of authority. Policy and approval
 * remain in Ananke's gateway and authority engine.
 */
export interface GovernedExecutionContext extends AgentExecutionContext {
  resourceScope: ResourceScope;
  correlation: CorrelationContext;
  policyVersion: string;
  purpose?: string;
}

export interface ExecutionIdentity {
  authenticatedPrincipal: AuthenticatedPrincipal;
  actingPrincipal: ActingAgentPrincipal;
  representedPrincipal?: AgentExecutionContext['representedPrincipal'];
  tenantId?: string;
  projectId?: string;
  workspaceId?: string;
  resourceScope: ResourceScope;
  sessionId: string;
  authMethod: 'dev-token' | 'workload-token';
  authenticatedAt: string;
}

export interface RuntimeIdentityInput {
  version: string;
  instanceId: string;
  buildVersion?: string;
  capabilities?: AnankeRuntimeCapability[];
}

export interface RuntimeSnapshotInput {
  identity: RuntimeIdentity;
  health: RuntimeHealth;
  readiness: RuntimeReadiness;
  endpointBaseUrl: string;
  capabilities?: AnankeRuntimeCapability[];
}

function assertNoWildcard(value: unknown, path = '$'): void {
  if (typeof value === 'string') {
    if (/[*!?\[\]]/.test(value)) {
      throw new TypeError(`Wildcard characters are not allowed in governed values (${path})`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoWildcard(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      assertNoWildcard(entry, `${path}.${key}`);
    }
  }
}

function assertTenantConsistency(
  context: Pick<AgentExecutionContext, 'authenticatedPrincipal' | 'actingPrincipal' | 'representedPrincipal' | 'tenantId'>,
  scope?: ResourceScope,
): void {
  const tenants = [
    context.tenantId,
    context.authenticatedPrincipal.tenantId,
    context.actingPrincipal.tenantId,
    context.representedPrincipal?.tenantId,
    scope?.tenantId,
  ].filter((value): value is string => Boolean(value));
  if (new Set(tenants).size > 1) {
    throw new TypeError('Tenant IDs must agree across the governed execution context and scope');
  }
}

export function toAuthenticatedPrincipal(value: unknown): AuthenticatedPrincipal {
  assertNoWildcard(value, 'authenticatedPrincipal');
  return AuthenticatedPrincipalSchema.parse(value);
}

export function toActingAgentPrincipal(value: unknown): ActingAgentPrincipal {
  assertNoWildcard(value, 'actingPrincipal');
  return ActingAgentPrincipalSchema.parse(value);
}

export function toResourceScope(value: unknown): ResourceScope {
  assertNoWildcard(value, 'resourceScope');
  return ResourceScopeSchema.parse(value);
}

export function toCorrelationContext(value: unknown): CorrelationContext {
  assertNoWildcard(value, 'correlation');
  const correlation = CorrelationContextSchema.parse(value);
  for (const [name, identifier] of Object.entries(correlation)) {
    if (
      identifier !== undefined &&
      typeof identifier === 'string' &&
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(identifier)
    ) {
      throw new TypeError(`Invalid correlation identifier: ${name}`);
    }
  }
  return correlation;
}

export function toApprovalReference(value: unknown): ApprovalReference {
  return ApprovalReferenceSchema.parse(value);
}

export function toAuditReference(value: unknown): AuditReference {
  return AuditReferenceSchema.parse(value);
}

export function toGrantReference(value: unknown): GrantReference {
  return GrantReferenceSchema.parse(value);
}

export function createAnankeApprovalReference(
  approvalId: string,
  policyVersion: string,
): ApprovalReference {
  return toApprovalReference({ approvalId, sourceRuntime: 'ananke', policyVersion });
}

export function createAnankeAuditReference(auditId: string): AuditReference {
  return toAuditReference({ auditId, sourceRuntime: 'ananke' });
}

export function toAgentExecutionContext(value: unknown): AgentExecutionContext {
  assertNoWildcard(value, 'agentExecutionContext');
  const context = AgentExecutionContextSchema.parse(value);
  assertTenantConsistency(context);
  return context;
}

export function toGovernedExecutionContext(value: unknown): GovernedExecutionContext {
  if (!value || typeof value !== 'object') {
    throw new TypeError('Governed execution context must be an object');
  }
  const candidate = value as Record<string, unknown>;
  const resourceScope = toResourceScope(candidate.resourceScope);
  const correlation = toCorrelationContext(candidate.correlation);
  const policyVersion = candidate.policyVersion;
  if (typeof policyVersion !== 'string' || policyVersion.length === 0) {
    throw new TypeError('policyVersion is required and must be gateway-assigned');
  }
  if (candidate.purpose !== undefined && (typeof candidate.purpose !== 'string' || !candidate.purpose)) {
    throw new TypeError('purpose must be a non-empty string when supplied');
  }
  const context = toAgentExecutionContext(candidate);
  assertTenantConsistency(context, resourceScope);
  return {
    ...context,
    resourceScope,
    correlation,
    policyVersion,
    ...(candidate.purpose === undefined ? {} : { purpose: candidate.purpose }),
  };
}

export function safeParseGovernedExecutionContext(value: unknown):
  | { success: true; data: GovernedExecutionContext }
  | { success: false; error: Error } {
  try {
    return { success: true, data: toGovernedExecutionContext(value) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

export function createAnankeRuntimeIdentity(input: RuntimeIdentityInput): RuntimeIdentity {
  return RuntimeIdentitySchema.parse({
    runtime: 'ananke',
    kind: RuntimeKind.Ananke,
    displayName: 'Ananke Outcome Gateway',
    version: input.version,
    packageVersion: input.version,
    buildVersion: input.buildVersion,
    protocolVersion: ANANKE_PROTOCOL_VERSION,
    minimumProtocolVersion: ANANKE_MINIMUM_PROTOCOL_VERSION,
    supportedProtocolRange: ANANKE_PROTOCOL_RANGE,
    instanceId: input.instanceId,
    standalone: true,
    capabilities: input.capabilities ?? [],
    metadata: {
      repositoryUrl: 'https://github.com/hourwise/Project-Ananke',
      annotations: { runtimeContracts: ADRASTEIA_RUNTIME_CONTRACTS_PACKAGE },
    },
  });
}

export function createAnankeHealth(input: {
  uptimeMs: number;
  warnings?: string[];
  healthy?: boolean;
  status?: RuntimeHealthStatus;
}): RuntimeHealth {
  return RuntimeHealthSchema.parse({
    healthy: input.healthy ?? true,
    status: input.status ?? RuntimeHealthStatus.Healthy,
    uptimeMs: input.uptimeMs,
    warnings: input.warnings ?? [],
    checkedAt: new Date().toISOString(),
  });
}

export function createAnankeReadiness(input: {
  ready: boolean;
  status?: RuntimeReadinessStatus;
  reasonCode?: string;
  dependencies: NonNullable<RuntimeReadiness['dependencies']>;
}): RuntimeReadiness {
  return RuntimeReadinessSchema.parse({
    ready: input.ready,
    status:
      input.status ?? (input.ready ? RuntimeReadinessStatus.Ready : RuntimeReadinessStatus.NotReady),
    reasonCode: input.reasonCode,
    dependencies: input.dependencies,
    checkedAt: new Date().toISOString(),
  });
}

export function createAnankeRegistration(input: RuntimeSnapshotInput): RuntimeRegistration {
  const base = input.endpointBaseUrl.replace(/\/$/, '');
  return RuntimeRegistrationSchema.parse({
    identity: input.identity,
    capabilities: input.capabilities ?? input.identity.capabilities ?? [],
    health: input.health,
    readiness: input.readiness,
    endpoints: [
      { id: 'gateway-http', transport: RuntimeTransport.Http, url: `${base}/api` },
      { id: 'gateway-embedded', transport: RuntimeTransport.Local },
    ],
    registeredAt: new Date().toISOString(),
    healthEndpoint: `${base}/api/runtime/health`,
    readinessEndpoint: `${base}/api/runtime/readiness`,
    inspectionMechanism: 'public HTTP runtime inspection endpoints',
    standalone: true,
    degradedModes: ['in-memory approvals', 'no persistent idempotency or replay recovery'],
  });
}

export function createAnankeCompatibilityManifest(input: {
  runtimeVersion: string;
  buildVersion?: string;
  capabilities?: AnankeRuntimeCapability[];
}): CompatibilityManifest {
  return CompatibilityManifestSchema.parse({
    manifestSchemaVersion: '1.0.0',
    runtimeName: 'ananke',
    runtimeVersion: input.runtimeVersion,
    packageVersion: ADRASTEIA_RUNTIME_CONTRACTS_PACKAGE,
    buildVersion: input.buildVersion,
    protocolVersion: ANANKE_PROTOCOL_VERSION,
    minimumSupportedProtocolVersion: ANANKE_MINIMUM_PROTOCOL_VERSION,
    supportedProtocolRange: ANANKE_PROTOCOL_RANGE,
    requiredRuntimeContractsVersionRange: '0.4.0',
    supportedTransports: [RuntimeTransport.Http, RuntimeTransport.Local],
    capabilities: input.capabilities ?? [],
    standalone: true,
    knownConstraints: [
      'Content preflight is Ananke-local and is not a Fates Runtime Protocol contract family.',
      'No full scoped credential broker is implemented.',
      'No persistent idempotency or replay recovery is implemented.',
      'Action approvals are in-memory by default.',
      'Production execution authentication requires an explicitly configured authenticator.',
    ],
    degradedModes: ['in-memory approvals', 'local development authentication is opt-in'],
    generatedAt: new Date().toISOString(),
  });
}

/** Uses the canonical semantic negotiation helper; values are descriptive, not authority. */
export function negotiateAnankeProtocol(peerProtocolVersion: string, peerMinimumProtocolVersion: string) {
  return negotiateDetailed(
    ANANKE_PROTOCOL_VERSION,
    ANANKE_MINIMUM_PROTOCOL_VERSION,
    peerProtocolVersion,
    peerMinimumProtocolVersion,
  );
}

const anankeCapabilityDefinitions = [
  {
    id: 'governed-execution',
    name: 'Governed execution',
    version: '1.0.0',
    category: CapabilityCategory.Execution,
    exposure: CapabilityExposure.Discoverable,
  },
  {
    id: 'policy-evaluation',
    name: 'Policy evaluation',
    version: '1.0.0',
    category: CapabilityCategory.Policy,
    exposure: CapabilityExposure.Discoverable,
  },
  {
    id: 'approval-lifecycle',
    name: 'Approval lifecycle',
    version: '1.0.0',
    category: CapabilityCategory.Approval,
    exposure: CapabilityExposure.Discoverable,
  },
  {
    id: 'audit-querying',
    name: 'Audit querying',
    version: '1.0.0',
    category: CapabilityCategory.Audit,
    exposure: CapabilityExposure.Discoverable,
  },
  {
    id: 'runtime-inspection',
    name: 'Runtime inspection',
    version: '1.0.0',
    category: CapabilityCategory.Health,
    exposure: CapabilityExposure.Active,
  },
  {
    id: 'protocol-negotiation',
    name: 'Protocol negotiation',
    version: '1.0.0',
    category: CapabilityCategory.Gateway,
    exposure: CapabilityExposure.Active,
  },
] satisfies AnankeRuntimeCapability[];

export const anankeRuntimeCapabilities: AnankeRuntimeCapability[] =
  anankeCapabilityDefinitions.map((capability) => CapabilitySchema.parse(capability));
