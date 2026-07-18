import type { AuditEvent, AuditEventType, Outcome, PolicyDecision } from '@ananke/schema';

/**
 * Shared audit log interface — both in-memory and SQLite implementations
 * satisfy this contract so the Gateway can accept either.
 */
export interface IAuditLog {
  recordContentApprovalEvent(
    eventType: Extract<AuditEventType, 'CONTENT_APPROVAL_REQUESTED' | 'CONTENT_APPROVAL_GRANTED' | 'CONTENT_APPROVAL_DENIED' | 'CONTENT_APPROVAL_INVALIDATED'>,
    toolName: string,
    bindingHash: string,
    metadata?: Record<string, unknown>,
  ): AuditEvent;
  recordContentPreflighted(toolName: string, metadata: Record<string, unknown>): AuditEvent;
  recordContentAccessDecided(toolName: string, metadata: Record<string, unknown>): AuditEvent;
  recordOperatorSessionEvent(
    eventType: Extract<AuditEventType, 'OPERATOR_SESSION_STARTED' | 'OPERATOR_SESSION_ROTATED' | 'OPERATOR_SESSION_REVOKED'>,
    metadata: Record<string, unknown>,
  ): AuditEvent;
  recordToolCallRequested(
    toolName: string,
    args: Record<string, unknown>,
    serverName?: string,
    metadata?: Record<string, unknown>,
  ): AuditEvent;
  recordPolicyChecked(toolName: string, decision: PolicyDecision): AuditEvent;
  recordApprovalRequested(
    toolName: string,
    approvalHash: string,
    args: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): AuditEvent;
  recordApprovalGranted(toolName: string, approvalHash: string, metadata?: Record<string, unknown>): AuditEvent;
  recordApprovalDenied(toolName: string, approvalHash: string, metadata?: Record<string, unknown>): AuditEvent;
  recordApprovalInvalidated(toolName: string, approvalHash: string): AuditEvent;
  recordToolExecuted(toolName: string, outcome: Outcome, durationMs: number): AuditEvent;
  recordToolFailed(toolName: string, outcome: Outcome, durationMs: number): AuditEvent;
  recordOutcomeGenerated(toolName: string, outcome: Outcome): AuditEvent;
  query(filter?: { toolName?: string; eventType?: AuditEventType; since?: string; limit?: number }): AuditEvent[];
  all(): AuditEvent[];
  clear(): void;
}
