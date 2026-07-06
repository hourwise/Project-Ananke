import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAuditLog } from '../src/sqlite-audit-log.js';
import { Gateway } from '../src/index.js';
import { unlinkSync } from 'node:fs';

const TEST_DB = './test-audit.db';

describe('SqliteAuditLog', () => {
  let audit: SqliteAuditLog;

  beforeEach(() => {
    audit = new SqliteAuditLog(TEST_DB);
  });

  afterEach(() => {
    audit.close();
    try { unlinkSync(TEST_DB); } catch { /* ok */ }
  });

  it('starts with zero events', () => {
    expect(audit.count()).toBe(0);
    expect(audit.all()).toHaveLength(0);
  });

  it('records and retrieves events', () => {
    audit.recordToolCallRequested('test.tool', { key: 'value' }, 'test-server');
    expect(audit.count()).toBe(1);

    const events = audit.all();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('TOOL_CALL_REQUESTED');
    expect(events[0].toolName).toBe('test.tool');
    expect(events[0].serverName).toBe('test-server');
    expect(events[0].arguments).toEqual({ key: 'value' });
  });

  it('persists across close/reopen', () => {
    audit.recordToolCallRequested('t1', {});
    audit.recordPolicyChecked('t1', 'ALLOW');
    audit.close();

    const reopened = new SqliteAuditLog(TEST_DB);
    expect(reopened.count()).toBe(2);
    reopened.close();
  });

  it('queries by tool name', () => {
    audit.recordToolCallRequested('tool-a', {});
    audit.recordToolCallRequested('tool-b', {});
    audit.recordToolExecuted('tool-a', { state: 'COMPLETED' }, 42);

    expect(audit.query({ toolName: 'tool-a' })).toHaveLength(2);
    expect(audit.query({ toolName: 'tool-b' })).toHaveLength(1);
  });

  it('queries by event type', () => {
    audit.recordToolCallRequested('t', {});
    audit.recordPolicyChecked('t', 'ALLOW');
    audit.recordToolExecuted('t', { state: 'COMPLETED' }, 10);

    expect(audit.query({ eventType: 'POLICY_CHECKED' })).toHaveLength(1);
    expect(audit.query({ eventType: 'TOOL_EXECUTED' })).toHaveLength(1);
  });

  it('respects limit', () => {
    audit.recordToolCallRequested('t', { n: 1 });
    audit.recordToolCallRequested('t', { n: 2 });
    audit.recordToolCallRequested('t', { n: 3 });

    const limited = audit.query({ limit: 2 });
    expect(limited).toHaveLength(2);
    // Most recent first
    expect(limited[0].arguments).toEqual({ n: 3 });
  });

  it('clears all events', () => {
    audit.recordToolCallRequested('t', {});
    audit.clear();
    expect(audit.count()).toBe(0);
  });
});

describe('Gateway with SqliteAuditLog', () => {
  afterEach(() => {
    try { unlinkSync(TEST_DB); } catch { /* ok */ }
  });

  it('uses SQLite audit when configured', async () => {
    const sqliteAudit = new SqliteAuditLog(TEST_DB);
    const gw = new Gateway({ audit: sqliteAudit });

    gw.registerTool({
      name: 'test.tool',
      server: 'test',
      riskClass: 'READ_ONLY',
      requiresApproval: false,
    });
    gw.setExecutor('test.tool', async () => ({ ok: true }));

    await gw.execute('test.tool', {});

    expect(sqliteAudit.count()).toBeGreaterThanOrEqual(3); // request + policy + execute + outcome
    const events = sqliteAudit.all();
    const types = events.map((e) => e.eventType);
    expect(types).toContain('TOOL_CALL_REQUESTED');
    expect(types).toContain('POLICY_CHECKED');
    expect(types).toContain('TOOL_EXECUTED');

    sqliteAudit.close();
  });
});
