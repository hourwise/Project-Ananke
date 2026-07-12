# ADR-XXXX: Content Preflight Policy Enforcement in Ananke

- **Status:** Accepted for the Phase 2 policy foundation, opt-in read-result enforcement, and content approval receipts
- **Date:** 2026-07-12
- **Decision owners:** Project Ananke maintainers
- **Applies to:** Project Ananke
- **Depends on:** Project Runtime Contracts Content Surface Preflight types

## Context

Ananke governs whether actions are allowed, denied, or require approval. A safe or read-only action does not guarantee safe returned content.

Files and documents may contain prompt injection, secrets, scripts, macros, hostile metadata, malformed structures, external references, or excessive payloads. Ananke therefore needs deterministic content evidence as policy input.

## Decision

Ananke accepts a `ContentSurfaceObservation` and returns a `ContentAccessDecision` through the standalone `ContentPolicyEngine`.

The scanner remains advisory. Ananke remains the authority boundary.

The exact local contract, default decision table, binding fields, opt-in gateway boundary, and receipt lifecycle are documented in [Content Preflight Contract](CONTENT_PREFLIGHT_CONTRACT.md). These contracts are intended to migrate to Project Runtime Contracts after cross-runtime review.

Available exposure levels:

- `NONE`
- `DERIVED_ONLY`
- `SANITIZED_METADATA`
- `SELECTED_CONTENT`
- `FULL_CONTENT`

## Policy Principle

> A safe action does not imply safe content.

`READ_ONLY` action classification must not automatically grant full content exposure.

## Default Posture

```text
Initial exposure: DERIVED_ONLY
Escalation: explicit policy evaluation
Full content: explicit allow or approval
Scan failure: deny or quarantine
Source mutation: invalidate decision
```

## Suggested Policy Mapping

| Observation | Default decision |
|---|---|
| Clean owned text file | `SELECTED_CONTENT` or `FULL_CONTENT` |
| Remote/user-supplied document | sanitized metadata, then selected excerpt |
| Instruction-like content | advisory, selected content, approval, or deny |
| Secret-like content | redact, select, or deny |
| Embedded script, executable, or macro | deny or approval |
| Archive/decompression risk | quarantine |
| Type mismatch | restricted inspection or deny |
| Failed or unsupported scan | deny |
| Changed content after approval | invalidate approval or return stale state |

## Human Approval Binding

Approvals must bind to:

- source content hash;
- observation identifier;
- exposure level;
- permitted fields or range;
- destination runtime or agent;
- purpose;
- policy version.

Any mutation invalidates approval.

## Content Decision Reason Codes

Suggested additions:

- `CONTENT_PREFLIGHT_REQUIRED`
- `CONTENT_SCAN_FAILED`
- `CONTENT_UNSUPPORTED`
- `CONTENT_RESOURCE_LIMIT`
- `CONTENT_RISK_FLAGGED`
- `CONTENT_SECRET_EXPOSURE`
- `CONTENT_SCRIPT_PRESENT`
- `CONTENT_TYPE_MISMATCH`
- `CONTENT_APPROVAL_REQUIRED`
- `CONTENT_APPROVAL_INVALIDATED`
- `CONTENT_RECEIPT_STALE`
- `CONTENT_EXPOSURE_DOWNGRADED`
- `CONTENT_QUARANTINED`

These are `ContentAccessReasonCode` values. The gateway maps blocking content decisions into typed tool outcomes while preserving the policy evidence in audit metadata. Reason codes must not reveal detector lexicons, regexes, or private policy internals.

## Advisory and Blocking Modes

Flags may be policy-mapped as:

- informational;
- advisory;
- restrictive;
- blocking.

The same flag may produce different decisions depending on context and purpose.

## Audit Requirements

Audit records must include requested action, requested exposure, observation ID, source hash, scanner identity/version, relevant flags, policy version, final decision, approval identity, emitted surface hash, destination, and final typed outcome.

## Consequences

### Positive

- Extends Ananke from action governance to content-aware authority.
- Preserves approval binding and stale-state detection.
- Prevents read-only operations becoming trust bypasses.

### Negative

- Adds policy inputs and tuning requirements.
- May initially increase approval prompts.
- False positives require nuanced policy handling.

## Acceptance Criteria

- Preflight observations are first-class policy input.
- Read-only classification does not grant full content automatically.
- Approvals bind to content hash, exposure, destination, and purpose.
- Changed content invalidates prior decisions.
- Policies can downgrade, redact, select, approve, deny, or quarantine.
- Tests cover clean content, hostile metadata, secrets, scan failure, stale receipt binding, and approval mutation.
