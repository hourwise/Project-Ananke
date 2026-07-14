# Gateway Contract

This document describes the current repository contract for governed execution through the gateway. It is intentionally narrower than the broader project vision: it records what the code, accepted ADRs, and tests support today.

## Scope

The contract covered here is:

`proposal -> canonicalisation -> policy classification -> approval requirement -> approval presentation -> binding -> execution -> outcome -> audit`

This contract applies only to requests routed through `Gateway.execute(...)` or the HTTP execution API. It does not govern direct tool access, agent-local shell access, or credentials exposed outside the gateway boundary.

## Contract Stages

| Stage | Owner | Input | Output | Current invariant | Identifiers | Invalidation or failure | Retryability |
|---|---|---|---|---|---|---|---|
| Proposal | Integrator or agent client | authenticated execution context, `toolName`, `arguments`, optional `approvalId` | `Gateway.execute(...)` call or `POST /api/execute` payload | HTTP identity comes from the workload credential; embedding requires an explicit trusted context | `toolName`, optional `approvalId`, agent/tenant/scope/session/policy context | Missing execution identity returns `401` over HTTP or `PERMISSION_DENIED` when embedded | Client-controlled |
| Tool request audit | Gateway + audit engine | `toolName`, `arguments` | sanitized `TOOL_CALL_REQUESTED` audit event | Raw argument values never cross the common audit sanitizer | audit `id`, `timestamp`, `toolName`, argument field count | Audit backend failure behaviour is not separately modeled in the public outcome contract | N/A |
| Risk classification | Runtime core + registry classifier | `toolName` | `RiskClass` | Current classification is by registered tool identity; unknown tools become `UNKNOWN` | `toolName`, `riskClass` | Missing registration yields `UNKNOWN` and then default `DENY` | Client may retry, but outcome is typically final unless registry or policy changes |
| Policy classification | Policy engine | `toolName`, `riskClass` | `PolicyDecision` | Policy is re-evaluated on every execution attempt | `toolName`, `riskClass`, `policyDecision` | Current public decisions include `ALLOW`, `DENY`, and `REQUIRE_APPROVAL`; config `maxRetries` is parsed but not enforced here | Depends on resulting decision |
| Approval requirement | Runtime core + authority engine | server/tool, arguments, execution context, optional `approvalId` | Either `WAITING_FOR_APPROVAL` or an approval validation result | A new grant includes a bounded expiry and complete action binding | `ApprovalGrant.id`, `actionHash`, `expiresAt` | Rejected policy is handled before approval logic and yields `DENIED` with `POLICY_DENIED` | Retryable by resubmitting with the returned `approvalGrantId` |
| Canonicalisation | Authority engine | complete action binding | canonical JSON string and SHA-256 `actionHash` | Canonicalisation accepts only strict JSON-shaped payloads and sorts object keys recursively | canonical payload, `actionHash` | Unsupported runtime values throw before approval binding can be established | Client must normalize inputs before retrying |
| Approval presentation | Approval API or dashboard | stored grant + registry metadata | approval review payload | The approval API exposes arguments for human review plus `canonicalPayload`, `actionHash`, `riskClass`, and status | `approvalId`, `actionHash`, operator identity, `riskClass` | Approval endpoints require authenticated operator context with `approvals:read` or `approvals:decide` | Operator can approve or reject; client can poll by re-executing |
| Approval decision | Operator + authority engine + audit engine | `approvalId`, authenticated operator context | updated approval grant | Approver identity is derived from authentication, not request-body fields | `approvedBy`, `approvedBySessionId`, `rejectedBy`, `rejectedBySessionId` | Missing or unauthorized operator requests return `401` or `403`; non-approvable grants return `404` from the API | Client can retry execution only after approval is granted |
| Approval binding check | Authority engine inside execute path | `approvalId`, proposed action and execution context | `{ valid, reason }` | Validation rechecks server, tool, canonical arguments, agent, tenant, resource scope, session, policy version, expiry, and authenticated human binding | `approvalId`, `actionHash`, `bindingHash`, grant status | A changed bound field returns `APPROVAL_INVALIDATED` | Pending approvals are retryable; mismatches require a new grant |
| Execution | Tool router + executor | `toolName`, `arguments` | `ExecutionResult` | The gateway executes only after policy and any approval check pass | `toolName`, executor registration | Missing executor yields `FAILED` with `UNKNOWN_FAILURE`; downstream errors are classified heuristically | Depends on outcome `retryable` guidance and downstream semantics |
| Outcome | Outcome engine | `ExecutionResult` or policy decision | `Outcome` envelope | Agents receive structured outcomes, not raw errors | `state`, `reasonCode`, `retryable`, `requiresUser`, `safeToContinue`, `nextAction` | Current runtime actively emits `COMPLETED`, `FAILED`, `DENIED`, `WAITING_FOR_APPROVAL`, and `APPROVAL_INVALIDATED`; other schema states are documented but not exercised the same way | Outcome-specific |
| Post-execution approval consumption | Authority engine | valid `approvalId` after an execution attempt | grant marked `used` | Current gateway consumes the approval after the execution attempt returns, not only after successful side effects | `approvalId`, `used` | A used grant becomes invalid for future approval checks | Retrying after consumption requires a new approval flow if policy still requires approval |
| Audit after execution | Audit engine | decision, approval event, execution result, or outcome | audit events | Current event coverage depends on the path taken | audit `eventType`, `id`, `timestamp` | Some paths record `OUTCOME_GENERATED`; `WAITING_FOR_APPROVAL` returns currently do not emit that audit event | Queryable through the authenticated audit API |

