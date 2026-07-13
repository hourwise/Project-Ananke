import { z } from 'zod';

// ── Risk Classes ──────────────────────────────────────────────

export const RiskClass = z.enum([
  'READ_ONLY',
  'INTERNAL_WRITE',
  'EXTERNAL_SEND',
  'DELETE',
  'PAYMENT',
  'DEPLOYMENT',
  'PERMISSION_CHANGE',
  'CREDENTIAL_ACCESS',
  'NETWORK_EGRESS',
  'SKILL_INSTALL',
  'MODEL_PROVIDER_CHANGE',
  'UNKNOWN',
]);

export type RiskClass = z.infer<typeof RiskClass>;

// ── Policy Decision ───────────────────────────────────────────

export const PolicyDecision = z.enum([
  'ALLOW',
  'DENY',
  'REQUIRE_APPROVAL',
  'REQUIRE_REFRESH',
  'REQUIRE_NARROWER_SCOPE',
  'REQUIRE_HUMAN_CLARIFICATION',
]);

export type PolicyDecision = z.infer<typeof PolicyDecision>;

// ── Outcome State ─────────────────────────────────────────────

export const OutcomeState = z.enum([
  'COMPLETED',
  'FAILED',
  'DENIED',
  'WAITING_FOR_APPROVAL',
  'STALE_STATE',
  'APPROVAL_INVALIDATED',
  'TIMED_OUT',
  'PARTIAL_SUCCESS',
]);

export type OutcomeState = z.infer<typeof OutcomeState>;

// ── Failure Reason Codes ──────────────────────────────────────

export const FailureReasonCode = z.enum([
  'VALIDATION_ERROR',
  'AUTH_EXPIRED',
  'PERMISSION_DENIED',
  'DOWNSTREAM_TIMEOUT',
  'RATE_LIMITED',
  'STALE_STATE',
  'CONFLICT',
  'PARTIAL_SUCCESS',
  'POLICY_DENIED',
  'APPROVAL_REQUIRED',
  'APPROVAL_HASH_MISMATCH',
  'RESOURCE_VERSION_CHANGED',
  'CONTENT_PREFLIGHT_REQUIRED',
  'CONTENT_SCAN_FAILED',
  'CONTENT_UNSUPPORTED',
  'CONTENT_RESOURCE_LIMIT',
  'CONTENT_RISK_FLAGGED',
  'CONTENT_SECRET_EXPOSURE',
  'CONTENT_SCRIPT_PRESENT',
  'CONTENT_TYPE_MISMATCH',
  'CONTENT_APPROVAL_REQUIRED',
  'CONTENT_APPROVAL_REJECTED',
  'CONTENT_APPROVAL_INVALIDATED',
  'CONTENT_RECEIPT_STALE',
  'CONTENT_EXPOSURE_DOWNGRADED',
  'CONTENT_QUARANTINED',
  'UNKNOWN_FAILURE',
]);

export type FailureReasonCode = z.infer<typeof FailureReasonCode>;

// ── Tool Metadata ─────────────────────────────────────────────

export const ToolMetadata = z.object({
  name: z.string(),
  server: z.string(),
  description: z.string().optional(),
  inputSchema: z.record(z.unknown()).optional(),
  riskClass: RiskClass,
  requiredPermissions: z.array(z.string()).default([]),
  sideEffectType: z.string().optional(),
  retryable: z.boolean().default(false),
  requiresApproval: z.boolean().default(false),
});

export type ToolMetadata = z.infer<typeof ToolMetadata>;

// ── Outcome Envelope ──────────────────────────────────────────

export const Outcome = z.object({
  state: OutcomeState,
  reasonCode: FailureReasonCode.optional(),
  retryable: z.boolean().default(false),
  requiresUser: z.boolean().default(false),
  safeToContinue: z.boolean().default(true),
  nextAction: z.string().optional(),
  data: z.unknown().optional(),
  error: z.string().optional(),
});

export type Outcome = z.infer<typeof Outcome>;

export const OperatorRole = z.enum(['viewer', 'approver', 'auditor', 'admin']);

export type OperatorRole = z.infer<typeof OperatorRole>;

// Operator identity captured from authenticated dashboard/API context.
export const OperatorIdentity = z.object({
  operatorId: z.string(),
  displayName: z.string().optional(),
  sessionId: z.string(),
  authMethod: z.enum(['dev-token', 'oidc-jwt']),
  roles: z.array(OperatorRole).min(1),
  authenticatedAt: z.string(),
});

export type OperatorIdentity = z.infer<typeof OperatorIdentity>;

