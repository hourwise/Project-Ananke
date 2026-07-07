import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { ToolRegistry } from './registry.js';
import { RiskClassifier } from './classifier.js';
import { PolicyEngine } from '@ananke/policy-engine';
import { ApprovalEngine } from '@ananke/authority-engine';
import { executeTool, type ToolExecutor } from '@ananke/tool-router';
import { classifyOutcome } from '@ananke/outcome-engine';
import { AuditLog } from '@ananke/audit-engine';
import { createGatewayRoutes } from './routes.js';
import type { IAuditLog } from '@ananke/audit-engine';
import type { ToolMetadata, Outcome } from '@ananke/schema';

export interface GatewayConfig {
  port?: number;
  mcpServers?: { name: string; url: string }[];
  audit?: IAuditLog;
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
  private config: Required<Omit<GatewayConfig, 'audit'>> & { audit: IAuditLog };

  constructor(config: GatewayConfig = {}) {
    this.config = {
      port: config.port ?? 3000,
      mcpServers: config.mcpServers ?? [],
      audit: config.audit ?? new AuditLog(),
    };
    this.audit = this.config.audit;

    // Mount routes
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
        this.audit.recordApprovalInvalidated(toolName, options.approvalId);
        const outcome = classifyOutcome(
          { success: false, error: check.reason, errorCode: 'APPROVAL_HASH_MISMATCH', durationMs: 0 },
        );
        this.audit.recordOutcomeGenerated(toolName, outcome);
        return { outcome };
      }

      this.audit.recordApprovalGranted(toolName, options.approvalId);
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
