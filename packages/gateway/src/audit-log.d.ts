import type { AuditEvent, AuditEventType, Outcome, PolicyDecision } from '@ananke/schema';
import type { IAuditLog } from './audit-log-interface.js';
/**
 * In-memory Audit Log — records every decision and side effect.
 * Use SqliteAuditLog for persistent storage.
 */
export declare class AuditLog implements IAuditLog {
    private events;
    record(event: Omit<AuditEvent, 'id' | 'timestamp'>): AuditEvent;
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
//# sourceMappingURL=audit-log.d.ts.map