import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashCanonicalCall } from '@ananke/authority-engine';
import {
  SqliteContentApprovalStore,
  type ContentApprovalStore,
} from './content-approval-store.js';
import type { ContentApprovalBinding } from '@ananke/schema';

const OPERATOR = {
  operatorId: 'approver-1',
  sessionId: 'approver-session',
  authMethod: 'dev-token' as const,
  roles: ['approver' as const],
  authenticatedAt: '2026-07-12T12:00:00.000Z',
};

function binding(
  overrides: Partial<Omit<ContentApprovalBinding, 'bindingHash'>> = {},
): ContentApprovalBinding {
  const material = {
    contentHash: 'a'.repeat(64),
    observationId: 'observation-1',
    requestedExposure: 'SELECTED_CONTENT' as const,
    destination: { runtime: 'test-agent', agentId: 'agent-1' },
    purpose: 'summarize a note',
    policyVersion: 'content-policy-v1',
    selection: { fields: ['title'] },
    ...overrides,
  };
  return {
    ...material,
    bindingHash: hashCanonicalCall(material),
  };
}

function futureExpiry(): string {
  return new Date(Date.now() + 60_000).toISOString();
}

describe('SqliteContentApprovalStore', () => {
  it('persists an approved receipt and rejects a changed binding after restart', () => {
    const path = join(tmpdir(), 'ananke-content-approvals-' + crypto.randomUUID() + '.db');
    let first: ContentApprovalStore | undefined;

    try {
      first = new SqliteContentApprovalStore(path);
      const receipt = first.request('notes.read', binding(), futureExpiry());
      expect(first.approve(receipt.id, OPERATOR)).toMatchObject({
        status: 'approved',
        approvedBy: 'approver-1',
      });
      (first as SqliteContentApprovalStore).close();
      first = undefined;

      const restarted = new SqliteContentApprovalStore(path);
      try {
        expect(restarted.check(receipt.id, 'notes.read', binding())).toMatchObject({
          valid: true,
          receipt: { id: receipt.id, status: 'approved' },
        });
        expect(restarted.check(receipt.id, 'notes.read', binding({
          purpose: 'send a public post',
        }))).toMatchObject({
          valid: false,
          reason: 'CONTENT_APPROVAL_BINDING_MISMATCH',
        });
      } finally {
        restarted.close();
      }
    } finally {
      if (first instanceof SqliteContentApprovalStore) first.close();
      rmSync(path, { force: true });
      rmSync(path + '-wal', { force: true });
      rmSync(path + '-shm', { force: true });
    }
  });
});
