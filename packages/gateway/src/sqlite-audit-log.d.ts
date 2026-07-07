import type { AuditEvent, AuditEventType, Outcome, PolicyDecision } from '@ananke/schema';
import type { IAuditLog } from './audit-log-interface.js';
export declare class SqliteAuditLog implements IAuditLog {
    private db;
    private insertStmt;
    private closed;
    constructor(dbPath: string);
    private recordEvent;
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
    /** Total number of audit events in the database. */
    count(): number;
    close(): void;
}
//# sourceMappingURL=sqlite-audit-log.d.ts.map