## Stage-by-Stage Notes

### 1. Proposal

- Ananke does not own intent formation. It owns assessment and routing once a tool call is proposed.
- The gateway contract starts at `execute(toolName, args, { approvalId? })` or `POST /api/execute`.

### 2. Policy Classification

- Risk classification comes from registered `ToolMetadata.riskClass`.
- Current policy evaluation is deterministic by tool name and risk class.
- `conditional` approval currently behaves as `REQUIRE_APPROVAL`.
- `maxRetries` is loaded from policy files but is not enforced by the runtime path described here.

### 3. Approval Creation and Presentation

- A new approval grant is created only when policy returns `REQUIRE_APPROVAL` and the request does not include an `approvalId`.
- The returned identifier is `approvalGrantId`, which is the public handle the client uses on later retries.
- Operator review surfaces both readable arguments and canonical binding material.

### 4. Approval Binding

Current code establishes and rechecks these binding fields at enforcement time:

- approval grant existence;
- approval grant `used` state;
- required approval expiry;
- approval grant status (`pending`, `approved`, `rejected`);
- server and tool identity;
- SHA-256 equality over canonicalized arguments;
- agent principal, tenant, resource scope, agent session, and policy version;
- authenticated human principal and human session through `bindingHash`.

### 5. Execution and Outcome

- `DENY` policy decisions return `DENIED` with `reasonCode: "POLICY_DENIED"`.
- Approval-required requests without approval return `WAITING_FOR_APPROVAL` with `reasonCode: "APPROVAL_REQUIRED"`.
- Rejected approvals return `DENIED` with `reasonCode: "POLICY_DENIED"` in the current execute path.
- Approval mismatches return `APPROVAL_INVALIDATED` with `reasonCode: "APPROVAL_HASH_MISMATCH"`.
- Downstream failures are classified by message heuristics in `@ananke/tool-router`.

## Current Audit Contract

Observed audit event patterns in the current runtime:

- Allowed execution path: `TOOL_CALL_REQUESTED -> POLICY_CHECKED -> TOOL_EXECUTED|TOOL_FAILED -> OUTCOME_GENERATED`
- First approval-required request: `TOOL_CALL_REQUESTED -> POLICY_CHECKED -> APPROVAL_REQUESTED`
- Approval granted through operator API: `APPROVAL_GRANTED`
- Approval rejected through operator API: `APPROVAL_DENIED`
- Retry after operator rejection: `TOOL_CALL_REQUESTED -> POLICY_CHECKED -> APPROVAL_DENIED -> OUTCOME_GENERATED`
- Retry after invalid approval: `TOOL_CALL_REQUESTED -> POLICY_CHECKED -> APPROVAL_INVALIDATED -> OUTCOME_GENERATED`

Important current limitations:

- `WAITING_FOR_APPROVAL` outcomes are returned to the client, but the gateway does not currently record `OUTCOME_GENERATED` for those return paths.
- Raw arguments, outcome payloads, error text, and sensitive metadata are removed before either audit backend.

## Documentation Conflicts And Open Questions

- The public schema defines `STALE_STATE`, `TIMED_OUT`, and `PARTIAL_SUCCESS` as outcome states, but the current classifier and tests primarily use `FAILED` plus reason codes for those cases.
- Policy is re-evaluated on every execution attempt and approvals are bound to the configured policy version.
- The runtime currently consumes approvals after any execution attempt with a valid `approvalId`, including failed attempts. Whether that is the intended long-term contract should be treated as open until explicitly decided.

## Evidence

- [packages/runtime-core/src/index.ts](../../packages/runtime-core/src/index.ts)
- [packages/runtime-core/src/routes.ts](../../packages/runtime-core/src/routes.ts)
- [packages/runtime-core/src/gateway.test.ts](../../packages/runtime-core/src/gateway.test.ts)
- [packages/schema/src/index.ts](../../packages/schema/src/index.ts)
- [packages/policy-engine/src/policy-engine.ts](../../packages/policy-engine/src/policy-engine.ts)
- [packages/authority-engine/src/approval-store.ts](../../packages/authority-engine/src/approval-store.ts)
- [packages/authority-engine/src/canonical-hash.ts](../../packages/authority-engine/src/canonical-hash.ts)
- [packages/outcome-engine/src/outcome-classifier.ts](../../packages/outcome-engine/src/outcome-classifier.ts)
- [packages/tool-router/src/execution-wrapper.ts](../../packages/tool-router/src/execution-wrapper.ts)
- [packages/audit-engine/src/audit-log-interface.ts](../../packages/audit-engine/src/audit-log-interface.ts)
- [docs/APPROVAL_BINDING.md](../APPROVAL_BINDING.md)
- [docs/HTTP_API.md](../HTTP_API.md)
- [docs/ADR-0029-CHOKEPOINT-ENFORCEMENT.md](../ADR-0029-CHOKEPOINT-ENFORCEMENT.md)
- [docs/ADR-0031-APPROVAL-UI-SECURITY.md](../ADR-0031-APPROVAL-UI-SECURITY.md)
- [docs/ADR-0032-CANONICAL-PAYLOAD-HASHING.md](../ADR-0032-CANONICAL-PAYLOAD-HASHING.md)
- [docs/ADR-XXXX-dual-principal-mcp-delegation-and-compatibility.md](../ADR-XXXX-dual-principal-mcp-delegation-and-compatibility.md)
