import { describe, expect, it } from 'vitest';
import { AuditLog } from './audit-log.js';

describe('AuditLog sanitization', () => {
  it('applies the same sanitization boundary to the in-memory backend', () => {
    const audit = new AuditLog();
    audit.recordToolCallRequested('sensitive.tool', { token: 'raw-token', body: 'raw-body' });
    audit.recordOutcomeGenerated('sensitive.tool', {
      state: 'COMPLETED',
      retryable: false,
      requiresUser: false,
      safeToContinue: true,
      data: { password: 'returned-password' },
    });

    const events = audit.all();
    expect(events[0]?.arguments).toEqual({ _redacted: true, fieldCount: 2 });
    expect(events[1]?.outcome?.data).toBeUndefined();
    expect(JSON.stringify(events)).not.toContain('raw-token');
    expect(JSON.stringify(events)).not.toContain('returned-password');
  });
});
