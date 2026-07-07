import { createHash } from 'node:crypto';
/**
 * Canonical JSON serialization:
 * - Sorts all object keys alphabetically.
 * - No whitespace beyond what JSON.stringify produces.
 * - Deterministic output for the same logical object.
 */
export function canonicalJson(value) {
    return JSON.stringify(value, sortedKeysReplacer);
}
function sortedKeysReplacer(_key, value) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        return Object.keys(value)
            .sort()
            .reduce((acc, k) => {
            acc[k] = value[k];
            return acc;
        }, {});
    }
    return value;
}
/**
 * Produces a SHA-256 hash of the canonical JSON representation.
 */
export function hashCanonicalCall(args) {
    const canonical = canonicalJson(args);
    return createHash('sha256').update(canonical).digest('hex');
}
/**
 * Verifies that two sets of arguments produce the same canonical hash.
 */
export function verifyApprovalBinding(approvedArgs, proposedArgs) {
    return hashCanonicalCall(approvedArgs) === hashCanonicalCall(proposedArgs);
}
//# sourceMappingURL=canonical-hash.js.map