import { describe, it, expect, afterEach } from 'vitest';
import { SqliteAuditLog } from '@ananke/audit-engine';
import { Gateway } from './index.js';
import { unlinkSync } from 'node:fs';

const TEST_DB = './test-runtime-audit.db';

describe('Gateway with SqliteAuditLog', () => {
  afterEach(() => {
    try {
      unlinkSync(TEST_DB);
    } catch {
      /* ok */
    }
  });

  it('uses SQLite audit when configured', async () => {
    const sqliteAudit = new SqliteAuditLog(TEST_DB);
    const gw = new Gateway({
      audit: sqliteAudit,
      embeddedExecutionContext: {
        authenticatedPrincipal: { id: 'test-agent-host', kind: 'service', tenantId: 'test-tenant' },
        actingPrincipal: { id: 'test-agent', kind: 'agent', tenantId: 'test-tenant' },
        runtimeId: 'ananke',
        runtimeInstanceId: 'test-runtime',
        tenantId: 'test-tenant',
        resourceScope: {
          mode: 'bounded',
          tenantId: 'test-tenant',
          resourceType: 'test',
          resourceIds: ['test-resource'],
          operations: ['read'],
        },
        sessionId: 'test-session',
      },
    });

    gw.registerTool({
      name: 'test.tool',
      server: 'test',
      riskClass: 'READ_ONLY',
      requiredPermissions: [],
      retryable: false,
      requiresApproval: false,
    });
    gw.setExecutor('test.tool', async () => ({ ok: true }));

    await gw.execute('test.tool', {});

    expect(sqliteAudit.count()).toBeGreaterThanOrEqual(3);
    const events = sqliteAudit.all();
    const types = events.map((e) => e.eventType);
    expect(types).toContain('TOOL_CALL_REQUESTED');
    expect(types).toContain('POLICY_CHECKED');
    expect(types).toContain('TOOL_EXECUTED');

    sqliteAudit.close();
  });
});
