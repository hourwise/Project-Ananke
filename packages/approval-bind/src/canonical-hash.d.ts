/**
 * Canonical JSON serialization:
 * - Sorts all object keys alphabetically.
 * - No whitespace beyond what JSON.stringify produces.
 * - Deterministic output for the same logical object.
 */
export declare function canonicalJson(value: unknown): string;
/**
 * Produces a SHA-256 hash of the canonical JSON representation.
 */
export declare function hashCanonicalCall(args: Record<string, unknown>): string;
/**
 * Verifies that two sets of arguments produce the same canonical hash.
 */
export declare function verifyApprovalBinding(approvedArgs: Record<string, unknown>, proposedArgs: Record<string, unknown>): boolean;
//# sourceMappingURL=canonical-hash.d.ts.map