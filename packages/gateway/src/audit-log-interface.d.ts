import type { AuditEvent, AuditEventType, Outcome, PolicyDecision } from '@ananke/schema';
/**
 * Shared audit log interface — both in-memory and SQLite implementations
 * satisfy this contract so the Gateway can accept either.
 */
export interface IAuditLog {
    recordToolCallRequested(toolName: string, args: Record<string, unknown>, serverName?: string): AuditEvent;
    recordPolicyChecked(toolName: string, decision: PolicyDecision): AuditEvent;
    recordApprovalRequested(toolName: string, approvalHash: string, args: Record<string, unknown>): AuditEvent;
    recordApprovalGranted(toolName: string, approvalHash: string): AuditEvent;
    recordApprovalDenied(toolName: string, approvalHash: string): AuditEvent;
    recordApprovalInvalidated(toolName: string, approvalHash: string): AuditEvent;
    recordToolExecuted(toolName: string, outcome: Outcome, durationMs: number): AuditEvent;
    recordToolFailed(toolName: string, outcome: Outcome, durationMs: number): AuditEvent;
    recordOutcomeGenerated(toolName: string, outcome: Outcome): AuditEvent;
    query(filter?: {
        toolName?: string;
        eventType?: AuditEventType;
        since?: string;
        limit?: number;
    }): AuditEvent[];
    all(): AuditEvent[];
    clear(): void;
}
//# sourceMappingURL=audit-log-interface.d.ts.map