# ADR-XXXX: Ananke Enforcement of Dual-Principal MCP Delegation

- **Status:** Proposed
- **Date:** 2026-07-14
- **Parent decision:** Dual-Principal Identity, Scoped MCP Delegation, and Cross-Runtime Compatibility
- **Related decision:** MCP 2026-07-28 Stateless Compatibility Architecture
- **Project:** Project Ananke
- **Decision scope:** Governed execution, policy, approval, credential and replay enforcement

## Context

A shared MCP token or process connection creates ambient authority. Stateless MCP further requires each request to carry enough independently verifiable context for policy evaluation.

Ananke already owns execution governance, approval binding, typed outcomes, audit, and the non-bypassable action chokepoint. The ecosystem decision extends that boundary to dual-principal identity, scoped grants, credential brokering, idempotency, replay protection, and server/tool admission.

## Decision

Ananke SHALL independently evaluate every governed request against:

- authenticated or delegating principal;
- acting agent or runtime principal;
- represented principal where applicable;
- tenant, account, project, and resource scope;
- target server, tool, operation, and canonical arguments;
- purpose;
- runtime profile and policy version;
- current approval;
- capability grant;
- expiry and revocation;
- execution-count and idempotency policy;
- server and integration admission status.

No authority SHALL be inherited solely from a prior request, MCP session, transport connection, state handle, tool visibility, memory record, or client-supplied metadata.

## Required governed-call envelope

Ananke SHALL accept or adapt a canonical request equivalent to:

```ts
interface GovernedToolCall {
  context: RuntimeRequestContext;
  server: ServerReference;
  tool: ToolReference;
  arguments: unknown;
  purpose?: string;
  approval?: ApprovalReference;
  grant?: GrantReference;
  idempotencyKey: string;
}
```

## Approval binding

Approval hashes SHALL include all material authority and action dimensions:

- delegating/authenticated principal;
- acting principal;
- represented principal;
- tenant and resource scope;
- server and tool;
- canonical arguments;
- workflow/execution identifiers where relevant;
- purpose;
- policy version;
- expiry;
- allowed execution policy.

Any material mutation SHALL produce `APPROVAL_INVALIDATED` or an equivalent explicit denial.

Approvals SHALL NOT be bound merely to an MCP session ID or transport connection.

## Capability and credential broker

Ananke or a dedicated package under Ananke's authority SHALL:

- retain long-lived upstream credentials outside agent and model boundaries;
- mint, exchange, or inject short-lived scoped credentials where supported;
- apply local restrictions where providers expose only coarse credentials;
- redact secrets from logs, audit, errors, and model-visible output;
- record grant and broker decision identifiers, not raw credentials;
- deny when required scope cannot be proven;
- prevent direct stdio, HTTP, extension, or environment-variable bypass.

## Idempotency and replay

Every side-effecting action SHALL be evaluated against persistent idempotency state.

Ananke SHALL distinguish:

- first execution;
- safe retry returning the prior result;
- duplicate delivery;
- expired retry window;
- replay attack;
- approved bounded repetition.

Single-use approvals SHALL become consumed atomically with execution admission.

Timeout SHALL not imply failure. Before re-execution, Ananke SHALL determine whether the prior attempt committed a side effect or remains indeterminate.

## Discovery and admission

A server or tool being discoverable SHALL NOT make it admitted.

Ananke SHALL support policy over:

- server identity or origin;
- transport;
- protocol era and version;
- tool risk class;
- provider scoping quality;
- credential path;
- tenant isolation;
- content preflight requirements;
- known bypass conditions.

## Typed outcomes and reasons

Add or map explicit reasons for:

- unauthenticated principal;
- unknown acting agent;
- invalid or unverifiable delegation;
- principal mismatch;
- tenant/resource mismatch;
- insufficient capability;
- grant expired or revoked;
- approval required or invalidated;
- duplicate or replayed execution;
- indeterminate prior execution;
- unsupported protocol era;
- unadmitted server or tool;
- broker unavailable;
- coarse credential prohibited;
- direct bypass attempt.

## Audit requirements

Record both principals, scope, compatibility, workflow, approval, grant, idempotency, broker path, decision, and final outcome.

Never record:

- bearer credentials;
- API keys;
- refresh tokens;
- reusable state handles;
- full secret-bearing arguments unless safely redacted.

## Security invariants

1. Every governed action is authorised at execution time.
2. Human authority and agent authority remain separately attributable.
3. Approval cannot be reused after material mutation.
4. Memory cannot supply current permission.
5. Discovery cannot supply authority.
6. Retry cannot duplicate a side effect without a deliberate idempotency decision.
7. Coarse provider credentials never cross the protected gateway boundary.
8. Uncertain identity, scope, prior-execution state, or compatibility fails closed.

## Implementation sequence

1. Import canonical principal, delegation, scope, compatibility, and idempotency types.
2. Extend policy input and audit schemas.
3. Add approval-binding fields and migration handling.
4. Implement grant validation and execution-count policy.
5. Implement persistent idempotency and replay records.
6. Add credential-broker interface and coarse-provider policy.
7. Add server/tool admission checks.
8. Add modern and legacy MCP adapter tests.
9. Add tests for duplicate, timeout, replay, expired grant, mutated principal, and stale state handle.

## Acceptance criteria

- A request cannot execute with only a shared MCP token.
- Every audit record identifies delegating and acting principals.
- Approval mutation and replay tests fail closed.
- Idempotent retry cannot produce duplicate external side effects.
- Agents never receive long-lived provider credentials.
- Legacy and modern protocol adapters yield the same governance decision for equivalent calls.
