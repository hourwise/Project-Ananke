import type { AuditEvent, AuditEventType, Outcome, PolicyDecision } from '@ananke/schema';
import type { IAuditLog } from './audit-log-interface.js';
import { sanitizeAuditEvent } from './audit-sanitizer.js';

/**
 * In-memory Audit Log — records every decision and side effect.
 * Use SqliteAuditLog for persistent storage.
 */
export class AuditLog implements IAuditLog {
  private events: AuditEvent[] = [];

  record(event: Omit<AuditEvent, 'id' | 'timestamp'>): AuditEvent {
    const full = sanitizeAuditEvent({
      ...event,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    });
    this.events.push(full);
    return full;
  }

  recordContentApprovalEvent(
    eventType: Extract<
      AuditEventType,
      | 'CONTENT_APPROVAL_REQUESTED'
      | 'CONTENT_APPROVAL_GRANTED'
      | 'CONTENT_APPROVAL_DENIED'
      | 'CONTENT_APPROVAL_INVALIDATED'
    >,
    toolName: string,
    bindingHash: string,
    metadata?: Record<string, unknown>,
  ): AuditEvent {
    return this.record({ eventType, toolName, approvalHash: bindingHash, metadata });
  }

  recordContentPreflighted(toolName: string, metadata: Record<string, unknown>): AuditEvent {
    return this.record({ eventType: 'CONTENT_PREFLIGHTED', toolName, metadata });
  }

  recordContentAccessDecided(toolName: string, metadata: Record<string, unknown>): AuditEvent {
    return this.record({ eventType: 'CONTENT_ACCESS_DECIDED', toolName, metadata });
  }

  recordOperatorSessionEvent(
    eventType: Extract<
      AuditEventType,
      'OPERATOR_SESSION_STARTED' | 'OPERATOR_SESSION_ROTATED' | 'OPERATOR_SESSION_REVOKED'
    >,
    metadata: Record<string, unknown>,
  ): AuditEvent {
    return this.record({ eventType, toolName: 'operator.session', metadata });
  }

  recordToolCallRequested(
    toolName: string,
    args: Record<string, unknown>,
    serverName?: string,
  ): AuditEvent {
    return this.record({
      eventType: 'TOOL_CALL_REQUESTED',
      toolName,
      serverName,
      arguments: args,
    });
  }

  recordPolicyChecked(toolName: string, decision: PolicyDecision): AuditEvent {
    return this.record({
      eventType: 'POLICY_CHECKED',
      toolName,
      policyDecision: decision,
    });
  }

  recordApprovalRequested(
    toolName: string,
    approvalHash: string,
    args: Record<string, unknown>,
  ): AuditEvent {
    return this.record({
      eventType: 'APPROVAL_REQUESTED',
      toolName,
      approvalHash,
      arguments: args,
    });
  }

  recordApprovalGranted(
    toolName: string,
    approvalHash: string,
    metadata?: Record<string, unknown>,
  ): AuditEvent {
    return this.record({
      eventType: 'APPROVAL_GRANTED',
      toolName,
      approvalHash,
      metadata,
    });
  }

  recordApprovalDenied(
    toolName: string,
    approvalHash: string,
    metadata?: Record<string, unknown>,
  ): AuditEvent {
    return this.record({
      eventType: 'APPROVAL_DENIED',
      toolName,
      approvalHash,
      metadata,
    });
  }

  recordApprovalInvalidated(toolName: string, approvalHash: string): AuditEvent {
    return this.record({
      eventType: 'APPROVAL_INVALIDATED',
      toolName,
      approvalHash,
    });
  }

  recordToolExecuted(toolName: string, outcome: Outcome, durationMs: number): AuditEvent {
    return this.record({
      eventType: 'TOOL_EXECUTED',
      toolName,
      outcome,
      durationMs,
    });
  }

  recordToolFailed(toolName: string, outcome: Outcome, durationMs: number): AuditEvent {
    return this.record({
      eventType: 'TOOL_FAILED',
      toolName,
      outcome,
      durationMs,
    });
  }

  recordOutcomeGenerated(toolName: string, outcome: Outcome): AuditEvent {
    return this.record({
      eventType: 'OUTCOME_GENERATED',
      toolName,
      outcome,
    });
  }

  query(filter?: {
    toolName?: string;
    eventType?: AuditEventType;
    since?: string;
    limit?: number;
  }): AuditEvent[] {
    let results = [...this.events];
    if (filter?.toolName) {
      results = results.filter((e) => e.toolName === filter.toolName);
    }
    if (filter?.eventType) {
      results = results.filter((e) => e.eventType === filter.eventType);
    }
    if (filter?.since) {
      results = results.filter((e) => e.timestamp >= filter.since!);
    }
    if (filter?.limit) {
      results = results.slice(-filter.limit);
    }
    return results;
  }

  all(): AuditEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}
