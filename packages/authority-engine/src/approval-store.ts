import type { ApprovalGrant } from '@ananke/schema';
import { hashCanonicalCall } from './canonical-hash.js';

/**
 * In-memory approval store. Replace with SQLite-backed store in the gateway package.
 */
const grants = new Map<string, ApprovalGrant>();

export function storeApproval(
  id: string,
  toolName: string,
  args: Record<string, unknown>,
  approvedBy = 'human',
  expiresAt?: string,
): ApprovalGrant {
  const canonicalHash = hashCanonicalCall(args);
  const grant: ApprovalGrant = {
    id,
    toolName,
    canonicalHash,
    arguments: args,
    approvedBy,
    approvedAt: new Date().toISOString(),
    expiresAt,
    used: false,
  };
  grants.set(id, grant);
  return grant;
}

export function getApproval(id: string): ApprovalGrant | undefined {
  return grants.get(id);
}

export function validateApproval(
  id: string,
  proposedArgs: Record<string, unknown>,
): { valid: boolean; grant?: ApprovalGrant; reason?: string } {
  const grant = grants.get(id);
  if (!grant) {
    return { valid: false, reason: 'Approval not found' };
  }
  if (grant.used) {
    return { valid: false, grant, reason: 'Approval already used' };
  }
  if (grant.expiresAt && new Date(grant.expiresAt) < new Date()) {
    return { valid: false, grant, reason: 'Approval expired' };
  }
  const proposedHash = hashCanonicalCall(proposedArgs);
  if (grant.canonicalHash !== proposedHash) {
    return { valid: false, grant, reason: 'APPROVAL_HASH_MISMATCH' };
  }
  return { valid: true, grant };
}

export function consumeApproval(id: string): void {
  const grant = grants.get(id);
  if (grant) {
    grant.used = true;
  }
}

export function clearApprovals(): void {
  grants.clear();
}

export function listPendingApprovals(): ApprovalGrant[] {
  return [...grants.values()].filter((g) => !g.used);
}
