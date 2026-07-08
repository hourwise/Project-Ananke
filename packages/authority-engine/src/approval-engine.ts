import {
  storeApproval,
  validateApproval,
  consumeApproval,
  listPendingApprovals,
  approveApproval,
  rejectApproval,
  getApproval,
  clearApprovals,
} from './approval-store.js';
import type { ApprovalGrant, OperatorIdentity } from '@ananke/schema';

/**
 * Approval Engine — manages the human approval queue and verification.
 */
export class ApprovalEngine {
  /**
   * Request approval for a tool call. Returns the grant with its ID.
   */
  requestApproval(
    toolName: string,
    args: Record<string, unknown>,
  ): { grant: ApprovalGrant; requiresApproval: true } {
    const id = crypto.randomUUID();
    const grant = storeApproval(id, toolName, args);
    return { grant, requiresApproval: true };
  }

  /**
   * Check whether a tool call has valid approval.
   * Returns valid:true only if the exact same arguments were previously approved.
   */
  checkApproval(
    approvalId: string,
    proposedArgs: Record<string, unknown>,
  ): { valid: boolean; reason?: string } {
    return validateApproval(approvalId, proposedArgs);
  }

  approve(approvalId: string, operator: OperatorIdentity): ApprovalGrant | undefined {
    return approveApproval(approvalId, operator);
  }

  reject(approvalId: string, operator: OperatorIdentity): ApprovalGrant | undefined {
    return rejectApproval(approvalId, operator);
  }

  get(approvalId: string): ApprovalGrant | undefined {
    return getApproval(approvalId);
  }

  /**
   * Mark an approval as consumed after a successful execution.
   */
  consume(approvalId: string): void {
    consumeApproval(approvalId);
  }

  /**
   * List all approvals that are still pending (not yet consumed).
   */
  pending(): ApprovalGrant[] {
    return listPendingApprovals();
  }

  clear(): void {
    clearApprovals();
  }
}
