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
// ── Policy Decision ───────────────────────────────────────────
export const PolicyDecision = z.enum([
    'ALLOW',
    'DENY',
    'REQUIRE_APPROVAL',
    'REQUIRE_REFRESH',
    'REQUIRE_NARROWER_SCOPE',
    'REQUIRE_HUMAN_CLARIFICATION',
]);
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
// ── Approval Grant ────────────────────────────────────────────
export const ApprovalGrant = z.object({
    id: z.string(),
    toolName: z.string(),
    canonicalHash: z.string(),
    arguments: z.record(z.unknown()),
    approvedBy: z.string().default('human'),
    approvedAt: z.string(),
    expiresAt: z.string().optional(),
    used: z.boolean().default(false),
});
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
// ── Policy Config ─────────────────────────────────────────────
export const ToolPolicy = z.object({
    risk: RiskClass,
    approval: z.enum(['never', 'required', 'conditional']),
    condition: z.string().optional(),
    maxRetries: z.number().default(1),
});
export const PolicyConfig = z.record(z.string(), ToolPolicy);
//# sourceMappingURL=index.js.map