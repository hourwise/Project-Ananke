import type { Outcome, FailureReasonCode } from '@ananke/schema';
import type { ExecutionResult } from './execution-wrapper.js';

/**
 * Outcome Classifier — converts raw tool results into structured outcomes.
 *
 * Never returns a raw failure to the agent. Every result is wrapped.
 */
export function classifyOutcome(
  result: ExecutionResult,
  policyDecision?: string,
): Outcome {
  if (policyDecision === 'DENY') {
    return {
      state: 'DENIED',
      reasonCode: 'POLICY_DENIED',
      retryable: false,
      requiresUser: true,
      safeToContinue: false,
      nextAction: 'Action denied by policy. Do not retry.',
    };
  }

  if (result.success) {
    return {
      state: 'COMPLETED',
      retryable: false,
      requiresUser: false,
      safeToContinue: true,
      data: result.data,
    };
  }

  const code: FailureReasonCode = result.errorCode ?? 'UNKNOWN_FAILURE';

  // Special state for approval hash mismatch
  if (code === 'APPROVAL_HASH_MISMATCH') {
    return {
      state: 'APPROVAL_INVALIDATED',
      reasonCode: 'APPROVAL_HASH_MISMATCH',
      retryable: false,
      requiresUser: true,
      safeToContinue: false,
      nextAction: 'Approval was granted for different content. Re-request approval.',
    };
  }

  const recoveryMap: Record<FailureReasonCode, Pick<Outcome, 'retryable' | 'requiresUser' | 'nextAction'>> = {
    DOWNSTREAM_TIMEOUT: {
      retryable: true,
      requiresUser: false,
      nextAction: 'Retry once, then report downstream unavailable.',
    },
    RATE_LIMITED: {
      retryable: true,
      requiresUser: false,
      nextAction: 'Wait and retry with exponential backoff.',
    },
    AUTH_EXPIRED: {
      retryable: true,
      requiresUser: true,
      nextAction: 'Re-authenticate and retry.',
    },
    STALE_STATE: {
      retryable: true,
      requiresUser: false,
      nextAction: 'Reload the resource and retry once with the latest version.',
    },
    CONFLICT: {
      retryable: false,
      requiresUser: true,
      nextAction: 'Resolve conflict manually or with user input.',
    },
    VALIDATION_ERROR: {
      retryable: false,
      requiresUser: true,
      nextAction: 'Fix the arguments and retry.',
    },
    PERMISSION_DENIED: {
      retryable: false,
      requiresUser: true,
      nextAction: 'Request permission or escalate.',
    },
    POLICY_DENIED: {
      retryable: false,
      requiresUser: true,
      nextAction: 'Action denied by policy. Do not retry.',
    },
    RESOURCE_VERSION_CHANGED: {
      retryable: true,
      requiresUser: false,
      nextAction: 'Reload resource and retry.',
    },
    PARTIAL_SUCCESS: {
      retryable: true,
      requiresUser: true,
      nextAction: 'Some operations succeeded. Review partial results.',
    },
    UNKNOWN_FAILURE: {
      retryable: false,
      requiresUser: true,
      nextAction: 'Unexpected failure. Check logs and report.',
    },
  };

  const recovery = recoveryMap[code];

  return {
    state: 'FAILED',
    reasonCode: code,
    retryable: recovery.retryable,
    requiresUser: recovery.requiresUser,
    safeToContinue: code !== 'POLICY_DENIED',
    nextAction: recovery.nextAction,
    error: result.error,
  };
}