// Authenticated workload identity attached to every execution request.
export const ExecutionIdentity = z.object({
  agentPrincipalId: z.string(),
  tenantId: z.string(),
  resourceScope: z.string(),
  sessionId: z.string(),
  authMethod: z.enum(['dev-token', 'workload-token']),
  authenticatedAt: z.string(),
});

export type ExecutionIdentity = z.infer<typeof ExecutionIdentity>;

// Complete non-human side of an approval binding. The policy version is
// assigned by the gateway, never trusted from request input.
export const ExecutionContext = z.object({
  agentPrincipalId: z.string(),
  tenantId: z.string(),
  resourceScope: z.string(),
  sessionId: z.string(),
  policyVersion: z.string(),
});

export type ExecutionContext = z.infer<typeof ExecutionContext>;

// ── Approval Grant ────────────────────────────────────────────

export const ApprovalGrant = z.object({
  id: z.string(),
  serverName: z.string(),
  toolName: z.string(),
  actionHash: z.string(),
  bindingHash: z.string().optional(),
  arguments: z.record(z.unknown()),
  executionContext: ExecutionContext,
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
  requestedAt: z.string(),
  approvedBy: z.string().optional(),
  approvedBySessionId: z.string().optional(),
  approvedAt: z.string().optional(),
  rejectedBy: z.string().optional(),
  rejectedBySessionId: z.string().optional(),
  rejectedAt: z.string().optional(),
  expiresAt: z.string(),
  used: z.boolean().default(false),
});

export type ApprovalGrant = z.infer<typeof ApprovalGrant>;

// ── Audit Event ───────────────────────────────────────────────

export const AuditEventType = z.enum([
  'OPERATOR_SESSION_STARTED',
  'OPERATOR_SESSION_ROTATED',
  'OPERATOR_SESSION_REVOKED',
  'CONTENT_PREFLIGHTED',
  'CONTENT_ACCESS_DECIDED',
  'CONTENT_APPROVAL_REQUESTED',
  'CONTENT_APPROVAL_GRANTED',
  'CONTENT_APPROVAL_DENIED',
  'CONTENT_APPROVAL_INVALIDATED',
  'TOOL_CALL_REQUESTED',
  'POLICY_CHECKED',
  'APPROVAL_REQUESTED',
  'APPROVAL_GRANTED',
  'APPROVAL_DENIED',
  'APPROVAL_INVALIDATED',
  'TOOL_EXECUTED',
  'TOOL_FAILED',
  'OUTCOME_GENERATED',
]);

export type AuditEventType = z.infer<typeof AuditEventType>;

export const AuditEvent = z.object({
  id: z.string(),
  timestamp: z.string(),
  eventType: AuditEventType,
  toolName: z.string(),
  serverName: z.string().optional(),
  arguments: z.record(z.unknown()).optional(),
  policyDecision: PolicyDecision.optional(),
  approvalHash: z.string().optional(),
  outcome: Outcome.optional(),
  durationMs: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type AuditEvent = z.infer<typeof AuditEvent>;

// ── Policy Config ─────────────────────────────────────────────

export const ToolPolicy = z.object({
  risk: RiskClass,
  approval: z.enum(['never', 'required', 'conditional']),
  condition: z.string().optional(),
  maxRetries: z.number().default(1),
});

export type ToolPolicy = z.infer<typeof ToolPolicy>;

export const PolicyConfig = z.record(z.string(), ToolPolicy);

export type PolicyConfig = z.infer<typeof PolicyConfig>;

// ── Content Preflight ──────────────────────────────────────────────────────

/**
 * The maximum content surface a caller may receive. These describe exposure,
 * not the safety of the action used to obtain the content.
 */
export const ContentExposureLevel = z.enum([
  'NONE',
  'DERIVED_ONLY',
  'SANITIZED_METADATA',
  'SELECTED_CONTENT',
  'FULL_CONTENT',
]);

export type ContentExposureLevel = z.infer<typeof ContentExposureLevel>;

export const ContentSourceTrust = z.enum(['OWNED', 'INTERNAL', 'EXTERNAL', 'UNKNOWN']);

export type ContentSourceTrust = z.infer<typeof ContentSourceTrust>;

export const ContentScanStatus = z.enum(['COMPLETE', 'FAILED', 'UNSUPPORTED']);

export type ContentScanStatus = z.infer<typeof ContentScanStatus>;

/**
 * Scanner findings are evidence for policy; scanner output never grants
 * authority by itself.
 */
export const ContentRiskFlag = z.enum([
  'INSTRUCTION_LIKE_CONTENT',
  'SECRET_LIKE_CONTENT',
  'EMBEDDED_SCRIPT',
  'MACRO_PRESENT',
  'ARCHIVE_BOMB',
  'TYPE_MISMATCH',
  'EXTERNAL_REFERENCE',
  'OVERSIZED_PAYLOAD',
]);

export type ContentRiskFlag = z.infer<typeof ContentRiskFlag>;

export const ContentSurfaceObservation = z.object({
  observationId: z.string().min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
  source: z.object({
    sourceId: z.string().min(1),
    trust: ContentSourceTrust,
    mediaType: z.string().min(1),
    byteLength: z.number().int().nonnegative(),
  }),
  scanner: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
  }),
  scanStatus: ContentScanStatus,
  flags: z.array(ContentRiskFlag).default([]),
  observedAt: z.string().min(1),
});

