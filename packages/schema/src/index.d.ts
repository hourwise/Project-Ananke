import { z } from 'zod';
export declare const RiskClass: z.ZodEnum<["READ_ONLY", "INTERNAL_WRITE", "EXTERNAL_SEND", "DELETE", "PAYMENT", "DEPLOYMENT", "PERMISSION_CHANGE", "UNKNOWN"]>;
export type RiskClass = z.infer<typeof RiskClass>;
export declare const PolicyDecision: z.ZodEnum<["ALLOW", "DENY", "REQUIRE_APPROVAL", "REQUIRE_REFRESH", "REQUIRE_NARROWER_SCOPE", "REQUIRE_HUMAN_CLARIFICATION"]>;
export type PolicyDecision = z.infer<typeof PolicyDecision>;
export declare const OutcomeState: z.ZodEnum<["COMPLETED", "FAILED", "DENIED", "WAITING_FOR_APPROVAL", "STALE_STATE", "APPROVAL_INVALIDATED", "TIMED_OUT", "PARTIAL_SUCCESS"]>;
export type OutcomeState = z.infer<typeof OutcomeState>;
export declare const FailureReasonCode: z.ZodEnum<["VALIDATION_ERROR", "AUTH_EXPIRED", "PERMISSION_DENIED", "DOWNSTREAM_TIMEOUT", "RATE_LIMITED", "STALE_STATE", "CONFLICT", "PARTIAL_SUCCESS", "POLICY_DENIED", "APPROVAL_REQUIRED", "APPROVAL_HASH_MISMATCH", "RESOURCE_VERSION_CHANGED", "UNKNOWN_FAILURE"]>;
export type FailureReasonCode = z.infer<typeof FailureReasonCode>;
export declare const ToolMetadata: z.ZodObject<{
    name: z.ZodString;
    server: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    inputSchema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    riskClass: z.ZodEnum<["READ_ONLY", "INTERNAL_WRITE", "EXTERNAL_SEND", "DELETE", "PAYMENT", "DEPLOYMENT", "PERMISSION_CHANGE", "UNKNOWN"]>;
    requiredPermissions: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    sideEffectType: z.ZodOptional<z.ZodString>;
    retryable: z.ZodDefault<z.ZodBoolean>;
    requiresApproval: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name: string;
    server: string;
    riskClass: "READ_ONLY" | "INTERNAL_WRITE" | "EXTERNAL_SEND" | "DELETE" | "PAYMENT" | "DEPLOYMENT" | "PERMISSION_CHANGE" | "UNKNOWN";
    requiredPermissions: string[];
    retryable: boolean;
    requiresApproval: boolean;
    description?: string | undefined;
    inputSchema?: Record<string, unknown> | undefined;
    sideEffectType?: string | undefined;
}, {
    name: string;
    server: string;
    riskClass: "READ_ONLY" | "INTERNAL_WRITE" | "EXTERNAL_SEND" | "DELETE" | "PAYMENT" | "DEPLOYMENT" | "PERMISSION_CHANGE" | "UNKNOWN";
    description?: string | undefined;
    inputSchema?: Record<string, unknown> | undefined;
    requiredPermissions?: string[] | undefined;
    sideEffectType?: string | undefined;
    retryable?: boolean | undefined;
    requiresApproval?: boolean | undefined;
}>;
export type ToolMetadata = z.infer<typeof ToolMetadata>;
export declare const Outcome: z.ZodObject<{
    state: z.ZodEnum<["COMPLETED", "FAILED", "DENIED", "WAITING_FOR_APPROVAL", "STALE_STATE", "APPROVAL_INVALIDATED", "TIMED_OUT", "PARTIAL_SUCCESS"]>;
    reasonCode: z.ZodOptional<z.ZodEnum<["VALIDATION_ERROR", "AUTH_EXPIRED", "PERMISSION_DENIED", "DOWNSTREAM_TIMEOUT", "RATE_LIMITED", "STALE_STATE", "CONFLICT", "PARTIAL_SUCCESS", "POLICY_DENIED", "APPROVAL_REQUIRED", "APPROVAL_HASH_MISMATCH", "RESOURCE_VERSION_CHANGED", "UNKNOWN_FAILURE"]>>;
    retryable: z.ZodDefault<z.ZodBoolean>;
    requiresUser: z.ZodDefault<z.ZodBoolean>;
    safeToContinue: z.ZodDefault<z.ZodBoolean>;
    nextAction: z.ZodOptional<z.ZodString>;
    data: z.ZodOptional<z.ZodUnknown>;
    error: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    retryable: boolean;
    state: "COMPLETED" | "FAILED" | "DENIED" | "WAITING_FOR_APPROVAL" | "STALE_STATE" | "APPROVAL_INVALIDATED" | "TIMED_OUT" | "PARTIAL_SUCCESS";
    requiresUser: boolean;
    safeToContinue: boolean;
    reasonCode?: "STALE_STATE" | "PARTIAL_SUCCESS" | "VALIDATION_ERROR" | "AUTH_EXPIRED" | "PERMISSION_DENIED" | "DOWNSTREAM_TIMEOUT" | "RATE_LIMITED" | "CONFLICT" | "POLICY_DENIED" | "APPROVAL_REQUIRED" | "APPROVAL_HASH_MISMATCH" | "RESOURCE_VERSION_CHANGED" | "UNKNOWN_FAILURE" | undefined;
    nextAction?: string | undefined;
    data?: unknown;
    error?: string | undefined;
}, {
    state: "COMPLETED" | "FAILED" | "DENIED" | "WAITING_FOR_APPROVAL" | "STALE_STATE" | "APPROVAL_INVALIDATED" | "TIMED_OUT" | "PARTIAL_SUCCESS";
    retryable?: boolean | undefined;
    reasonCode?: "STALE_STATE" | "PARTIAL_SUCCESS" | "VALIDATION_ERROR" | "AUTH_EXPIRED" | "PERMISSION_DENIED" | "DOWNSTREAM_TIMEOUT" | "RATE_LIMITED" | "CONFLICT" | "POLICY_DENIED" | "APPROVAL_REQUIRED" | "APPROVAL_HASH_MISMATCH" | "RESOURCE_VERSION_CHANGED" | "UNKNOWN_FAILURE" | undefined;
    requiresUser?: boolean | undefined;
    safeToContinue?: boolean | undefined;
    nextAction?: string | undefined;
    data?: unknown;
    error?: string | undefined;
}>;
export type Outcome = z.infer<typeof Outcome>;
export declare const ApprovalGrant: z.ZodObject<{
    id: z.ZodString;
    toolName: z.ZodString;
    canonicalHash: z.ZodString;
    arguments: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    approvedBy: z.ZodDefault<z.ZodString>;
    approvedAt: z.ZodString;
    expiresAt: z.ZodOptional<z.ZodString>;
    used: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    id: string;
    toolName: string;
    canonicalHash: string;
    arguments: Record<string, unknown>;
    approvedBy: string;
    approvedAt: string;
    used: boolean;
    expiresAt?: string | undefined;
}, {
    id: string;
    toolName: string;
    canonicalHash: string;
    arguments: Record<string, unknown>;
    approvedAt: string;
    approvedBy?: string | undefined;
    expiresAt?: string | undefined;
    used?: boolean | undefined;
}>;
export type ApprovalGrant = z.infer<typeof ApprovalGrant>;
export declare const AuditEventType: z.ZodEnum<["TOOL_CALL_REQUESTED", "POLICY_CHECKED", "APPROVAL_REQUESTED", "APPROVAL_GRANTED", "APPROVAL_DENIED", "APPROVAL_INVALIDATED", "TOOL_EXECUTED", "TOOL_FAILED", "OUTCOME_GENERATED"]>;
export type AuditEventType = z.infer<typeof AuditEventType>;
export declare const AuditEvent: z.ZodObject<{
    id: z.ZodString;
    timestamp: z.ZodString;
    eventType: z.ZodEnum<["TOOL_CALL_REQUESTED", "POLICY_CHECKED", "APPROVAL_REQUESTED", "APPROVAL_GRANTED", "APPROVAL_DENIED", "APPROVAL_INVALIDATED", "TOOL_EXECUTED", "TOOL_FAILED", "OUTCOME_GENERATED"]>;
    toolName: z.ZodString;
    serverName: z.ZodOptional<z.ZodString>;
    arguments: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    policyDecision: z.ZodOptional<z.ZodEnum<["ALLOW", "DENY", "REQUIRE_APPROVAL", "REQUIRE_REFRESH", "REQUIRE_NARROWER_SCOPE", "REQUIRE_HUMAN_CLARIFICATION"]>>;
    approvalHash: z.ZodOptional<z.ZodString>;
    outcome: z.ZodOptional<z.ZodObject<{
        state: z.ZodEnum<["COMPLETED", "FAILED", "DENIED", "WAITING_FOR_APPROVAL", "STALE_STATE", "APPROVAL_INVALIDATED", "TIMED_OUT", "PARTIAL_SUCCESS"]>;
        reasonCode: z.ZodOptional<z.ZodEnum<["VALIDATION_ERROR", "AUTH_EXPIRED", "PERMISSION_DENIED", "DOWNSTREAM_TIMEOUT", "RATE_LIMITED", "STALE_STATE", "CONFLICT", "PARTIAL_SUCCESS", "POLICY_DENIED", "APPROVAL_REQUIRED", "APPROVAL_HASH_MISMATCH", "RESOURCE_VERSION_CHANGED", "UNKNOWN_FAILURE"]>>;
        retryable: z.ZodDefault<z.ZodBoolean>;
        requiresUser: z.ZodDefault<z.ZodBoolean>;
        safeToContinue: z.ZodDefault<z.ZodBoolean>;
        nextAction: z.ZodOptional<z.ZodString>;
        data: z.ZodOptional<z.ZodUnknown>;
        error: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        retryable: boolean;
        state: "COMPLETED" | "FAILED" | "DENIED" | "WAITING_FOR_APPROVAL" | "STALE_STATE" | "APPROVAL_INVALIDATED" | "TIMED_OUT" | "PARTIAL_SUCCESS";
        requiresUser: boolean;
        safeToContinue: boolean;
        reasonCode?: "STALE_STATE" | "PARTIAL_SUCCESS" | "VALIDATION_ERROR" | "AUTH_EXPIRED" | "PERMISSION_DENIED" | "DOWNSTREAM_TIMEOUT" | "RATE_LIMITED" | "CONFLICT" | "POLICY_DENIED" | "APPROVAL_REQUIRED" | "APPROVAL_HASH_MISMATCH" | "RESOURCE_VERSION_CHANGED" | "UNKNOWN_FAILURE" | undefined;
        nextAction?: string | undefined;
        data?: unknown;
        error?: string | undefined;
    }, {
        state: "COMPLETED" | "FAILED" | "DENIED" | "WAITING_FOR_APPROVAL" | "STALE_STATE" | "APPROVAL_INVALIDATED" | "TIMED_OUT" | "PARTIAL_SUCCESS";
        retryable?: boolean | undefined;
        reasonCode?: "STALE_STATE" | "PARTIAL_SUCCESS" | "VALIDATION_ERROR" | "AUTH_EXPIRED" | "PERMISSION_DENIED" | "DOWNSTREAM_TIMEOUT" | "RATE_LIMITED" | "CONFLICT" | "POLICY_DENIED" | "APPROVAL_REQUIRED" | "APPROVAL_HASH_MISMATCH" | "RESOURCE_VERSION_CHANGED" | "UNKNOWN_FAILURE" | undefined;
        requiresUser?: boolean | undefined;
        safeToContinue?: boolean | undefined;
        nextAction?: string | undefined;
        data?: unknown;
        error?: string | undefined;
    }>>;
    durationMs: z.ZodOptional<z.ZodNumber>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    toolName: string;
    timestamp: string;
    eventType: "APPROVAL_INVALIDATED" | "TOOL_CALL_REQUESTED" | "POLICY_CHECKED" | "APPROVAL_REQUESTED" | "APPROVAL_GRANTED" | "APPROVAL_DENIED" | "TOOL_EXECUTED" | "TOOL_FAILED" | "OUTCOME_GENERATED";
    arguments?: Record<string, unknown> | undefined;
    serverName?: string | undefined;
    policyDecision?: "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | "REQUIRE_REFRESH" | "REQUIRE_NARROWER_SCOPE" | "REQUIRE_HUMAN_CLARIFICATION" | undefined;
    approvalHash?: string | undefined;
    outcome?: {
        retryable: boolean;
        state: "COMPLETED" | "FAILED" | "DENIED" | "WAITING_FOR_APPROVAL" | "STALE_STATE" | "APPROVAL_INVALIDATED" | "TIMED_OUT" | "PARTIAL_SUCCESS";
        requiresUser: boolean;
        safeToContinue: boolean;
        reasonCode?: "STALE_STATE" | "PARTIAL_SUCCESS" | "VALIDATION_ERROR" | "AUTH_EXPIRED" | "PERMISSION_DENIED" | "DOWNSTREAM_TIMEOUT" | "RATE_LIMITED" | "CONFLICT" | "POLICY_DENIED" | "APPROVAL_REQUIRED" | "APPROVAL_HASH_MISMATCH" | "RESOURCE_VERSION_CHANGED" | "UNKNOWN_FAILURE" | undefined;
        nextAction?: string | undefined;
        data?: unknown;
        error?: string | undefined;
    } | undefined;
    durationMs?: number | undefined;
    metadata?: Record<string, unknown> | undefined;
}, {
    id: string;
    toolName: string;
    timestamp: string;
    eventType: "APPROVAL_INVALIDATED" | "TOOL_CALL_REQUESTED" | "POLICY_CHECKED" | "APPROVAL_REQUESTED" | "APPROVAL_GRANTED" | "APPROVAL_DENIED" | "TOOL_EXECUTED" | "TOOL_FAILED" | "OUTCOME_GENERATED";
    arguments?: Record<string, unknown> | undefined;
    serverName?: string | undefined;
    policyDecision?: "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | "REQUIRE_REFRESH" | "REQUIRE_NARROWER_SCOPE" | "REQUIRE_HUMAN_CLARIFICATION" | undefined;
    approvalHash?: string | undefined;
    outcome?: {
        state: "COMPLETED" | "FAILED" | "DENIED" | "WAITING_FOR_APPROVAL" | "STALE_STATE" | "APPROVAL_INVALIDATED" | "TIMED_OUT" | "PARTIAL_SUCCESS";
        retryable?: boolean | undefined;
        reasonCode?: "STALE_STATE" | "PARTIAL_SUCCESS" | "VALIDATION_ERROR" | "AUTH_EXPIRED" | "PERMISSION_DENIED" | "DOWNSTREAM_TIMEOUT" | "RATE_LIMITED" | "CONFLICT" | "POLICY_DENIED" | "APPROVAL_REQUIRED" | "APPROVAL_HASH_MISMATCH" | "RESOURCE_VERSION_CHANGED" | "UNKNOWN_FAILURE" | undefined;
        requiresUser?: boolean | undefined;
        safeToContinue?: boolean | undefined;
        nextAction?: string | undefined;
        data?: unknown;
        error?: string | undefined;
    } | undefined;
    durationMs?: number | undefined;
    metadata?: Record<string, unknown> | undefined;
}>;
export type AuditEvent = z.infer<typeof AuditEvent>;
export declare const ToolPolicy: z.ZodObject<{
    risk: z.ZodEnum<["READ_ONLY", "INTERNAL_WRITE", "EXTERNAL_SEND", "DELETE", "PAYMENT", "DEPLOYMENT", "PERMISSION_CHANGE", "UNKNOWN"]>;
    approval: z.ZodEnum<["never", "required", "conditional"]>;
    condition: z.ZodOptional<z.ZodString>;
    maxRetries: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    risk: "READ_ONLY" | "INTERNAL_WRITE" | "EXTERNAL_SEND" | "DELETE" | "PAYMENT" | "DEPLOYMENT" | "PERMISSION_CHANGE" | "UNKNOWN";
    approval: "never" | "required" | "conditional";
    maxRetries: number;
    condition?: string | undefined;
}, {
    risk: "READ_ONLY" | "INTERNAL_WRITE" | "EXTERNAL_SEND" | "DELETE" | "PAYMENT" | "DEPLOYMENT" | "PERMISSION_CHANGE" | "UNKNOWN";
    approval: "never" | "required" | "conditional";
    condition?: string | undefined;
    maxRetries?: number | undefined;
}>;
export type ToolPolicy = z.infer<typeof ToolPolicy>;
export declare const PolicyConfig: z.ZodRecord<z.ZodString, z.ZodObject<{
    risk: z.ZodEnum<["READ_ONLY", "INTERNAL_WRITE", "EXTERNAL_SEND", "DELETE", "PAYMENT", "DEPLOYMENT", "PERMISSION_CHANGE", "UNKNOWN"]>;
    approval: z.ZodEnum<["never", "required", "conditional"]>;
    condition: z.ZodOptional<z.ZodString>;
    maxRetries: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    risk: "READ_ONLY" | "INTERNAL_WRITE" | "EXTERNAL_SEND" | "DELETE" | "PAYMENT" | "DEPLOYMENT" | "PERMISSION_CHANGE" | "UNKNOWN";
    approval: "never" | "required" | "conditional";
    maxRetries: number;
    condition?: string | undefined;
}, {
    risk: "READ_ONLY" | "INTERNAL_WRITE" | "EXTERNAL_SEND" | "DELETE" | "PAYMENT" | "DEPLOYMENT" | "PERMISSION_CHANGE" | "UNKNOWN";
    approval: "never" | "required" | "conditional";
    condition?: string | undefined;
    maxRetries?: number | undefined;
}>>;
export type PolicyConfig = z.infer<typeof PolicyConfig>;
//# sourceMappingURL=index.d.ts.map