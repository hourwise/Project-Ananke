import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { ToolRegistry } from './registry.js';
import { RiskClassifier } from './classifier.js';
import {
  ContentPolicyEngine,
  discoverPolicyConfigFile,
  loadPolicyConfigFile,
  PolicyEngine,
} from '@ananke/policy-engine';
import { ApprovalEngine, hashCanonicalCall } from '@ananke/authority-engine';
import { executeTool, type ToolExecutor } from '@ananke/tool-router';
import { classifyOutcome } from '@ananke/outcome-engine';
import { AuditLog } from '@ananke/audit-engine';
import { createGatewayRoutes } from './routes.js';
import {
  DenyAllExecutionAuthenticator,
  DenyAllOperatorAuthenticator,
  DevelopmentExecutionTokenAuthenticator,
  DevelopmentTokenAuthenticator,
  OidcJwtAuthenticator,
  type OidcAuthConfig,
  type AuthenticatedOperator,
  type ExecutionAuthenticator,
  type ExecutionProfile,
  type OperatorAuthenticator,
  type OperatorProfile,
} from './auth.js';
import {
  InMemoryOperatorSessionStore,
  type OperatorSession,
  type OperatorSessionObservation,
  type OperatorSessionStore,
} from './operator-session-store.js';
import { contentSurfaceFor, type ContentPreflightAdapter } from './content-preflight.js';
import {
  InMemoryContentApprovalStore,
  type ContentApprovalStore,
} from './content-approval-store.js';
import {
  anankeRuntimeCapabilities,
  createAnankeApprovalReference,
  createAnankeAuditReference,
  createAnankeCompatibilityManifest,
  createAnankeHealth,
  createAnankeReadiness,
  createAnankeRegistration,
  createAnankeRuntimeIdentity,
  negotiateAnankeProtocol,
  PrincipalKind,
  ResourceScopeMode,
  RuntimeReadinessStatus,
  safeParseGovernedExecutionContext,
  toCorrelationContext,
  toGovernedExecutionContext,
  type CorrelationContext,
  type GovernedExecutionContext,
  type RuntimeIdentity,
  type RuntimeReadiness,
} from '@ananke/adrasteia-adapter';
import type { IAuditLog } from '@ananke/audit-engine';
import type {
  ContentAccessDecision,
  ContentAccessRequest,
  ContentAccessReasonCode,
  ContentApprovalReceipt,
  ContentSurfaceObservation,
  ToolMetadata,
  Outcome,
  OperatorIdentity,
  ExecutionIdentity,
} from '@ananke/schema';

export const DEFAULT_APPROVAL_DEV_TOKEN = 'dev-approval-token';
export const DEFAULT_EXECUTION_DEV_TOKEN = 'dev-execution-token';
export const DEFAULT_POLICY_VERSION = 'builtin:0.1.0';
export const ANANKE_RUNTIME_VERSION = '0.1.0';

const RUNTIME_INSTANCE_ID = `ananke-${crypto.randomUUID()}`;
const RUNTIME_STARTED_AT = Date.now();

export interface OperatorAuthConfig {
  mode?: 'development' | 'oidc';
  tokens?: Record<string, OperatorProfile>;
  oidc?: OidcAuthConfig;
  authenticator?: OperatorAuthenticator;
  /**
   * Tracks active operator sessions after credential verification. Configure
   * SqliteOperatorSessionStore for OIDC deployments so revocations persist.
   */
  sessionStore?: OperatorSessionStore;
}

export interface ContentPreflightGatewayConfig {
  /**
   * When enabled, every successful READ_ONLY result requires a registered
   * content preflight adapter and a content access request before release.
   */
  enabled?: boolean;
  policy?: ContentPolicyEngine;
  approvalStore?: ContentApprovalStore;
  approvalTtlMs?: number;
}

export interface ExecutionAuthConfig {
  tokens?: Record<string, ExecutionProfile>;
  authenticator?: ExecutionAuthenticator;
}

export interface GatewayExecutionOptions {
  approvalId?: string;
  contentAccess?: ContentAccessRequest;
  contentApprovalId?: string;
  /** Trusted in-process context only. HTTP callers cannot supply this value. */
  executionContext?: GovernedExecutionContext;
  /** Purpose is declarative and is included in Ananke approval binding when supplied. */
  purpose?: string;
}

export interface GatewayConfig {
  port?: number;
  mcpServers?: { name: string; url: string }[];
  audit?: IAuditLog;
  operatorAuth?: OperatorAuthConfig;
  executionAuth?: ExecutionAuthConfig;
  /** Enables bundled, known local credentials. Never enable outside local development. */
  developmentMode?: boolean;
  /** Trusted identity for in-process embedding; HTTP requests never inherit it. */
  embeddedExecutionContext?: Omit<GovernedExecutionContext, 'policyVersion' | 'correlation'> & {
    correlation?: CorrelationContext;
  };
  policyVersion?: string;
  approvalTtlMs?: number;
  /** @deprecated Use operatorAuth. */
  approvalAuth?: OperatorAuthConfig;
  policyFile?: string;
  autoLoadPolicy?: boolean;
  contentPreflight?: ContentPreflightGatewayConfig;
}

