import { ToolRegistry } from './registry.js';
import { RiskClassifier } from './classifier.js';
import { PolicyEngine } from './policy-engine.js';
import { ApprovalEngine } from './approval-engine.js';
import { type ToolExecutor } from './execution-wrapper.js';
import type { IAuditLog } from './audit-log-interface.js';
import type { ToolMetadata, Outcome } from '@ananke/schema';
export interface GatewayConfig {
    port?: number;
    mcpServers?: {
        name: string;
        url: string;
    }[];
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
export declare class Gateway {
    registry: ToolRegistry;
    classifier: RiskClassifier;
    policy: PolicyEngine;
    approvals: ApprovalEngine;
    audit: IAuditLog;
    private executors;
    private app;
    private config;
    constructor(config?: GatewayConfig);
    registerTool(metadata: ToolMetadata): void;
    setExecutor(toolName: string, executor: ToolExecutor): void;
    /**
     * Execute a tool call through the full runtime pipeline:
     * classify → policy → (approval) → execute → outcome → audit
     */
    execute(toolName: string, args: Record<string, unknown>, options?: {
        approvalId?: string;
    }): Promise<{
        outcome: Outcome;
        approvalRequired?: boolean;
        approvalGrantId?: string;
    }>;
    start(): void;
}
//# sourceMappingURL=index.d.ts.map