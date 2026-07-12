# Failure Recovery

This document explains what each public outcome state means, what the current gateway actually emits, and what an agent or operator should do next without overstating unsupported behaviour.

## Current Runtime Note

The public schema defines eight outcome states:

- `COMPLETED`
- `FAILED`
- `DENIED`
- `WAITING_FOR_APPROVAL`
- `STALE_STATE`
- `APPROVAL_INVALIDATED`
- `TIMED_OUT`
- `PARTIAL_SUCCESS`

Current runtime and test evidence actively exercise these states:

- `COMPLETED`
- `FAILED`
- `DENIED`
- `WAITING_FOR_APPROVAL`
- `APPROVAL_INVALIDATED`

The current classifier does not emit dedicated `STALE_STATE`, `TIMED_OUT`, or `PARTIAL_SUCCESS` states in the normal execution path. Instead, it returns `FAILED` with reason codes such as `STALE_STATE`, `DOWNSTREAM_TIMEOUT`, or `PARTIAL_SUCCESS`.

## Outcome Recovery Table

| State | Meaning in the public contract | Current gateway evidence | Safe next action | Retry and approval rule | Audit expectation |
|---|---|---|---|---|---|
| `COMPLETED` | Tool executed successfully | Emitted for successful reads and approved writes | Use `outcome.data` and continue | Do not retry automatically unless the business workflow intentionally wants another call | Current execute path records `TOOL_EXECUTED` and `OUTCOME_GENERATED` |
| `FAILED` | Execution error with typed recovery fields | Emitted for permission errors, timeouts, stale/version errors, validation-like failures, and unknown failures | Inspect `reasonCode`, `retryable`, `requiresUser`, and `nextAction` before acting | Retry only when `retryable` is `true`; if policy requires approval, current runtime consumes a valid approval after the attempt, so a later retry usually needs a new approval flow | Current execute path records `TOOL_FAILED` and `OUTCOME_GENERATED` |
| `DENIED` | Permanently blocked by policy, approval rejection, or content preflight | Emitted for policy `DENY`, current rejected-approval retry path, and opt-in content-preflight withholding | Stop and reformulate, narrow scope, or abandon | Do not retry the same governed action unless the policy context or request changes materially | Current deny path records `POLICY_CHECKED` and `OUTCOME_GENERATED`; content preflight also records `CONTENT_PREFLIGHTED` when an adapter ran and `CONTENT_ACCESS_DECIDED` |
| `WAITING_FOR_APPROVAL` | Human approval is required before execution may proceed | Emitted when policy requires approval and no approved grant is yet available, or when the same grant is still pending | Surface the request for operator review and keep the exact arguments stable | Retry with the returned `approvalGrantId` only after operator approval. Re-submitting unchanged arguments while still pending is safe and returns another waiting outcome | First request records `APPROVAL_REQUESTED`; current waiting paths do not emit `OUTCOME_GENERATED` |
| `APPROVAL_INVALIDATED` | Approved content no longer matches what is being executed | Emitted for argument hash mismatch and currently also used for some other invalid grant states in the gateway path | Discard the old approval context and start a new approval request if the action is still needed | Current next step is a fresh approval flow. Do not keep retrying the same `approvalId` | Current invalidation path records `APPROVAL_INVALIDATED` and `OUTCOME_GENERATED` |
| `STALE_STATE` | Resource version changed and a refresh is required | Public state exists in the schema, but the current classifier returns `FAILED` with `reasonCode: "STALE_STATE"` instead | Refresh the resource, re-read current state, and rebuild the intended write | Retry only after refresh. If approval was already consumed by a prior execution attempt, a later write retry may require new approval | If emitted as a future state, audit should still capture the final typed outcome; today it appears under `TOOL_FAILED` plus `OUTCOME_GENERATED` |
| `TIMED_OUT` | Downstream operation timed out | Public state exists in the schema, but the current classifier returns `FAILED` with `reasonCode: "DOWNSTREAM_TIMEOUT"` instead | Assume the downstream result may be unknown until proven otherwise | Retry with backoff only if the operation is known to be safe to repeat or independently idempotent. A consumed approval will not remain reusable in the current runtime | Today timeout failures appear as `TOOL_FAILED` plus `OUTCOME_GENERATED` |
| `PARTIAL_SUCCESS` | Some operations succeeded and some failed | Public state exists in the schema, but the current classifier does not currently emit it in the normal gateway path | Inspect what completed before taking any further action | Do not automatically retry the full action. Rebuild a narrower retry from observed side effects and current state | If emitted in the future, audit should preserve the partial result context; current code path does not demonstrate this state |