/**
 * Ananke Outcome Gateway — the core runtime.
 *
 * Usage:
 *   const gateway = new Gateway({ port: 3000 });
 *   gateway.registerTool({ name: 'gmail.send_email', riskClass: 'EXTERNAL_SEND', ... });
 *   gateway.setExecutor('gmail.send_email', async (args) => { ... });
 *   gateway.start();
 */
export class Gateway {
  public registry = new ToolRegistry();
  public classifier = new RiskClassifier(this.registry);
  public policy = new PolicyEngine();
  public approvals = new ApprovalEngine();
  public contentApprovals: ContentApprovalStore;
  public audit: IAuditLog;

  private executors = new Map<string, ToolExecutor>();
  private contentPreflightAdapters = new Map<string, ContentPreflightAdapter>();
  private app = new Hono();
  private config: {
    port: number;
    mcpServers: { name: string; url: string }[];
    audit: IAuditLog;
    operatorAuthenticator: OperatorAuthenticator;
    executionAuthenticator: ExecutionAuthenticator;
    operatorSessionStore: OperatorSessionStore;
    embeddedExecutionContext?: GovernedExecutionContext;
    policyVersion: string;
    approvalTtlMs: number;
    contentPreflight: {
      enabled: boolean;
      policy: ContentPolicyEngine;
      approvalTtlMs: number;
    };
    policyFile?: string;
    autoLoadPolicy: boolean;
    executionAuthenticationConfigured: boolean;
    embeddedCorrelationProvided: boolean;
  };

  constructor(config: GatewayConfig = {}) {
    const operatorAuth = config.operatorAuth ?? config.approvalAuth;
    const contentApprovalTtlMs = config.contentPreflight?.approvalTtlMs ?? 5 * 60 * 1000;
    if (!Number.isSafeInteger(contentApprovalTtlMs) || contentApprovalTtlMs < 1) {
      throw new Error('contentPreflight.approvalTtlMs must be a positive integer');
    }
    const approvalTtlMs = config.approvalTtlMs ?? 5 * 60 * 1000;
    if (!Number.isSafeInteger(approvalTtlMs) || approvalTtlMs < 1) {
      throw new Error('approvalTtlMs must be a positive integer');
    }
    const operatorAuthenticator =
      operatorAuth?.authenticator ??
      (operatorAuth?.mode === 'oidc'
        ? new OidcJwtAuthenticator(requiredOidcConfig(operatorAuth.oidc))
        : operatorAuth?.tokens
          ? new DevelopmentTokenAuthenticator(operatorAuth.tokens)
          : config.developmentMode
            ? new DevelopmentTokenAuthenticator({
                [DEFAULT_APPROVAL_DEV_TOKEN]: {
                  operatorId: 'local-dashboard',
                  displayName: 'Local Dashboard',
                  sessionId: 'local-dev-session',
                  roles: ['admin'],
                },
              })
            : new DenyAllOperatorAuthenticator());
    const executionAuthenticator =
      config.executionAuth?.authenticator ??
      (config.executionAuth?.tokens
        ? new DevelopmentExecutionTokenAuthenticator(config.executionAuth.tokens)
        : config.developmentMode
          ? new DevelopmentExecutionTokenAuthenticator({
              [DEFAULT_EXECUTION_DEV_TOKEN]: {
                authenticatedPrincipal: {
                  id: 'local-agent-host',
                  kind: PrincipalKind.Service,
                  issuer: 'ananke-development',
                  tenantId: 'local-development',
                },
                actingPrincipal: {
                  id: 'local-agent',
                  kind: PrincipalKind.Agent,
                  issuer: 'ananke-development',
                  tenantId: 'local-development',
                },
                tenantId: 'local-development',
                resourceScope: {
                  mode: ResourceScopeMode.Bounded,
                  tenantId: 'local-development',
                  resourceType: 'filesystem',
                  resourceIds: ['development-workspace'],
                  operations: ['read', 'write'],
                  providerNamespace: 'local',
                },
                sessionId: 'local-agent-session',
              },
            })
          : new DenyAllExecutionAuthenticator());
    const policyVersion = config.policyVersion ?? DEFAULT_POLICY_VERSION;

    this.config = {
      port: config.port ?? 3000,
      mcpServers: config.mcpServers ?? [],
      audit: config.audit ?? new AuditLog(),
      operatorAuthenticator,
      executionAuthenticator,
      operatorSessionStore: operatorAuth?.sessionStore ?? new InMemoryOperatorSessionStore(),
      embeddedExecutionContext: config.embeddedExecutionContext
        ? toGovernedExecutionContext({
            ...config.embeddedExecutionContext,
            policyVersion,
            correlation: config.embeddedExecutionContext.correlation ?? this.createCorrelation(),
          })
        : undefined,
      policyVersion,
      approvalTtlMs,
      contentPreflight: {
        enabled: config.contentPreflight?.enabled ?? false,
        policy: config.contentPreflight?.policy ?? new ContentPolicyEngine(),
        approvalTtlMs: contentApprovalTtlMs,
      },
      policyFile: config.policyFile,
      autoLoadPolicy: config.autoLoadPolicy ?? true,
      executionAuthenticationConfigured:
        Boolean(config.executionAuth?.authenticator || config.executionAuth?.tokens) ||
        config.developmentMode === true,
      embeddedCorrelationProvided: config.embeddedExecutionContext?.correlation !== undefined,
    };
    this.audit = this.config.audit;
    this.contentApprovals =
      config.contentPreflight?.approvalStore ?? new InMemoryContentApprovalStore();

    const policyFile =
      this.config.policyFile ??
      (this.config.autoLoadPolicy ? discoverPolicyConfigFile() : undefined);
    if (policyFile) {
      const loaded = loadPolicyConfigFile(policyFile);
      this.policy.loadConfig(loaded.config);
      console.log(`[ananke] loaded policy config from ${loaded.path}`);
    }

    // Mount routes
    this.app.use(
      '/api/*',
      cors({
        allowHeaders: [
          'Authorization',
          'Content-Type',
          'X-Ananke-Correlation-Id',
          'X-Ananke-Causation-Id',
        ],
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        origin: '*',
      }),
    );
    const routes = createGatewayRoutes(this);
    this.app.route('/api', routes);

    // Health check
    this.app.get('/', (c) => c.json({ name: 'Ananke Outcome Gateway', version: '0.1.0' }));
  }

