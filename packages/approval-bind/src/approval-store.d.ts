import type { ApprovalGrant } from '@ananke/schema';
export declare function storeApproval(id: string, toolName: string, args: Record<string, unknown>, approvedBy?: string, expiresAt?: string): ApprovalGrant;
export declare function getApproval(id: string): ApprovalGrant | undefined;
export declare function validateApproval(id: string, proposedArgs: Record<string, unknown>): {
    valid: boolean;
    grant?: ApprovalGrant;
    reason?: string;
};
export declare function consumeApproval(id: string): void;
export declare function clearApprovals(): void;
export declare function listPendingApprovals(): ApprovalGrant[];
//# sourceMappingURL=approval-store.d.ts.map