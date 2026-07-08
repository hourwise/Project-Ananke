import type { ApprovalGrant } from '@ananke/schema';
import { hashCanonicalCall } from './canonical-hash.js';

/**
 * In-memory approval store. Replace with SQLite-backed store in the gateway package.
 */
const grants = new Map<string, ApprovalGrant>();

function isExpired(grant: ApprovalGrant): boolean {
  return Boolean(grant.expiresAt && new Date(grant.expiresAt) < new Date());
}

export function storeApproval(
  id: string,
  toolName: string,
  args: Record<string, unknown>,
  expiresAt?: string,
): ApprovalGrant {
  const canonicalHash = hashCanonicalCall(args);
  const grant: ApprovalGrant = {
    id,
    toolName,
    canonicalHash,
    arguments: args,
    status: 'pending',
    requestedAt: new Date().toISOString(),
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
  if (isExpired(grant)) {
    return { valid: false, grant, reason: 'Approval expired' };
  }
  if (grant.status === 'pending') {
    return { valid: false, grant, reason: 'Approval pending' };
  }
  if (grant.status === 'rejected') {
    return { valid: false, grant, reason: 'Approval rejected' };
  }
  const proposedHash = hashCanonicalCall(proposedArgs);
  if (grant.canonicalHash !== proposedHash) {
    return { valid: false, grant, reason: 'APPROVAL_HASH_MISMATCH' };
  }
  return { valid: true, grant };
}

export function approveApproval(id: string, approvedBy = 'human'): ApprovalGrant | undefined {
  const grant = grants.get(id);
  if (!grant || grant.used || grant.status === 'rejected' || isExpired(grant)) {
    return undefined;
  }

  grant.status = 'approved';
  grant.approvedBy = approvedBy;
  grant.approvedAt = new Date().toISOString();
  return grant;
}

export function rejectApproval(id: string, rejectedBy = 'human'): ApprovalGrant | undefined {
  const grant = grants.get(id);
  if (!grant || grant.used || grant.status === 'approved') {
    return undefined;
  }

  grant.status = 'rejected';
  grant.rejectedBy = rejectedBy;
  grant.rejectedAt = new Date().toISOString();
  return grant;
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
  return [...grants.values()].filter((g) => !g.used && g.status === 'pending');
}