export type ContentSurfaceObservation = z.infer<typeof ContentSurfaceObservation>;

export const ContentSelection = z
  .object({
    fields: z.array(z.string().min(1)).min(1).optional(),
    ranges: z
      .array(
        z
          .object({
            start: z.number().int().nonnegative(),
            end: z.number().int().positive(),
          })
          .refine((range) => range.end > range.start, {
            message: 'selection range end must be greater than start',
          }),
      )
      .min(1)
      .optional(),
  })
  .refine((selection) => Boolean(selection.fields?.length || selection.ranges?.length), {
    message: 'selection must include fields or ranges',
  });

export type ContentSelection = z.infer<typeof ContentSelection>;

export const ContentAccessRequest = z
  .object({
    requestedExposure: ContentExposureLevel,
    destination: z.object({
      runtime: z.string().min(1),
      agentId: z.string().min(1).optional(),
    }),
    purpose: z.string().min(1),
    selection: ContentSelection.optional(),
  })
  .superRefine((request, context) => {
    if (request.requestedExposure === 'SELECTED_CONTENT' && !request.selection) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['selection'],
        message: 'selected content requires an explicit selection',
      });
    }
  });

export type ContentAccessRequest = z.infer<typeof ContentAccessRequest>;

export const ContentAccessAction = z.enum(['ALLOW', 'REQUIRE_APPROVAL', 'DENY', 'QUARANTINE']);

export type ContentAccessAction = z.infer<typeof ContentAccessAction>;

export const ContentAccessReasonCode = z.enum([
  'CONTENT_ACCESS_ALLOWED',
  'CONTENT_PREFLIGHT_REQUIRED',
  'CONTENT_SCAN_FAILED',
  'CONTENT_UNSUPPORTED',
  'CONTENT_RESOURCE_LIMIT',
  'CONTENT_RISK_FLAGGED',
  'CONTENT_SECRET_EXPOSURE',
  'CONTENT_SCRIPT_PRESENT',
  'CONTENT_TYPE_MISMATCH',
  'CONTENT_APPROVAL_REQUIRED',
  'CONTENT_APPROVAL_REJECTED',
  'CONTENT_APPROVAL_INVALIDATED',
  'CONTENT_RECEIPT_STALE',
  'CONTENT_EXPOSURE_DOWNGRADED',
  'CONTENT_QUARANTINED',
]);

export type ContentAccessReasonCode = z.infer<typeof ContentAccessReasonCode>;

/**
 * Material that must be re-bound when an operator approves elevated content
 * exposure. It deliberately contains references and hashes, never raw content.
 */
export const ContentApprovalBinding = z.object({
  bindingHash: z.string().regex(/^[a-f0-9]{64}$/i),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
  observationId: z.string().min(1),
  requestedExposure: ContentExposureLevel,
  destination: z.object({
    runtime: z.string().min(1),
    agentId: z.string().min(1).optional(),
  }),
  purpose: z.string().min(1),
  policyVersion: z.string().min(1),
  selection: ContentSelection.optional(),
});

export type ContentApprovalBinding = z.infer<typeof ContentApprovalBinding>;

export const ContentApprovalReceipt = z.object({
  id: z.string(),
  toolName: z.string().min(1),
  binding: ContentApprovalBinding,
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
  requestedAt: z.string(),
  approvedBy: z.string().optional(),
  approvedBySessionId: z.string().optional(),
  approvedAt: z.string().optional(),
  rejectedBy: z.string().optional(),
  rejectedBySessionId: z.string().optional(),
  rejectedAt: z.string().optional(),
  expiresAt: z.string(),
  used: z.boolean().default(false),
});

export type ContentApprovalReceipt = z.infer<typeof ContentApprovalReceipt>;

export const ContentAccessDecision = z.object({
  action: ContentAccessAction,
  reasonCode: ContentAccessReasonCode,
  requestedExposure: ContentExposureLevel,
  grantedExposure: ContentExposureLevel,
  requiresApproval: z.boolean(),
  binding: ContentApprovalBinding,
});

export type ContentAccessDecision = z.infer<typeof ContentAccessDecision>;