## `FAILED` Reason Codes

Current recovery behaviour for `FAILED` depends on `reasonCode`:

| Reason code | Current recovery guidance | Retryable | Requires user |
|---|---|---|---|
| `DOWNSTREAM_TIMEOUT` | Retry once, then report downstream unavailable | Yes | No |
| `RATE_LIMITED` | Wait and retry with exponential backoff | Yes | No |
| `AUTH_EXPIRED` | Re-authenticate and retry | Yes | Yes |
| `STALE_STATE` | Reload the resource and retry once with the latest version | Yes | No |
| `CONFLICT` | Resolve conflict manually or with user input | No | Yes |
| `VALIDATION_ERROR` | Fix the arguments and retry | No | Yes |
| `PERMISSION_DENIED` | Request permission or escalate | No | Yes |
| `RESOURCE_VERSION_CHANGED` | Reload resource and retry | Yes | No |
| `PARTIAL_SUCCESS` | Review partial results | Yes | Yes |
| `UNKNOWN_FAILURE` | Check logs and report | No | Yes |

The classifier also contains guidance for `POLICY_DENIED`, `APPROVAL_REQUIRED`, and `APPROVAL_HASH_MISMATCH`, but those are surfaced today through `DENIED`, `WAITING_FOR_APPROVAL`, or `APPROVAL_INVALIDATED` paths rather than a generic `FAILED` state.

## Content Preflight Recovery

With opt-in read-result preflight, `CONTENT_PREFLIGHT_REQUIRED`, `CONTENT_SCAN_FAILED`, and `CONTENT_UNSUPPORTED` withhold raw output and require a valid request plus adapter. `CONTENT_RISK_FLAGGED`, `CONTENT_SCRIPT_PRESENT`, `CONTENT_TYPE_MISMATCH`, and `CONTENT_RESOURCE_LIMIT` also withhold raw output. `CONTENT_EXPOSURE_DOWNGRADED` is safe to continue only with the lower surface included in `outcome.data`. `CONTENT_APPROVAL_REQUIRED` returns a one-time, hash-bound content approval receipt; re-submit only the same content access request with `contentApprovalId` after an authenticated operator approves it.

## Agent And Operator Guidance

Agent-side rules that are safe to rely on now:

- Stop on `DENIED`.
- Pause for operator action on `WAITING_FOR_APPROVAL`.
- Treat `APPROVAL_INVALIDATED` as a fresh approval problem, not a transport retry.
- On `FAILED`, follow `retryable`, `requiresUser`, and `nextAction`, but also account for downstream idempotency and approval consumption.

Operator-side rules that are safe to rely on now:

- Approve or reject the exact arguments shown by the approval API or dashboard.
- Do not assume a timed-out or partially failed external action had no side effects.
- Re-approval is usually required after an execution attempt if policy still requires approval, because the current gateway consumes a valid approval ID after the attempt returns.

## Documentation Conflict

There is a current documentation and behaviour mismatch around outcome states:

- [packages/schema/src/index.ts](../../packages/schema/src/index.ts) and [docs/OUTCOME_ENVELOPE.md](../OUTCOME_ENVELOPE.md) define `STALE_STATE`, `TIMED_OUT`, and `PARTIAL_SUCCESS` as explicit states.
- [packages/outcome-engine/src/outcome-classifier.ts](../../packages/outcome-engine/src/outcome-classifier.ts) currently returns `FAILED` for timeout, stale-state, and partial-success reason codes.
- [packages/testbench/src/scenarios/timeouts/timeout-typed-outcome.ts](../../packages/testbench/src/scenarios/timeouts/timeout-typed-outcome.ts) expects `FAILED`, not `TIMED_OUT`.

Until that is resolved in code or an accepted decision, operators and integrators should treat the recovery semantics as reason-code-driven for those cases.

## Evidence

- [packages/schema/src/index.ts](../../packages/schema/src/index.ts)
- [packages/outcome-engine/src/outcome-classifier.ts](../../packages/outcome-engine/src/outcome-classifier.ts)
- [packages/runtime-core/src/index.ts](../../packages/runtime-core/src/index.ts)
- [packages/runtime-core/src/gateway.test.ts](../../packages/runtime-core/src/gateway.test.ts)
- [packages/testbench/src/scenarios/timeouts/timeout-typed-outcome.ts](../../packages/testbench/src/scenarios/timeouts/timeout-typed-outcome.ts)
- [docs/OUTCOME_ENVELOPE.md](../OUTCOME_ENVELOPE.md)
- [docs/HTTP_API.md](../HTTP_API.md)