  registerTool(metadata: ToolMetadata): void {
    this.registry.register(metadata);
  }

  setExecutor(toolName: string, executor: ToolExecutor): void {
    this.executors.set(toolName, executor);
  }

  setContentPreflightAdapter(toolName: string, adapter: ContentPreflightAdapter): void {
    this.contentPreflightAdapters.set(toolName, adapter);
  }

  getContentApproval(id: string): ContentApprovalReceipt | undefined {
    return this.contentApprovals.get(id);
  }

  pendingContentApprovals(): ContentApprovalReceipt[] {
    return this.contentApprovals.pending();
  }

  approveContentApproval(
    id: string,
    operator: OperatorIdentity,
  ): ContentApprovalReceipt | undefined {
    return this.contentApprovals.approve(id, operator);
  }

  rejectContentApproval(
    id: string,
    operator: OperatorIdentity,
  ): ContentApprovalReceipt | undefined {
    return this.contentApprovals.reject(id, operator);
  }

  async authenticateOperator(authorizationHeader?: string): Promise<OperatorIdentity | undefined> {
    let operator: AuthenticatedOperator | undefined;
    try {
      operator = await this.config.operatorAuthenticator.authenticate(authorizationHeader);
    } catch {
      return undefined;
    }
    if (!operator) return undefined;

    let observation: OperatorSessionObservation;
    try {
      observation = this.config.operatorSessionStore.observe(operator);
    } catch {
      // A failed session backend must never grant operator access.
      return undefined;
    }
    if (!observation.active) return undefined;

    if (observation.transition === 'started' || observation.transition === 'rotated') {
      this.audit.recordOperatorSessionEvent(
        observation.transition === 'started'
          ? 'OPERATOR_SESSION_STARTED'
          : 'OPERATOR_SESSION_ROTATED',
        sessionAuditMetadata(observation.session!),
      );
    }
    return operator;
  }

  async authenticateExecution(
    authorizationHeader?: string,
  ): Promise<ExecutionIdentity | undefined> {
    try {
      return await this.config.executionAuthenticator.authenticate(authorizationHeader);
    } catch {
      return undefined;
    }
  }

  createCorrelation(input?: Partial<Omit<CorrelationContext, 'requestId' | 'correlationId'>> & {
    correlationId?: string;
  }): CorrelationContext {
    return toCorrelationContext({
      requestId: `request-${crypto.randomUUID()}`,
      correlationId: input?.correlationId ?? `correlation-${crypto.randomUUID()}`,
      ...(input && Object.hasOwn(input, 'causationId') ? { causationId: input.causationId } : {}),
      ...(input?.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input?.actionId ? { actionId: input.actionId } : {}),
      ...(input?.workflowId ? { workflowId: input.workflowId } : {}),
      ...(input?.executionId ? { executionId: input.executionId } : {}),
      ...(input?.stepId ? { stepId: input.stepId } : {}),
      ...(input?.attemptId ? { attemptId: input.attemptId } : {}),
      ...(input?.approvalReference ? { approvalReference: input.approvalReference } : {}),
      ...(input?.delegationReference ? { delegationReference: input.delegationReference } : {}),
      ...(input?.auditReference ? { auditReference: input.auditReference } : {}),
      ...(input?.stateHandleReference ? { stateHandleReference: input.stateHandleReference } : {}),
    });
  }

