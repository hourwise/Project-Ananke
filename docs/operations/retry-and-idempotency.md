# Retry And Idempotency

This document separates what the current repository actually guarantees from what an integrator still needs to supply. It does not assume downstream tools are idempotent unless the tool itself or the surrounding system proves that property.

## Current Contract

What Ananke currently owns:

- returning a typed outcome with `retryable`, `requiresUser`, and `nextAction`;
- deciding whether policy blocks the action, requires approval, or allows execution;
- creating, approving, rejecting, validating, expiring, and consuming approval grants;
- preventing reuse of an approval grant after it has been marked `used`.

What Ananke does not currently guarantee:

- downstream tool idempotency;
- exactly-once execution across network retries, process restarts, or duplicate submissions;
- cancellation of an in-flight external action;
- a stable request ID or idempotency key for the execute API;
- append-only audit durability by itself.

## Retry Ownership

| Situation | Current owner of the next step | Safe behaviour now | Not guaranteed |
|---|---|---|---|
| Policy `DENY` | Agent or integrator | Stop and reformulate instead of retrying blindly | Future policy changes or narrower scope are outside the current call contract |
| Approval pending | Agent plus operator | Re-submit the exact same call with `approvalGrantId` after approval | Poll cadence, expiry basis, and user-facing queue rules |
| Approval rejected | Agent or operator | Treat as final for that grant | Automatic conversion into a new approval request |
| Approval invalidated | Agent or operator | Request fresh approval for the intended arguments | Reuse of the old approval context |
| Downstream timeout | Integrator plus tool owner | Retry only if the operation is known to be safe to repeat | Whether the timed-out downstream tool actually performed the side effect |
| Auth expired | Operator, operator platform, or external auth flow | Re-authenticate and retry | Session refresh UX outside current prototype auth flow |
| Stale state or resource-version change | Agent or integrator | Refresh state first, then rebuild the operation | Automatic refresh-and-merge logic |
| Permission denied or conflict | Operator or domain owner | Escalate or resolve explicitly | Automatic privilege escalation or conflict resolution |

## Approval Reuse And Replay Protection

Current approval lifecycle rules evidenced in code:

- A first approval-required attempt without `approvalId` creates a new grant and returns `WAITING_FOR_APPROVAL`.
- A pending grant can be referenced again; the gateway returns another `WAITING_FOR_APPROVAL`.
- A rejected grant cannot be used for execution.
- A grant marked `used` cannot be reused.
- A grant with `expiresAt` in the past is invalid.
- A valid approved grant is consumed after the execution attempt returns.

Important current limitations:

- The gateway consumes the grant after an execution attempt even if the downstream result is `FAILED`.
- The normal request flow does not define when `expiresAt` should be set.
- Several invalid-grant reasons, including used, expired, missing, and mismatched grants, currently collapse into the generic `APPROVAL_INVALIDATED` path with `reasonCode: "APPROVAL_HASH_MISMATCH"`.
- Approval validation checks the canonical argument hash, but does not currently re-check `toolName`.

## Idempotency Boundaries

Current idempotency boundary by layer:

| Layer | Current behaviour |
|---|---|
| Gateway execute API | No explicit request idempotency key or deduplication token |
| Approval engine | Single-use grant after an execution attempt with a valid `approvalId` |
| Policy engine | Re-evaluated on every attempt; no stored retry ledger |
| Tool router | Simply invokes the executor and classifies thrown errors |
| Downstream tool | Entirely tool-specific |

Safe interpretation:

- Ananke helps prevent approval replay after a completed approval path.
- Ananke does not guarantee exactly-once side effects.
- Integrators should treat external sends, payments, deployments, deletes, and network egress as potentially non-idempotent unless the downstream system provides its own deduplication key.

## Timeouts, Duplicates, And Unknown Side Effects

`DOWNSTREAM_TIMEOUT` is marked retryable by the current classifier, but that does not prove the downstream tool performed no side effect.

Safe operator and agent guidance:

- retry only when the underlying action is read-only or independently idempotent;
- for external sends, payments, deletes, deployments, or permission changes, check downstream state before retrying;
- assume a valid approval may already have been consumed by the timed-out attempt.

## Partial Success

The public schema includes `PARTIAL_SUCCESS` as both a state and a reason code, but the normal gateway path does not currently demonstrate a dedicated partial-success state.

Safe guidance until that is resolved:

- do not automatically retry the entire action after a partial result;
- inspect downstream state and audit evidence first;
- rebuild a narrower follow-up action instead of replaying the original whole request.

## Refresh Semantics

Current stale-data semantics are reason-code-driven:

- `STALE_STATE` and `RESOURCE_VERSION_CHANGED` both instruct the caller to reload current state before retrying.
- Phase 1 approval grants are not version-bound to a resource snapshot.

Open consequence:

- if a stale-state failure occurs after approval was consumed, a corrected retry may need both refreshed data and a new approval.

## Cancellation

Current repository evidence does not define:

- cancellation of an in-flight tool execution;
- operator-initiated revocation of a single already-approved but not yet executed call;
- rollback semantics for external side effects after timeout or partial completion.

Do not infer those capabilities from the presence of typed outcomes alone.

## Operator Intervention

Operator involvement is clearly required for:

- `WAITING_FOR_APPROVAL`;
- approval rejection or re-approval after invalidation;
- `AUTH_EXPIRED`, `PERMISSION_DENIED`, `CONFLICT`, and many `VALIDATION_ERROR` paths;
- any ambiguous timeout or partial-success case involving real side effects.

## Open Questions

- Should approval grants be consumed only after `COMPLETED`, or after any execution attempt as they are today?
- Should the execute API add an idempotency key or operation identifier for duplicate-suppression?
- Should approval validation bind `toolName` and policy version in addition to the canonical argument hash?
- Should `maxRetries` remain metadata-only, or become an enforced runtime limit?
- How should the runtime represent used, expired, or missing approvals without collapsing them into `APPROVAL_HASH_MISMATCH`?

## Evidence

- [packages/runtime-core/src/index.ts](../../packages/runtime-core/src/index.ts)
- [packages/runtime-core/src/gateway.test.ts](../../packages/runtime-core/src/gateway.test.ts)
- [packages/authority-engine/src/approval-store.ts](../../packages/authority-engine/src/approval-store.ts)
- [packages/outcome-engine/src/outcome-classifier.ts](../../packages/outcome-engine/src/outcome-classifier.ts)
- [packages/policy-engine/src/policy-engine.ts](../../packages/policy-engine/src/policy-engine.ts)
- [docs/POLICY_CONFIGURATION.md](../POLICY_CONFIGURATION.md)
- [docs/OUTCOME_ENVELOPE.md](../OUTCOME_ENVELOPE.md)
