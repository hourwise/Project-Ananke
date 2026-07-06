import { createHash } from 'node:crypto';

/**
 * Canonical JSON serialization:
 * - Sorts all object keys alphabetically.
 * - No whitespace beyond what JSON.stringify produces.
 * - Deterministic output for the same logical object.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, sortedKeysReplacer);
}

function sortedKeysReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = (value as Record<string, unknown>)[k];
        return acc;
      }, {});
  }
  return value;
}

/**
 * Produces a SHA-256 hash of the canonical JSON representation.
 */
export function hashCanonicalCall(args: Record<string, unknown>): string {
  const canonical = canonicalJson(args);
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Verifies that two sets of arguments produce the same canonical hash.
 */
export function verifyApprovalBinding(
  approvedArgs: Record<string, unknown>,
  proposedArgs: Record<string, unknown>,
): boolean {
  return hashCanonicalCall(approvedArgs) === hashCanonicalCall(proposedArgs);
}
