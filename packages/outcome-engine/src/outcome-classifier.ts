import type { Outcome, FailureReasonCode } from '@ananke/schema';
import type { ExecutionResult } from '@ananke/tool-router';

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
    APPROVAL_REQUIRED: {
      retryable: true,
      requiresUser: true,
      nextAction: 'Waiting for human approval. Retry with approvalId.',
    },
    APPROVAL_HASH_MISMATCH: {
      retryable: false,
      requiresUser: true,
      nextAction: 'Approval was granted for different content. Re-request approval.',
    },
    RESOURCE_VERSION_CHANGED: {
      retryable: true,
      requiresUser: false,
      nextAction: 'Reload resource and retry.',
    },
    CONTENT_PREFLIGHT_REQUIRED: {
      retryable: false,
      requiresUser: true,
      nextAction: 'Configure content preflight before releasing this tool result.',
    },
    CONTENT_SCAN_FAILED: {
      retryable: false,
      requiresUser: true,
      nextAction: 'Inspect the scanner failure and re-run preflight before releasing content.',
    },
    CONTENT_UNSUPPORTED: {
      retryable: false,
      requiresUser: true,
      nextAction: 'Use a scanner that supports this content type before releasing content.',
    },
    CONTENT_RESOURCE_LIMIT: {
      retryable: false,
      requiresUser: true,
      nextAction: 'Keep the content quarantined and inspect it in an isolated workflow.',
    },
    CONTENT_RISK_FLAGGED: {
      retryable: false,
      requiresUser: true,
      nextAction: 'Review the content risk finding before requesting a narrower exposure.',
    },
    CONTENT_SECRET_EXPOSURE: {
      retryable: false,
      requiresUser: true,
      nextAction: 'Do not release the detected secret; use derived metadata only.',
    },
    CONTENT_SCRIPT_PRESENT: {
      retryable: false,
      requiresUser: true,
      nextAction: 'Do not release executable content without an isolated review workflow.',
    },
    CONTENT_TYPE_MISMATCH: {
      retryable: false,
      requiresUser: true,
      nextAction: 'Verify the content type before requesting exposure.',
    },
    CONTENT_APPROVAL_REQUIRED: {
      retryable: false,
      requiresUser: true,
      nextAction: 'Content approval is required before elevated exposure can be released.',
    },
    CONTENT_APPROVAL_REJECTED: {
      retryable: false,
      requiresUser: true,
      nextAction: 'Content approval was rejected. Request a new scope only if it materially changes.',
    },
    CONTENT_APPROVAL_INVALIDATED: {
      retryable: false,
      requiresUser: true,
      nextAction: 'Content changed after approval. Request a new content approval.',
    },
    CONTENT_RECEIPT_STALE: {
      retryable: true,
      requiresUser: false,
      nextAction: 'Re-scan the source and request a fresh content decision.',
    },
    CONTENT_EXPOSURE_DOWNGRADED: {
      retryable: false,
      requiresUser: false,
      nextAction: 'Continue only with the granted lower exposure level.',
    },
    CONTENT_QUARANTINED: {
      retryable: false,
      requiresUser: true,
      nextAction: 'Keep the content quarantined and inspect it in an isolated workflow.',
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
