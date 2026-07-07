import { storeApproval, validateApproval, consumeApproval, listPendingApprovals, } from '@ananke/approval-bind';
/**
 * Approval Engine — manages the human approval queue and verification.
 */
export class ApprovalEngine {
    /**
     * Request approval for a tool call. Returns the grant with its ID.
     */
    requestApproval(toolName, args) {
        const id = crypto.randomUUID();
        const grant = storeApproval(id, toolName, args);
        return { grant, requiresApproval: true };
    }
    /**
     * Check whether a tool call has valid approval.
     * Returns valid:true only if the exact same arguments were previously approved.
     */
    checkApproval(approvalId, proposedArgs) {
        return validateApproval(approvalId, proposedArgs);
    }
    /**
     * Mark an approval as consumed after a successful execution.
     */
    consume(approvalId) {
        consumeApproval(approvalId);
    }
    /**
     * List all approvals that are still pending (not yet consumed).
     */
    pending() {
        return listPendingApprovals();
    }
}
//# sourceMappingURL=approval-engine.js.map