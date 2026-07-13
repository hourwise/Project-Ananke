import Database from 'better-sqlite3';
import type { AuditEvent, AuditEventType, Outcome, PolicyDecision } from '@ananke/schema';
import type { Statement } from 'better-sqlite3';
import type { IAuditLog } from './audit-log-interface.js';
import { sanitizeAuditEvent } from './audit-sanitizer.js';

/**
 * Persistent SQLite audit log — survives restarts and crashes.
 *
 * Usage:
 *   const audit = new SqliteAuditLog('./audit.db');
 *   // ... use same API as in-memory AuditLog
 *   audit.close();
 */

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS audit_events (
  id          TEXT PRIMARY KEY,
  timestamp   TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  tool_name   TEXT NOT NULL,
  server_name TEXT,
  arguments   TEXT,
  policy_decision TEXT,
  approval_hash   TEXT,
  outcome_state   TEXT,
  outcome_reason  TEXT,
  outcome_data    TEXT,
  duration_ms     INTEGER,
  metadata        TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_tool    ON audit_events(tool_name);
CREATE INDEX IF NOT EXISTS idx_audit_type    ON audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_ts      ON audit_events(timestamp);
`;

interface AuditRow {
  id: string;
  timestamp: string;
  event_type: string;
  tool_name: string;
  server_name: string | null;
  arguments: string | null;
  policy_decision: string | null;
  approval_hash: string | null;
  outcome_state: string | null;
  outcome_reason: string | null;
  outcome_data: string | null;
  duration_ms: number | null;
  metadata: string | null;
}

function rowToEvent(row: AuditRow): AuditEvent {
  const event: AuditEvent = {
    id: row.id,
    timestamp: row.timestamp,
    eventType: row.event_type as AuditEventType,
    toolName: row.tool_name,
    serverName: row.server_name ?? undefined,
    arguments: row.arguments ? JSON.parse(row.arguments) : undefined,
    policyDecision: (row.policy_decision as PolicyDecision) ?? undefined,
    approvalHash: row.approval_hash ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };

  if (row.outcome_state) {
    event.outcome = {
      state: row.outcome_state as Outcome['state'],
      reasonCode: (row.outcome_reason as Outcome['reasonCode']) ?? undefined,
      retryable: false,
      requiresUser: false,
      safeToContinue: true,
      data: row.outcome_data ? JSON.parse(row.outcome_data) : undefined,
    };
  }

  return event;
}

export class SqliteAuditLog implements IAuditLog {
  private db: Database.Database;
  private insertStmt: Statement;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA_SQL);

    this.insertStmt = this.db.prepare(`
      INSERT INTO audit_events (
        id, timestamp, event_type, tool_name, server_name,
        arguments, policy_decision, approval_hash,
        outcome_state, outcome_reason, outcome_data,
        duration_ms, metadata
      ) VALUES (
        @id, @timestamp, @event_type, @tool_name, @server_name,
        @arguments, @policy_decision, @approval_hash,
        @outcome_state, @outcome_reason, @outcome_data,
        @duration_ms, @metadata
      )
    `);
  }

  private recordEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): AuditEvent {
    if (this.closed) throw new Error('SqliteAuditLog is closed');

    const full = sanitizeAuditEvent({
      ...event,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    });

    this.insertStmt.run({
      id: full.id,
      timestamp: full.timestamp,
      event_type: full.eventType,
      tool_name: full.toolName,
      server_name: full.serverName ?? null,
      arguments: full.arguments ? JSON.stringify(full.arguments) : null,
      policy_decision: full.policyDecision ?? null,
      approval_hash: full.approvalHash ?? null,
      outcome_state: full.outcome?.state ?? null,
      outcome_reason: full.outcome?.reasonCode ?? null,
      outcome_data: full.outcome?.data ? JSON.stringify(full.outcome.data) : null,
      duration_ms: full.durationMs ?? null,
      metadata: full.metadata ? JSON.stringify(full.metadata) : null,
    });

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
    return this.recordEvent({ eventType, toolName, approvalHash: bindingHash, metadata });
  }

  recordContentPreflighted(toolName: string, metadata: Record<string, unknown>): AuditEvent {
    return this.recordEvent({ eventType: 'CONTENT_PREFLIGHTED', toolName, metadata });
  }

  recordContentAccessDecided(toolName: string, metadata: Record<string, unknown>): AuditEvent {
    return this.recordEvent({ eventType: 'CONTENT_ACCESS_DECIDED', toolName, metadata });
  }

  recordOperatorSessionEvent(
    eventType: Extract<
      AuditEventType,
      'OPERATOR_SESSION_STARTED' | 'OPERATOR_SESSION_ROTATED' | 'OPERATOR_SESSION_REVOKED'
    >,
    metadata: Record<string, unknown>,
  ): AuditEvent {
    return this.recordEvent({ eventType, toolName: 'operator.session', metadata });
  }

  // ── Convenience recorders (mirrors in-memory AuditLog) ──────

  recordToolCallRequested(
    toolName: string,
    args: Record<string, unknown>,
    serverName?: string,
  ): AuditEvent {
    return this.recordEvent({
      eventType: 'TOOL_CALL_REQUESTED',
      toolName,
      serverName,
      arguments: args,
    });
  }

  recordPolicyChecked(toolName: string, decision: PolicyDecision): AuditEvent {
    return this.recordEvent({ eventType: 'POLICY_CHECKED', toolName, policyDecision: decision });
  }

  recordApprovalRequested(
    toolName: string,
    approvalHash: string,
    args: Record<string, unknown>,
  ): AuditEvent {
    return this.recordEvent({
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
    return this.recordEvent({ eventType: 'APPROVAL_GRANTED', toolName, approvalHash, metadata });
  }

  recordApprovalDenied(
    toolName: string,
    approvalHash: string,
    metadata?: Record<string, unknown>,
  ): AuditEvent {
    return this.recordEvent({ eventType: 'APPROVAL_DENIED', toolName, approvalHash, metadata });
  }

  recordApprovalInvalidated(toolName: string, approvalHash: string): AuditEvent {
    return this.recordEvent({ eventType: 'APPROVAL_INVALIDATED', toolName, approvalHash });
  }

  recordToolExecuted(toolName: string, outcome: Outcome, durationMs: number): AuditEvent {
    return this.recordEvent({ eventType: 'TOOL_EXECUTED', toolName, outcome, durationMs });
  }

  recordToolFailed(toolName: string, outcome: Outcome, durationMs: number): AuditEvent {
    return this.recordEvent({ eventType: 'TOOL_FAILED', toolName, outcome, durationMs });
  }

  recordOutcomeGenerated(toolName: string, outcome: Outcome): AuditEvent {
    return this.recordEvent({ eventType: 'OUTCOME_GENERATED', toolName, outcome });
  }

  // ── Query ────────────────────────────────────────────────────

  query(filter?: {
    toolName?: string;
    eventType?: AuditEventType;
    since?: string;
    limit?: number;
  }): AuditEvent[] {
    let sql = 'SELECT * FROM audit_events WHERE 1=1';
    const params: Record<string, unknown> = {};

    if (filter?.toolName) {
      sql += ' AND tool_name = @toolName';
      params.toolName = filter.toolName;
    }
    if (filter?.eventType) {
      sql += ' AND event_type = @eventType';
      params.eventType = filter.eventType;
    }
    if (filter?.since) {
      sql += ' AND timestamp >= @since';
      params.since = filter.since;
    }
    sql += ' ORDER BY timestamp DESC';
    if (filter?.limit) {
      sql += ' LIMIT @limit';
      params.limit = filter.limit;
    }

    const rows = this.db.prepare(sql).all(params) as AuditRow[];
    return rows.map(rowToEvent);
  }

  all(): AuditEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM audit_events ORDER BY timestamp ASC')
      .all() as AuditRow[];
    return rows.map(rowToEvent);
  }

  clear(): void {
    this.db.exec('DELETE FROM audit_events');
  }

  /** Total number of audit events in the database. */
  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM audit_events').get() as {
      cnt: number;
    };
    return row.cnt;
  }

  close(): void {
    this.closed = true;
    this.db.close();
  }
}