  executionContextFor(
    identity: ExecutionIdentity,
    correlation = this.createCorrelation({ sessionId: identity.sessionId }),
    purpose?: string,
  ): GovernedExecutionContext {
    return toGovernedExecutionContext({
      authenticatedPrincipal: identity.authenticatedPrincipal,
      actingPrincipal: identity.actingPrincipal,
      ...(identity.representedPrincipal ? { representedPrincipal: identity.representedPrincipal } : {}),
      runtimeId: 'ananke',
      runtimeInstanceId: RUNTIME_INSTANCE_ID,
      sessionId: identity.sessionId,
      ...(identity.tenantId ? { tenantId: identity.tenantId } : {}),
      ...(identity.projectId ? { projectId: identity.projectId } : {}),
      ...(identity.workspaceId ? { workspaceId: identity.workspaceId } : {}),
      resourceScope: identity.resourceScope,
      correlation,
      policyVersion: this.config.policyVersion,
      ...(purpose ? { purpose } : {}),
    });
  }

  runtimeIdentity(): RuntimeIdentity {
    return createAnankeRuntimeIdentity({
      version: ANANKE_RUNTIME_VERSION,
      instanceId: RUNTIME_INSTANCE_ID,
      capabilities: anankeRuntimeCapabilities,
    });
  }

  runtimeHealth() {
    const warnings = this.config.executionAuthenticationConfigured
      ? []
      : ['Execution authentication is not configured; the gateway is running fail-closed.'];
    return createAnankeHealth({
      uptimeMs: Date.now() - RUNTIME_STARTED_AT,
      warnings,
      healthy: true,
    });
  }

  runtimeReadiness(): RuntimeReadiness {
    const registeredToolsHaveExecutors = this.registry.list().every((tool) =>
      this.executors.has(tool.name),
    );
    const dependencies: NonNullable<RuntimeReadiness['dependencies']> = [
      { dependencyId: 'runtime-initialisation', status: RuntimeReadinessStatus.Ready, required: true },
      { dependencyId: 'selected-policy', status: RuntimeReadinessStatus.Ready, required: true },
      { dependencyId: 'audit-backend', status: RuntimeReadinessStatus.Ready, required: true },
      {
        dependencyId: 'execution-authenticator',
        status: this.config.executionAuthenticationConfigured
          ? RuntimeReadinessStatus.Ready
          : RuntimeReadinessStatus.NotReady,
        required: true,
        message: this.config.executionAuthenticationConfigured
          ? undefined
          : 'No execution authenticator is configured; requests are denied.',
      },
      {
        dependencyId: 'adrasteia-adapter',
        status: RuntimeReadinessStatus.Ready,
        required: true,
      },
      {
        dependencyId: 'registered-tool-executors',
        status: registeredToolsHaveExecutors
          ? RuntimeReadinessStatus.Ready
          : RuntimeReadinessStatus.NotReady,
        required: true,
        message: registeredToolsHaveExecutors ? undefined : 'One or more registered tools has no executor.',
      },
    ];
    const ready = dependencies.every(
      (dependency) => !dependency.required || dependency.status === RuntimeReadinessStatus.Ready,
    );
    return createAnankeReadiness({
      ready,
      reasonCode: ready ? undefined : 'REQUIRED_DEPENDENCY_UNAVAILABLE',
      dependencies,
    });
  }

  runtimeRegistration() {
    return createAnankeRegistration({
      identity: this.runtimeIdentity(),
      health: this.runtimeHealth(),
      readiness: this.runtimeReadiness(),
      endpointBaseUrl: `http://localhost:${this.config.port}`,
      capabilities: anankeRuntimeCapabilities,
    });
  }

  runtimeCompatibility() {
    return createAnankeCompatibilityManifest({
      runtimeVersion: ANANKE_RUNTIME_VERSION,
      capabilities: anankeRuntimeCapabilities,
    });
  }

  approvalReference(approvalId: string) {
    return createAnankeApprovalReference(approvalId, this.config.policyVersion);
  }

  auditReference(auditId: string) {
    return createAnankeAuditReference(auditId);
  }

  negotiateProtocol(peerProtocolVersion: string, peerMinimumProtocolVersion: string) {
    return negotiateAnankeProtocol(peerProtocolVersion, peerMinimumProtocolVersion);
  }

  revokeOperatorSession(operator: OperatorIdentity): OperatorSession | undefined {
    const session = this.config.operatorSessionStore.revoke(
      operator.sessionId,
      operator.operatorId,
      'operator_logout',
    );
    if (session) {
      this.audit.recordOperatorSessionEvent(
        'OPERATOR_SESSION_REVOKED',
        sessionAuditMetadata(session),
      );
    }
    return session;
  }

