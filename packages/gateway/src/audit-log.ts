import type { AuditEvent, AuditEventType, Outcome, PolicyDecision } from '@ananke/schema';

/**
 * Audit Log — records every decision and side effect.
 *
 * MVP: In-memory array with helpers. Phase 2: SQLite-backed.
 */
export class AuditLog {
  private events: AuditEvent[] = [];

  record(event: Omit<AuditEvent, 'id' | 'timestamp'>): AuditEvent {
    const full: AuditEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };
    this.events.push(full);
    return full;
  }

  recordToolCallRequested(toolName: string, args: Record<string, unknown>, serverName?: string): AuditEvent {
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

  recordApprovalRequested(toolName: string, approvalHash: string, args: Record<string, unknown>): AuditEvent {
    return this.record({
      eventType: 'APPROVAL_REQUESTED',
      toolName,
      approvalHash,
      arguments: args,
    });
  }

  recordApprovalGranted(toolName: string, approvalHash: string): AuditEvent {
    return this.record({
      eventType: 'APPROVAL_GRANTED',
      toolName,
      approvalHash,
    });
  }

  recordApprovalDenied(toolName: string, approvalHash: string): AuditEvent {
    return this.record({
      eventType: 'APPROVAL_DENIED',
      toolName,
      approvalHash,
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
