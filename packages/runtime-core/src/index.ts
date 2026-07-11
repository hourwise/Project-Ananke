import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { ToolRegistry } from './registry.js';
import { RiskClassifier } from './classifier.js';
import { discoverPolicyConfigFile, loadPolicyConfigFile, PolicyEngine } from '@ananke/policy-engine';
import { ApprovalEngine } from '@ananke/authority-engine';
import { executeTool, type ToolExecutor } from '@ananke/tool-router';
import { classifyOutcome } from '@ananke/outcome-engine';
import { AuditLog } from '@ananke/audit-engine';
import { createGatewayRoutes } from './routes.js';
import {
  DevelopmentTokenAuthenticator,
  OidcJwtAuthenticator,
  type OidcAuthConfig,
  type OperatorAuthenticator,
  type OperatorProfile,
} from './auth.js';
import type { IAuditLog } from '@ananke/audit-engine';
import type { ToolMetadata, Outcome, OperatorIdentity } from '@ananke/schema';

export const DEFAULT_APPROVAL_DEV_TOKEN = 'dev-approval-token';

export interface OperatorAuthConfig {
  mode?: 'development' | 'oidc';
  tokens?: Record<string, OperatorProfile>;
  oidc?: OidcAuthConfig;
  authenticator?: OperatorAuthenticator;
}

export interface GatewayConfig {
  port?: number;
  mcpServers?: { name: string; url: string }[];
  audit?: IAuditLog;
  operatorAuth?: OperatorAuthConfig;
  /** @deprecated Use operatorAuth. */
  approvalAuth?: OperatorAuthConfig;
  policyFile?: string;
  autoLoadPolicy?: boolean;
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
  public audit: IAuditLog;

  private executors = new Map<string, ToolExecutor>();
  private app = new Hono();
  private config: {
    port: number;
    mcpServers: { name: string; url: string }[];
    audit: IAuditLog;
    operatorAuthenticator: OperatorAuthenticator;
    policyFile?: string;
    autoLoadPolicy: boolean;
  };

  constructor(config: GatewayConfig = {}) {
    const operatorAuth = config.operatorAuth ?? config.approvalAuth;
    const operatorAuthenticator = operatorAuth?.authenticator
      ?? (operatorAuth?.mode === 'oidc'
        ? new OidcJwtAuthenticator(requiredOidcConfig(operatorAuth.oidc))
        : new DevelopmentTokenAuthenticator(operatorAuth?.tokens ?? {
          [DEFAULT_APPROVAL_DEV_TOKEN]: {
            operatorId: 'local-dashboard',
            displayName: 'Local Dashboard',
            sessionId: 'local-dev-session',
            roles: ['admin'],
          },
        }));

    this.config = {
      port: config.port ?? 3000,
      mcpServers: config.mcpServers ?? [],
      audit: config.audit ?? new AuditLog(),
      operatorAuthenticator,
      policyFile: config.policyFile,
      autoLoadPolicy: config.autoLoadPolicy ?? true,
    };
    this.audit = this.config.audit;

    const policyFile = this.config.policyFile ?? (
      this.config.autoLoadPolicy ? discoverPolicyConfigFile() : undefined
    );
    if (policyFile) {
      const loaded = loadPolicyConfigFile(policyFile);
      this.policy.loadConfig(loaded.config);
      console.log(`[ananke] loaded policy config from ${loaded.path}`);
    }

    // Mount routes
    this.app.use('/api/*', cors({
      allowHeaders: ['Authorization', 'Content-Type'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      origin: '*',
    }));
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

  authenticateOperator(authorizationHeader?: string): Promise<OperatorIdentity | undefined> {
    return this.config.operatorAuthenticator.authenticate(authorizationHeader);
  }

  /**
   * Execute a tool call through the full runtime pipeline:
   * classify → policy → (approval) → execute → outcome → audit
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>,
    options?: { approvalId?: string },
  ): Promise<{ outcome: Outcome; approvalRequired?: boolean; approvalGrantId?: string }> {
    const startTime = performance.now();

    // 1. Audit: tool call requested
    this.audit.recordToolCallRequested(toolName, args);

    // 2. Classify risk
    const riskClass = this.classifier.classify(toolName);
    const metadata = this.registry.get(toolName);

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
        const { grant } = this.approvals.requestApproval(toolName, args);
        this.audit.recordApprovalRequested(toolName, grant.canonicalHash, args);
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
      const check = this.approvals.checkApproval(options.approvalId, args);
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
          this.audit.recordApprovalDenied(toolName, options.approvalId);
          this.audit.recordOutcomeGenerated(toolName, outcome);
          return { outcome };
        }

        this.audit.recordApprovalInvalidated(toolName, options.approvalId);
        const outcome = classifyOutcome(
          { success: false, error: check.reason, errorCode: 'APPROVAL_HASH_MISMATCH', durationMs: 0 },
        );
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
    const outcome = classifyOutcome(result);

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
      console.log(
        `[ananke] ${toolName} → ${outcome.state} (${totalMs}ms)`,
      );
    }

    return { outcome };
  }

  start(): void {
    serve({ fetch: this.app.fetch, port: this.config.port }, (info) => {
      console.log(`🔮 Ananke Outcome Gateway running on http://localhost:${info.port}`);
    });
  }
}

function requiredOidcConfig(config?: OidcAuthConfig): OidcAuthConfig {
  if (!config) {
    throw new Error('operatorAuth.oidc is required when operatorAuth.mode is "oidc"');
  }
  return config;
}

export {
  DevelopmentTokenAuthenticator,
  OidcJwtAuthenticator,
  hasOperatorPermission,
  permissionsForOperator,
  type OidcAuthConfig,
  type OperatorAuthenticator,
  type OperatorPermission,
  type OperatorProfile,
} from './auth.js';
