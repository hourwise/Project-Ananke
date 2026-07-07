/**
 * Scenarios barrel — aggregates all must-pass test scenarios
 * from domain-specific subdirectories.
 */
import type { TestScenario } from '../runner.js';
export declare const MUST_PASS_SCENARIOS: TestScenario[];
export { default as safeReadAllowed } from './read-only/safe-read-allowed.js';
export { default as policyDeniedNoRetry } from './read-only/policy-denied-no-retry.js';
export { default as externalSendRequiresApproval } from './write-actions/external-send-requires-approval.js';
export { default as approvalHashMatch } from './approval-binding/approval-hash-match.js';
export { default as approvalHashMismatch } from './approval-binding/approval-hash-mismatch.js';
export { default as timeoutTypedOutcome } from './timeouts/timeout-typed-outcome.js';
export { default as promptInjectionFlagged } from './prompt-injection/prompt-injection-flagged.js';
//# sourceMappingURL=index.d.ts.map