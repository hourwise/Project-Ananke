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

// Operator identity captured from authenticated dashboard/API context.
export const OperatorIdentity = z.object({
  operatorId: z.string(),
  displayName: z.string().optional(),
  sessionId: z.string(),
  authMethod: z.enum(['dev-token', 'basic']),
  authenticatedAt: z.string(),
});

export type OperatorIdentity = z.infer<typeof OperatorIdentity>;

// ── Approval Grant ────────────────────────────────────────────

export const ApprovalGrant = z.object({
  id: z.string(),
  toolName: z.string(),
  canonicalHash: z.string(),
  arguments: z.record(z.unknown()),
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
  requestedAt: z.string(),
  approvedBy: z.string().optional(),
  approvedBySessionId: z.string().optional(),
  approvedAt: z.string().optional(),
  rejectedBy: z.string().optional(),
  rejectedBySessionId: z.string().optional(),
  rejectedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  used: z.boolean().default(false),
});

export type ApprovalGrant = z.infer<typeof ApprovalGrant>;

// ── Audit Event ───────────────────────────────────────────────

export const AuditEventType = z.enum([
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
