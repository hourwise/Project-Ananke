import { hashCanonicalCall } from '@ananke/authority-engine';
import {
  ContentAccessRequest,
  ContentSurfaceObservation,
  type ContentAccessDecision,
  type ContentAccessReasonCode,
  type ContentApprovalBinding,
  type ContentExposureLevel,
  type ContentSurfaceObservation as ContentSurfaceObservationType,
  type ContentAccessRequest as ContentAccessRequestType,
} from '@ananke/schema';

export interface ContentPolicyConfig {
  /**
   * Bound into every escalation request. Change it when policy semantics
   * change so prior approvals cannot be silently reused.
   */
  policyVersion?: string;
  /**
   * Full text exposure is never allowed by default. This explicit opt-in is
   * limited to clean, owned, text content.
   */
  allowFullContentForOwnedText?: boolean;
}

const EXPOSURE_ORDER: Record<ContentExposureLevel, number> = {
  NONE: 0,
  DERIVED_ONLY: 1,
  SANITIZED_METADATA: 2,
  SELECTED_CONTENT: 3,
  FULL_CONTENT: 4,
};

function isAtMost(
  requested: ContentExposureLevel,
  maximum: ContentExposureLevel,
): boolean {
  return EXPOSURE_ORDER[requested] <= EXPOSURE_ORDER[maximum];
}

function isOwnedText(observation: ContentSurfaceObservationType): boolean {
  return observation.source.trust === 'OWNED'
    && observation.source.mediaType.toLowerCase().startsWith('text/');
}

function hasFlag(
  observation: ContentSurfaceObservationType,
  ...flags: ContentSurfaceObservationType['flags'][number][]
): boolean {
  return flags.some((flag) => observation.flags.includes(flag));
}

/**
 * Policy-only implementation of the Phase 2 preflight boundary. It accepts
 * scanner evidence but never scans content, and it never emits raw content.
 */
export class ContentPolicyEngine {
  private readonly config: Required<ContentPolicyConfig>;

  constructor(config: ContentPolicyConfig = {}) {
    this.config = {
      policyVersion: config.policyVersion ?? 'content-policy-v1',
      allowFullContentForOwnedText: config.allowFullContentForOwnedText ?? false,
    };
  }

  evaluate(
    rawObservation: ContentSurfaceObservationType,
    rawRequest: ContentAccessRequestType,
  ): ContentAccessDecision {
    const observation = ContentSurfaceObservation.parse(rawObservation);
    const request = ContentAccessRequest.parse(rawRequest);
    const binding = this.createBinding(observation, request);

    if (observation.scanStatus === 'FAILED') {
      return this.decision('DENY', 'CONTENT_SCAN_FAILED', request, 'NONE', binding);
    }
    if (observation.scanStatus === 'UNSUPPORTED') {
      return this.decision('DENY', 'CONTENT_UNSUPPORTED', request, 'NONE', binding);
    }

    if (hasFlag(observation, 'ARCHIVE_BOMB', 'OVERSIZED_PAYLOAD')) {
      return this.decision('QUARANTINE', 'CONTENT_RESOURCE_LIMIT', request, 'NONE', binding);
    }
    if (hasFlag(observation, 'EMBEDDED_SCRIPT', 'MACRO_PRESENT')) {
      return this.decision('DENY', 'CONTENT_SCRIPT_PRESENT', request, 'NONE', binding);
    }
    if (hasFlag(observation, 'SECRET_LIKE_CONTENT')) {
      return this.downgradeToDerived(request, binding, 'CONTENT_SECRET_EXPOSURE');
    }
    if (hasFlag(observation, 'INSTRUCTION_LIKE_CONTENT')) {
      return this.decision(
        'REQUIRE_APPROVAL',
        'CONTENT_RISK_FLAGGED',
        request,
        'SANITIZED_METADATA',
        binding,
      );
    }
    if (hasFlag(observation, 'TYPE_MISMATCH')) {
      return this.decision(
        'REQUIRE_APPROVAL',
        'CONTENT_TYPE_MISMATCH',
        request,
        'SANITIZED_METADATA',
        binding,
      );
    }

    return this.cleanContentDecision(observation, request, binding);
  }

  private cleanContentDecision(
    observation: ContentSurfaceObservationType,
    request: ContentAccessRequestType,
    binding: ContentApprovalBinding,
  ): ContentAccessDecision {
    if (isAtMost(request.requestedExposure, 'SANITIZED_METADATA')) {
      return this.decision(
        'ALLOW',
        'CONTENT_ACCESS_ALLOWED',
        request,
        request.requestedExposure,
        binding,
      );
    }

    if (request.requestedExposure === 'SELECTED_CONTENT' && isOwnedText(observation)) {
      return this.decision(
        'ALLOW',
        'CONTENT_ACCESS_ALLOWED',
        request,
        'SELECTED_CONTENT',
        binding,
      );
    }

    if (
      request.requestedExposure === 'FULL_CONTENT'
      && isOwnedText(observation)
      && this.config.allowFullContentForOwnedText
    ) {
      return this.decision(
        'ALLOW',
        'CONTENT_ACCESS_ALLOWED',
        request,
        'FULL_CONTENT',
        binding,
      );
    }

    return this.decision(
      'REQUIRE_APPROVAL',
      'CONTENT_APPROVAL_REQUIRED',
      request,
      isOwnedText(observation) ? 'SELECTED_CONTENT' : 'SANITIZED_METADATA',
      binding,
    );
  }

  private downgradeToDerived(
    request: ContentAccessRequestType,
    binding: ContentApprovalBinding,
    reasonCode: Extract<ContentAccessReasonCode, 'CONTENT_SECRET_EXPOSURE'>,
  ): ContentAccessDecision {
    if (isAtMost(request.requestedExposure, 'DERIVED_ONLY')) {
      return this.decision(
        'ALLOW',
        request.requestedExposure === 'DERIVED_ONLY' ? reasonCode : 'CONTENT_ACCESS_ALLOWED',
        request,
        request.requestedExposure,
        binding,
      );
    }
    return this.decision(
      'ALLOW',
      'CONTENT_EXPOSURE_DOWNGRADED',
      request,
      'DERIVED_ONLY',
      binding,
    );
  }

  private createBinding(
    observation: ContentSurfaceObservationType,
    request: ContentAccessRequestType,
  ): ContentApprovalBinding {
    const material = {
      contentHash: observation.contentHash,
      observationId: observation.observationId,
      requestedExposure: request.requestedExposure,
      destination: request.destination,
      purpose: request.purpose,
      policyVersion: this.config.policyVersion,
      selection: request.selection,
    };
    return {
      ...material,
      bindingHash: hashCanonicalCall(material),
    };
  }

  private decision(
    action: ContentAccessDecision['action'],
    reasonCode: ContentAccessReasonCode,
    request: ContentAccessRequestType,
    grantedExposure: ContentExposureLevel,
    binding: ContentApprovalBinding,
  ): ContentAccessDecision {
    return {
      action,
      reasonCode,
      requestedExposure: request.requestedExposure,
      grantedExposure,
      requiresApproval: action === 'REQUIRE_APPROVAL',
      binding,
    };
  }
}
