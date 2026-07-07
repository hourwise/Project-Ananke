import type { ApprovalGrant } from '@ananke/schema';
/**
 * Approval Engine — manages the human approval queue and verification.
 */
export declare class ApprovalEngine {
    /**
     * Request approval for a tool call. Returns the grant with its ID.
     */
    requestApproval(toolName: string, args: Record<string, unknown>): {
        grant: ApprovalGrant;
        requiresApproval: true;
    };
    /**
     * Check whether a tool call has valid approval.
     * Returns valid:true only if the exact same arguments were previously approved.
     */
    checkApproval(approvalId: string, proposedArgs: Record<string, unknown>): {
        valid: boolean;
        reason?: string;
    };
    /**
     * Mark an approval as consumed after a successful execution.
     */
    consume(approvalId: string): void;
    /**
     * List all approvals that are still pending (not yet consumed).
     */
    pending(): ApprovalGrant[];
}
//# sourceMappingURL=approval-engine.d.ts.map