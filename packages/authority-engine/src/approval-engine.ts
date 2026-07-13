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
import type { ApprovalGrant, ExecutionContext, OperatorIdentity } from '@ananke/schema';

/**
 * Approval Engine — manages the human approval queue and verification.
 */
export class ApprovalEngine {
  /**
   * Request approval for a tool call. Returns the grant with its ID.
   */
  requestApproval(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
    executionContext: ExecutionContext,
    expiresAt: string,
  ): { grant: ApprovalGrant; requiresApproval: true } {
    const id = crypto.randomUUID();
    const grant = storeApproval(id, serverName, toolName, args, executionContext, expiresAt);
    return { grant, requiresApproval: true };
  }

  /**
   * Check whether a tool call has valid approval.
   * Returns valid:true only if the exact same arguments were previously approved.
   */
  checkApproval(
    approvalId: string,
    serverName: string,
    toolName: string,
    proposedArgs: Record<string, unknown>,
    executionContext: ExecutionContext,
  ): { valid: boolean; reason?: string } {
    return validateApproval(approvalId, {
      serverName,
      toolName,
      arguments: proposedArgs,
      executionContext,
    });
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