  /**
   * Execute a tool call through the full runtime pipeline:
   * classify → policy → (approval) → execute → outcome → audit
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>,
    options?: GatewayExecutionOptions,
  ): Promise<{ outcome: Outcome; approvalRequired?: boolean; approvalGrantId?: string }> {
    const startTime = performance.now();
    const requestedContext = options?.executionContext ?? this.config.embeddedExecutionContext;
    const contextForAttempt =
      !options?.executionContext &&
      requestedContext &&
      !this.config.embeddedCorrelationProvided
        ? {
            ...requestedContext,
            correlation: this.createCorrelation({ sessionId: requestedContext.sessionId }),
          }
        : requestedContext;
    const parsedContext = safeParseGovernedExecutionContext(
      options?.purpose === undefined || !contextForAttempt
        ? contextForAttempt
        : { ...contextForAttempt, purpose: options.purpose },
    );
    if (!parsedContext.success || parsedContext.data.policyVersion !== this.config.policyVersion) {
      return {
        outcome: {
          state: 'DENIED',
          reasonCode: 'PERMISSION_DENIED',
          retryable: false,
          requiresUser: false,
          safeToContinue: false,
          nextAction: 'Authenticate the execution principal and provide a valid execution context.',
        },
      };
    }
    const executionContext = parsedContext.data;

    const metadata = this.registry.get(toolName);

    // 1. Audit: tool call requested
    this.audit.recordToolCallRequested(
      toolName,
      args,
      metadata?.server,
      auditCorrelationMetadata(executionContext, options?.approvalId),
    );

    // 2. Classify risk
    const riskClass = this.classifier.classify(toolName);

    // 3. Evaluate policy
    const decision = this.policy.evaluate(toolName, riskClass);
    this.audit.recordPolicyChecked(toolName, decision);

    // 4. Handle DENY
    if (decision === 'DENY') {
      const outcome = classifyOutcome(
        { success: false, error: 'Policy denied', durationMs: 0 },
        'DENY',
      );
      this.audit.recordOutcomeGenerated(toolName, outcome);
      return { outcome };
    }

    // 5. Handle REQUIRE_APPROVAL
    if (decision === 'REQUIRE_APPROVAL') {
      // If no approvalId provided, request one
      if (!options?.approvalId) {
        if (!metadata) {
          const outcome = classifyOutcome(
            { success: false, error: 'Unknown tool', durationMs: 0 },
            'DENY',
          );
          this.audit.recordOutcomeGenerated(toolName, outcome);
          return { outcome };
        }
        const { grant } = this.approvals.requestApproval(
          metadata.server,
          toolName,
          args,
          executionContext,
          new Date(Date.now() + this.config.approvalTtlMs).toISOString(),
        );
        this.audit.recordApprovalRequested(toolName, grant.actionHash, args, {
          ...auditCorrelationMetadata(executionContext, grant.id),
          approvalId: grant.id,
        });
        return {
          outcome: {
            state: 'WAITING_FOR_APPROVAL',
            reasonCode: 'APPROVAL_REQUIRED',
            retryable: true,
            requiresUser: true,
            safeToContinue: false,
            nextAction: `Approval required. Re-submit with approvalId: ${grant.id}`,
          },
          approvalRequired: true,
          approvalGrantId: grant.id,
        };
      }

      // Verify approval
      const check = this.approvals.checkApproval(
        options.approvalId,
        metadata?.server ?? '',
        toolName,
        args,
        executionContext,
      );
      if (!check.valid) {
        if (check.reason === 'Approval pending') {
          const grant = this.approvals.get(options.approvalId);
          return {
            outcome: {
              state: 'WAITING_FOR_APPROVAL',
              reasonCode: 'APPROVAL_REQUIRED',
              retryable: true,
              requiresUser: true,
              safeToContinue: false,
              nextAction: `Approval is still pending. Re-submit after approvalId is approved: ${options.approvalId}`,
            },
            approvalRequired: true,
            approvalGrantId: grant?.id ?? options.approvalId,
          };
        }

        if (check.reason === 'Approval rejected') {
          const outcome = classifyOutcome(
            { success: false, error: 'Approval rejected', durationMs: 0 },
            'DENY',
          );
          this.audit.recordApprovalDenied(
            toolName,
            this.approvals.get(options.approvalId)?.actionHash ??
              hashCanonicalCall({ approvalId: options.approvalId }),
          );
          this.audit.recordOutcomeGenerated(toolName, outcome);
          return { outcome };
        }

        this.audit.recordApprovalInvalidated(
          toolName,
          this.approvals.get(options.approvalId)?.actionHash ??
            hashCanonicalCall({ approvalId: options.approvalId }),
        );
        const outcome = classifyOutcome({
          success: false,
          error: check.reason,
          errorCode: 'APPROVAL_HASH_MISMATCH',
          durationMs: 0,
        });
        this.audit.recordOutcomeGenerated(toolName, outcome);
        return { outcome };
      }
    }

    // 6. Execute
    const executor = this.executors.get(toolName);
    if (!executor) {
      const outcome = classifyOutcome({
        success: false,
        error: `No executor registered for tool: ${toolName}`,
        errorCode: 'UNKNOWN_FAILURE',
        durationMs: 0,
      });
      this.audit.recordOutcomeGenerated(toolName, outcome);
      return { outcome };
    }

    const result = await executeTool(toolName, args, executor);
    const outcome = result.success
      ? ((await this.preflightReadResult(toolName, args, result.data, metadata, options)) ??
        classifyOutcome(result))
      : classifyOutcome(result);

    // 7. Audit
    if (result.success) {
      this.audit.recordToolExecuted(toolName, outcome, result.durationMs);
    } else {
      this.audit.recordToolFailed(toolName, outcome, result.durationMs);
    }
    this.audit.recordOutcomeGenerated(toolName, outcome);

    // 8. Consume approval if used
    if (options?.approvalId) {
      this.approvals.consume(options.approvalId);
    }

    const totalMs = Math.round(performance.now() - startTime);
    if (metadata) {
      console.log(`[ananke] ${toolName} → ${outcome.state} (${totalMs}ms)`);
    }

    return { outcome };
  }

  start(): void {
    serve({ fetch: this.app.fetch, port: this.config.port }, (info) => {
      console.log(`🔮 Ananke Outcome Gateway running on http://localhost:${info.port}`);
    });
  }

  private async preflightReadResult(
    toolName: string,
    args: Record<string, unknown>,
    data: unknown,
    metadata: ToolMetadata | undefined,
    options: GatewayExecutionOptions | undefined,
  ): Promise<Outcome | undefined> {
    if (!this.config.contentPreflight.enabled || metadata?.riskClass !== 'READ_ONLY') {
      return undefined;
    }

    if (!options?.contentAccess) {
      return this.contentDeniedOutcome(
        toolName,
        'CONTENT_PREFLIGHT_REQUIRED',
        'Content preflight is enabled. Re-run with a content access request.',
      );
    }

    const adapter = this.contentPreflightAdapters.get(toolName);
    if (!adapter) {
      return this.contentDeniedOutcome(
        toolName,
        'CONTENT_PREFLIGHT_REQUIRED',
        'No content preflight adapter is registered for READ_ONLY tool: ' + toolName,
      );
    }

    try {
      const preflight = await adapter.preflight({
        toolName,
        tool: metadata,
        arguments: args,
        data,
        request: options.contentAccess,
      });
      this.audit.recordContentPreflighted(
        toolName,
        contentObservationAuditMetadata(preflight.observation),
      );

      const decision = this.config.contentPreflight.policy.evaluate(
        preflight.observation,
        options.contentAccess,
      );
      this.audit.recordContentAccessDecided(toolName, contentDecisionAuditMetadata(decision));

      if (decision.action === 'REQUIRE_APPROVAL') {
        const receipt = this.resolveContentApproval(toolName, decision, options.contentApprovalId);
        if (receipt instanceof Object && 'outcome' in receipt) {
          return receipt.outcome;
        }

        const approvedDecision: ContentAccessDecision = {
          ...decision,
          action: 'ALLOW',
          reasonCode: 'CONTENT_ACCESS_ALLOWED',
          grantedExposure: decision.requestedExposure,
          requiresApproval: false,
        };
        this.audit.recordContentAccessDecided(toolName, {
          ...contentDecisionAuditMetadata(approvedDecision),
          contentApprovalReceiptId: receipt.id,
        });

        const surface = contentSurfaceFor(preflight.surfaces, approvedDecision.grantedExposure);
        if (approvedDecision.grantedExposure !== 'NONE' && surface === undefined) {
          return this.contentDeniedOutcome(
            toolName,
            'CONTENT_UNSUPPORTED',
            'The preflight adapter cannot render the approved ' +
              approvedDecision.grantedExposure +
              ' surface.',
            approvedDecision,
          );
        }

        this.contentApprovals.consume(receipt.id);
        return this.contentCompletedOutcome(approvedDecision, surface, receipt.id);
      }

      if (decision.action !== 'ALLOW') {
        return this.contentDecisionDeniedOutcome(decision);
      }

      const surface = contentSurfaceFor(preflight.surfaces, decision.grantedExposure);
      if (decision.grantedExposure !== 'NONE' && surface === undefined) {
        return this.contentDeniedOutcome(
          toolName,
          'CONTENT_UNSUPPORTED',
          'The preflight adapter cannot render the granted ' +
            decision.grantedExposure +
            ' surface.',
          decision,
        );
      }

      return this.contentCompletedOutcome(decision, surface);
    } catch {
      return this.contentDeniedOutcome(
        toolName,
        'CONTENT_SCAN_FAILED',
        'Content preflight failed. Raw tool output was withheld.',
      );
    }
  }

  private contentDecisionDeniedOutcome(decision: ContentAccessDecision): Outcome {
    const nextAction =
      decision.action === 'REQUIRE_APPROVAL'
        ? 'Content approval is required, but no content approval store is configured yet. Raw output was withheld.'
        : decision.action === 'QUARANTINE'
          ? 'Content is quarantined. Inspect it only through an isolated review workflow.'
          : 'Content exposure was denied. Raw output was withheld.';
    return {
      state: 'DENIED',
      reasonCode: decision.reasonCode as Exclude<ContentAccessReasonCode, 'CONTENT_ACCESS_ALLOWED'>,
      retryable: false,
      requiresUser: decision.action === 'REQUIRE_APPROVAL' || decision.action === 'QUARANTINE',
      safeToContinue: false,
      nextAction,
      data: { contentAccess: decision },
    };
  }

  private resolveContentApproval(
    toolName: string,
    decision: ContentAccessDecision,
    contentApprovalId: string | undefined,
  ): ContentApprovalReceipt | { outcome: Outcome } {
    if (!contentApprovalId) {
      const receipt = this.contentApprovals.request(
        toolName,
        decision.binding,
        new Date(Date.now() + this.config.contentPreflight.approvalTtlMs).toISOString(),
      );
      this.audit.recordContentApprovalEvent(
        'CONTENT_APPROVAL_REQUESTED',
        toolName,
        receipt.binding.bindingHash,
        contentApprovalAuditMetadata(receipt),
      );
      return {
        outcome: this.contentApprovalWaitingOutcome(decision, receipt),
      };
    }

    const check = this.contentApprovals.check(contentApprovalId, toolName, decision.binding);
    if (check.valid && check.receipt) return check.receipt;

    const receipt = check.receipt;
    if (check.reason === 'Content approval pending' && receipt) {
      return {
        outcome: this.contentApprovalWaitingOutcome(decision, receipt),
      };
    }
    if (check.reason === 'Content approval rejected') {
      return {
        outcome: {
          state: 'DENIED',
          reasonCode: 'CONTENT_APPROVAL_REJECTED',
          retryable: false,
          requiresUser: true,
          safeToContinue: false,
          nextAction: 'Content approval was rejected. Raw output was withheld.',
          data: { contentAccess: decision, contentApprovalReceiptId: contentApprovalId },
        },
      };
    }

    const reasonCode =
      check.reason === 'Content approval expired'
        ? 'CONTENT_RECEIPT_STALE'
        : 'CONTENT_APPROVAL_INVALIDATED';
    this.audit.recordContentApprovalEvent(
      'CONTENT_APPROVAL_INVALIDATED',
      toolName,
      decision.binding.bindingHash,
      {
        ...contentDecisionAuditMetadata(decision),
        contentApprovalReceiptId: contentApprovalId,
        invalidationReason: check.reason,
      },
    );
    return {
      outcome: {
        state: 'APPROVAL_INVALIDATED',
        reasonCode,
        retryable: false,
        requiresUser: true,
        safeToContinue: false,
        nextAction: 'Content approval is no longer valid. Request a fresh content approval.',
        data: { contentAccess: decision, contentApprovalReceiptId: contentApprovalId },
      },
    };
  }

  private contentApprovalWaitingOutcome(
    decision: ContentAccessDecision,
    receipt: ContentApprovalReceipt,
  ): Outcome {
    return {
      state: 'WAITING_FOR_APPROVAL',
      reasonCode: 'CONTENT_APPROVAL_REQUIRED',
      retryable: true,
      requiresUser: true,
      safeToContinue: false,
      nextAction: 'Content approval required. Re-submit with contentApprovalId: ' + receipt.id,
      data: {
        contentAccess: decision,
        contentApprovalReceiptId: receipt.id,
        contentApprovalExpiresAt: receipt.expiresAt,
      },
    };
  }

  private contentCompletedOutcome(
    decision: ContentAccessDecision,
    surface: unknown,
    contentApprovalReceiptId?: string,
  ): Outcome {
    return {
      state: 'COMPLETED',
      reasonCode:
        decision.reasonCode === 'CONTENT_ACCESS_ALLOWED'
          ? undefined
          : (decision.reasonCode as Exclude<ContentAccessReasonCode, 'CONTENT_ACCESS_ALLOWED'>),
      retryable: false,
      requiresUser: false,
      safeToContinue: true,
      nextAction:
        decision.reasonCode === 'CONTENT_EXPOSURE_DOWNGRADED'
          ? 'Continue only with the granted lower exposure level.'
          : undefined,
      data: {
        content: surface,
        contentAccess: decision,
        contentApprovalReceiptId,
      },
    };
  }

  private contentDeniedOutcome(
    toolName: string,
    reasonCode: Exclude<ContentAccessReasonCode, 'CONTENT_ACCESS_ALLOWED'>,
    nextAction: string,
    decision?: ContentAccessDecision,
  ): Outcome {
    this.audit.recordContentAccessDecided(toolName, {
      ...(decision ? contentDecisionAuditMetadata(decision) : {}),
      reasonCode,
      action: 'DENY',
    });
    return {
      state: 'DENIED',
      reasonCode,
      retryable: false,
      requiresUser: true,
      safeToContinue: false,
      nextAction,
      data: decision ? { contentAccess: decision } : undefined,
    };
  }
}

function requiredOidcConfig(config?: OidcAuthConfig): OidcAuthConfig {
  if (!config) {
    throw new Error('operatorAuth.oidc is required when operatorAuth.mode is "oidc"');
  }
  return config;
}

function auditCorrelationMetadata(
  context: GovernedExecutionContext,
  approvalId?: string,
): Record<string, unknown> {
  return {
    requestId: context.correlation.requestId,
    correlationId: context.correlation.correlationId,
    causationId: context.correlation.causationId,
    actionId: context.correlation.actionId,
    approvalId,
    runtime: context.runtimeId,
    runtimeInstanceId: context.runtimeInstanceId,
    sessionId: context.sessionId,
    authenticatedPrincipalId: context.authenticatedPrincipal.id,
    actingPrincipalId: context.actingPrincipal.id,
    representedPrincipalId: context.representedPrincipal?.id,
  };
}

function sessionAuditMetadata(session: OperatorSession): Record<string, unknown> {
  return {
    operatorId: session.operatorId,
    operatorDisplayName: session.displayName,
    sessionId: session.sessionId,
    authMethod: session.authMethod,
    operatorRoles: session.roles,
    createdAt: session.createdAt,
    lastAuthenticatedAt: session.lastAuthenticatedAt,
    revokedAt: session.revokedAt,
    revocationReason: session.revocationReason,
  };
}

function contentObservationAuditMetadata(
  observation: ContentSurfaceObservation,
): Record<string, unknown> {
  return {
    observationId: observation.observationId,
    contentHash: observation.contentHash,
    sourceId: observation.source.sourceId,
    sourceTrust: observation.source.trust,
    mediaType: observation.source.mediaType,
    byteLength: observation.source.byteLength,
    scanner: observation.scanner,
    scanStatus: observation.scanStatus,
    flags: observation.flags,
  };
}

function contentDecisionAuditMetadata(decision: ContentAccessDecision): Record<string, unknown> {
  return {
    action: decision.action,
    reasonCode: decision.reasonCode,
    requestedExposure: decision.requestedExposure,
    grantedExposure: decision.grantedExposure,
    requiresApproval: decision.requiresApproval,
    bindingHash: decision.binding.bindingHash,
    observationId: decision.binding.observationId,
    contentHash: decision.binding.contentHash,
    destination: decision.binding.destination,
    purpose: decision.binding.purpose,
    policyVersion: decision.binding.policyVersion,
    selection: decision.binding.selection,
  };
}

function contentApprovalAuditMetadata(receipt: ContentApprovalReceipt): Record<string, unknown> {
  return {
    contentApprovalReceiptId: receipt.id,
    status: receipt.status,
    requestedAt: receipt.requestedAt,
    expiresAt: receipt.expiresAt,
    approvedBy: receipt.approvedBy,
    approvedBySessionId: receipt.approvedBySessionId,
    approvedAt: receipt.approvedAt,
    rejectedBy: receipt.rejectedBy,
    rejectedBySessionId: receipt.rejectedBySessionId,
    rejectedAt: receipt.rejectedAt,
    used: receipt.used,
    bindingHash: receipt.binding.bindingHash,
    observationId: receipt.binding.observationId,
    contentHash: receipt.binding.contentHash,
    requestedExposure: receipt.binding.requestedExposure,
    destination: receipt.binding.destination,
    purpose: receipt.binding.purpose,
    policyVersion: receipt.binding.policyVersion,
    selection: receipt.binding.selection,
  };
}

export {
  DenyAllExecutionAuthenticator,
  DenyAllOperatorAuthenticator,
  DevelopmentExecutionTokenAuthenticator,
  DevelopmentTokenAuthenticator,
  OidcJwtAuthenticator,
  hasOperatorPermission,
  permissionsForOperator,
  type AuthenticatedOperator,
  type ExecutionAuthenticator,
  type ExecutionProfile,
  type OidcAuthConfig,
  type OperatorAuthenticator,
  type OperatorPermission,
  type OperatorProfile,
} from './auth.js';
export {
  InMemoryOperatorSessionStore,
  SqliteOperatorSessionStore,
  type OperatorSession,
  type OperatorSessionObservation,
  type OperatorSessionStore,
  type OperatorSessionTransition,
} from './operator-session-store.js';
export {
  JsonContentPreflightAdapter,
  type ContentPreflightAdapter,
  type ContentPreflightInput,
  type ContentPreflightResult,
  type ContentSurfaces,
  type JsonContentPreflightAdapterConfig,
} from './content-preflight.js';
export {
  InMemoryContentApprovalStore,
  SqliteContentApprovalStore,
  type ContentApprovalCheck,
  type ContentApprovalStore,
} from './content-approval-store.js';
