# Content Preflight Contract

**Status:** Phase 2 foundation, opt-in gateway enforcement, and hash-bound content approval receipts implemented. Source-aware scanners and downstream destination enforcement are not implemented yet.

## Purpose

A read-only action may still expose unsafe content. This contract separates a scanner observation from Ananke policy authority so a scanner never grants access by itself.

The content policy foundation accepts a content observation and a requested destination/exposure, then returns a deterministic decision. The opt-in gateway stage invokes a registered adapter for successful read-only results and releases only the policy-granted adapter surface. It never falls back to raw tool output.

```text
scanner or adapter -> ContentSurfaceObservation
                                 |
                                 v
                         ContentPolicyEngine
                                 |
                                 v
                      ContentAccessDecision
```

## Contracts

The following contracts live temporarily in `@ananke/schema` and are intended to move to Project Runtime Contracts after cross-runtime review:

- `ContentSurfaceObservation`: source hash, scanner identity/version, source trust, media type, size, scan status, and flags.
- `ContentAccessRequest`: requested exposure, destination runtime/agent, purpose, and optional field/range selection.
- `ContentAccessDecision`: action, typed reason, granted exposure, approval requirement, and exact binding material.
- `ContentApprovalBinding`: SHA-256 binding over the content hash, observation ID, requested exposure, destination, purpose, policy version, and selection.
- `ContentApprovalReceipt`: durable, one-time operator decision over a binding and tool identity.

Raw content is deliberately absent from these structures. The content hash is a lowercase or uppercase 64-character SHA-256 hex value; it is the source freshness invariant.

Content decision reason codes remain distinct policy evidence, and the gateway now maps blocking decisions to typed tool outcomes without changing their evidence or decision.

## Exposure Levels

| Level | Meaning |
|---|---|
| `NONE` | No content surface is released. |
| `DERIVED_ONLY` | Scanner-derived facts only, such as type or size. |
| `SANITIZED_METADATA` | Safe metadata with untrusted text and sensitive values removed. |
| `SELECTED_CONTENT` | Explicit selected fields or ranges only. |
| `FULL_CONTENT` | Complete source content. |

## Default Decisions

The built-in `ContentPolicyEngine` uses a conservative deterministic baseline:

| Evidence | Decision | Immediate granted exposure |
|---|---|---|
| Scan failed or unsupported | Deny | `NONE` |
| Archive bomb or oversized payload | Quarantine | `NONE` |
| Embedded script or macro | Deny | `NONE` |
| Secret-like content | Allow only a derived surface | `DERIVED_ONLY` |
| Instruction-like content or type mismatch | Require approval | `SANITIZED_METADATA` |
| Clean owned text, selected request | Allow | `SELECTED_CONTENT` |
| Clean content, full request | Require approval by default | Selected or sanitized baseline |

A caller may explicitly permit full content for clean owned text with `allowFullContentForOwnedText`; the default remains false.

## Approval Binding and Freshness

Every decision carries a binding hash. Any change to the following produces a new binding:

- source content hash;
- observation ID;
- requested exposure;
- destination runtime or agent;
- purpose;
- selected fields or ranges;
- policy version.

The content approval store verifies this hash and the tool identity before emitting elevated content. Receipts are one-time use. A re-scan with a changed content hash must be treated as stale and require a new decision and approval.

## Current Boundary

Content preflight is opt-in. When `Gateway` is created with `contentPreflight.enabled: true`, every successful `READ_ONLY` result requires both a content access request and a registered adapter. Missing preflight, scanner failure, unsupported surfaces, and blocking decisions withhold raw output. Only the adapter surface matching the granted exposure is included in the outcome.

The bundled `JsonContentPreflightAdapter` is a narrow local adapter for strict JSON output. It produces derived and sanitized metadata surfaces, applies lightweight advisory findings, and supports explicit top-level field or string-range selection. Production deployments should supply a source-aware scanner adapter and must not treat the bundled heuristic as comprehensive malware, secret, or prompt-injection detection.

A `REQUIRE_APPROVAL` decision creates a pending `ContentApprovalReceipt` and returns `WAITING_FOR_APPROVAL` with `contentApprovalReceiptId`. An approver must decide the receipt through the content-approval API or dashboard. A retry with that ID releases content only when the current binding still matches; changed content produces `APPROVAL_INVALIDATED` and raw output remains withheld.

The default store is in-memory for local use. Configure `SqliteContentApprovalStore` for durable receipts:

    import { Gateway, SqliteContentApprovalStore } from "@ananke/runtime-core";

    const gateway = new Gateway({
      contentPreflight: {
        enabled: true,
        approvalStore: new SqliteContentApprovalStore("./ananke-content-approvals.db"),
      },
    });

The next implementation steps are:

1. Add source-aware scanner adapters and durable observation/decision records.
2. Add receipt revocation and retention controls.
3. Add destination checks for subsequent tool calls and prompts.

## Acceptance Evidence

`packages/policy-engine/src/content-policy-engine.test.ts` covers policy decisions and binding invalidation. `packages/runtime-core/src/content-preflight.test.ts` covers gateway release of selected content, fail-closed behavior, secret downgrades, hostile-content approval, binding invalidation, and content audit events. `packages/runtime-core/src/content-approval-store.test.ts` covers SQLite receipt persistence.
