import Database from 'better-sqlite3';
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
function rowToEvent(row) {
    const event = {
        id: row.id,
        timestamp: row.timestamp,
        eventType: row.event_type,
        toolName: row.tool_name,
        serverName: row.server_name ?? undefined,
        arguments: row.arguments ? JSON.parse(row.arguments) : undefined,
        policyDecision: row.policy_decision ?? undefined,
        approvalHash: row.approval_hash ?? undefined,
        durationMs: row.duration_ms ?? undefined,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
    if (row.outcome_state) {
        event.outcome = {
            state: row.outcome_state,
            reasonCode: row.outcome_reason ?? undefined,
            retryable: false,
            requiresUser: false,
            safeToContinue: true,
            data: row.outcome_data ? JSON.parse(row.outcome_data) : undefined,
        };
    }
    return event;
}
export class SqliteAuditLog {
    db;
    insertStmt;
    closed = false;
    constructor(dbPath) {
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
    recordEvent(event) {
        if (this.closed)
            throw new Error('SqliteAuditLog is closed');
        const full = {
            ...event,
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
        };
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
    // ── Convenience recorders (mirrors in-memory AuditLog) ──────
    recordToolCallRequested(toolName, args, serverName) {
        return this.recordEvent({ eventType: 'TOOL_CALL_REQUESTED', toolName, serverName, arguments: args });
    }
    recordPolicyChecked(toolName, decision) {
        return this.recordEvent({ eventType: 'POLICY_CHECKED', toolName, policyDecision: decision });
    }
    recordApprovalRequested(toolName, approvalHash, args) {
        return this.recordEvent({ eventType: 'APPROVAL_REQUESTED', toolName, approvalHash, arguments: args });
    }
    recordApprovalGranted(toolName, approvalHash) {
        return this.recordEvent({ eventType: 'APPROVAL_GRANTED', toolName, approvalHash });
    }
    recordApprovalDenied(toolName, approvalHash) {
        return this.recordEvent({ eventType: 'APPROVAL_DENIED', toolName, approvalHash });
    }
    recordApprovalInvalidated(toolName, approvalHash) {
        return this.recordEvent({ eventType: 'APPROVAL_INVALIDATED', toolName, approvalHash });
    }
    recordToolExecuted(toolName, outcome, durationMs) {
        return this.recordEvent({ eventType: 'TOOL_EXECUTED', toolName, outcome, durationMs });
    }
    recordToolFailed(toolName, outcome, durationMs) {
        return this.recordEvent({ eventType: 'TOOL_FAILED', toolName, outcome, durationMs });
    }
    recordOutcomeGenerated(toolName, outcome) {
        return this.recordEvent({ eventType: 'OUTCOME_GENERATED', toolName, outcome });
    }
    // ── Query ────────────────────────────────────────────────────
    query(filter) {
        let sql = 'SELECT * FROM audit_events WHERE 1=1';
        const params = {};
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
        const rows = this.db.prepare(sql).all(params);
        return rows.map(rowToEvent);
    }
    all() {
        const rows = this.db.prepare('SELECT * FROM audit_events ORDER BY timestamp ASC').all();
        return rows.map(rowToEvent);
    }
    clear() {
        this.db.exec('DELETE FROM audit_events');
    }
    /** Total number of audit events in the database. */
    count() {
        const row = this.db.prepare('SELECT COUNT(*) as cnt FROM audit_events').get();
        return row.cnt;
    }
    close() {
        this.closed = true;
        this.db.close();
    }
}
//# sourceMappingURL=sqlite-audit-log.js.map