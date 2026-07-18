# ADR-0034: Project Adrasteia Stage-A Adoption Boundary

## Status

Accepted.

## Context

Ananke needs portable identity, scope, correlation, runtime-inspection, and
protocol-negotiation representations without transferring authority to another
runtime. The immutable baseline is Project Adrasteia tag
`adrasteia-adoption-v0.4.0-protocol-1.4.0`, commit
`124b6aee2629a3147739934ad5f1b45b32c8ba46`, package
`project-runtime-contracts@0.4.0`, SHA-256
`11ee062b079f74d2a4558af315c9b9b12a6aede291d409c48f038d93c416e2c2`.

The Fates Runtime Protocol baseline is current `1.4.0`, minimum `1.0.0`, and
supports the closed range `1.0.0`–`1.4.0`.

## Decision

Ananke pins the immutable release asset and consumes it through
`@ananke/adrasteia-adapter`. The adapter contains only pure mapping and
canonical-schema validation. It owns no policy, authorization, approval,
credential, persistence, execution, or content-preflight decision.

Ananke retains authority over authentication, authorization, policy versions,
approval binding, credential custody, execution, domain outcomes, and its
authoritative audit records. A parsing capability, discovery record, grant
descriptor, or approval reference never grants authority without Ananke-owned
verification.

The adopted portable families are dual-principal identity, agent execution
context, structured scope, correlation, approval/audit references, runtime
identity, registration, health, readiness, compatibility, and semantic Fates
Runtime Protocol negotiation. The gateway exposes public, sanitized inspection
endpoints under `/api/runtime/*`; execution and operator endpoints retain their
existing authentication requirements.

The Adrasteia baseline explicitly excludes content preflight. Ananke's local
content-preflight contracts remain authoritative and no protocol compatibility
claim is made for that family.

## Consequences

- HTTP ingress creates a per-attempt request ID and accepts only validated
  correlation/causation headers from the authenticated boundary.
- Authenticated human/service workload identity and acting-agent identity are
  distinct. Approving operators remain separate human approval authorities.
- Resource scope is structured, bounded or explicitly unscoped, and rejects
  wildcard values. It is approval-bound.
- Approval binding includes stable authority dimensions and excludes the
  per-attempt request ID, so an approved retry may have a fresh request ID.
- Runtime compatibility reports honest constraints: local content preflight,
  no scoped credential broker, no persistent replay recovery, in-memory
  approvals, and explicitly configured production execution authentication.

## Migration and Rollback

Callers must replace legacy `agentPrincipalId` and string scope values with a
service/human authenticated principal, a distinct agent principal, and a
structured bounded scope. The former `ExecutionContext` export is a deprecated
alias that delegates to the adapter rather than preserving an independent
schema. Rollback is limited to removing the adapter dependency and runtime
inspection routes in a focused Ananke change; it never requires modifying
Project Adrasteia.

## Related Decisions

This implements the portable-boundary portion of the proposed
[dual-principal delegation ADR](ADR-XXXX-dual-principal-mcp-delegation-and-compatibility.md).
Credential brokering, JWT grant minting, persistent idempotency, replay
recovery, and cross-runtime orchestration remain out of scope.
