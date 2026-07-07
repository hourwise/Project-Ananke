import type { Outcome } from '@ananke/schema';
import type { ExecutionResult } from './execution-wrapper.js';
/**
 * Outcome Classifier — converts raw tool results into structured outcomes.
 *
 * Never returns a raw failure to the agent. Every result is wrapped.
 */
export declare function classifyOutcome(result: ExecutionResult, policyDecision?: string): Outcome;
//# sourceMappingURL=outcome-classifier.d.ts.map