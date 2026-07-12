# Threat Model

This document is a documentation-only summary of the current Ananke authority and threat model. It describes what the repository evidence supports today, what is only proposed, and which security-relevant behaviours remain unresolved.

## Scope

In scope for this document:

- governed tool execution through the Ananke gateway;
- risk classification, policy decisions, approval requirements, approval binding, typed outcomes, and audit events;
- operator approval and audit APIs;
- deployment assumptions required for Ananke's governance claims to hold.

Out of scope for this document:

- direct tool calls, credentials, or shell access that bypass the gateway;
- sandboxing of the host, IDE, browser, terminal, or operating system;
- memory truth, memory scoring, or orchestration performed by other runtimes;
- end-to-end transport security, reverse proxies, firewalling, or host hardening not implemented in this repository.

## Assets

Security-relevant assets in the current repository:

- governed tool credentials and handles held outside the agent path;
- tool metadata registered with the gateway, especially `toolName`, `server`, and `riskClass`;
- approval grants, including `id`, `toolName`, `canonicalHash`, status fields, timestamps, and operator identity fields;
- canonical payloads produced by `canonicalJson(...)`;
- operator identity derived from authenticated request context;
- audit events and any persistent SQLite audit database;
- outcome envelopes returned to agents and integrators.

## Trust Boundaries

Current trust boundaries supported by repository evidence:

- Agent to gateway: the agent can propose any tool call and arguments, but governance applies only if the action is routed through `Gateway.execute(...)`.
- Gateway to operator API: approval and audit endpoints trust authenticated operator identity, not request-body identity fields.
- Gateway to tool executor: tool executors and MCP servers are outside the policy engine and can fail, time out, or return hostile content.
- Gateway to audit storage: audit events are written by Ananke, but append-only protection is not enforced by the current code.
- Deployment boundary: if the same agent can reach tools or credentials by another path, that path bypasses Ananke entirely.

## Trusted Components

Trusted components for current governance claims:

- `@ananke/runtime-core` for request sequencing, policy evaluation, execution dispatch, and API routes;
- `@ananke/policy-engine` for deterministic risk-class policy defaults and policy-file overrides;
- `@ananke/authority-engine` for approval grant storage, approval status, canonical hashing, and grant consumption;
- `@ananke/outcome-engine` for typed outcome generation;
- `@ananke/audit-engine` for audit recording;
- the configured operator authenticator for development-token or OIDC JWT verification.

Trusted does not mean hardened. It means the repository's governance model depends on these components behaving correctly.

## Untrusted Inputs

Inputs that must be treated as untrusted:

- agent-supplied tool names and arguments;
- tool descriptions, schemas, and server metadata;
- tool results and downstream error messages;
- approval request bodies, especially spoofed identity fields;
- operator JWT claims until signature, issuer, audience, and role checks pass;
- filesystem and document content returned by read tools;
- network conditions, availability, and downstream service behaviour.

## Attacker Capabilities

This threat model assumes an attacker may be able to:

- prompt an agent to call any registered tool with attacker-chosen arguments;
- replay prior requests or retry requests after timeouts;
- mutate arguments between approval request and execution attempt;
- submit forged `approvedBy` or `rejectedBy` fields to approval endpoints;
- operate a malicious MCP server or malicious tool implementation;
- embed prompt injection, misleading text, or secrets in tool metadata or tool output;
- exploit an insecure deployment where the agent still has direct tool or credential access;
- inspect or tamper with local files if host-level filesystem permissions are weak.

This threat model does not assume Ananke can resist host compromise or a fully compromised operator workstation.

## Threats

| Threat | Current behaviour and evidence | Residual risk |
|---|---|---|
| Direct tool or credential bypass | Governance claims apply only to calls routed through Ananke. Accepted ADRs require exclusive routing and no raw credentials to agents. | If the same agent can still reach the MCP server, CLI, database, API key, terminal, or IDE extension path directly, Ananke does not govern that path. |
| Approval substitution through spoofed identity fields | Approval and rejection routes derive operator identity from authenticated context and ignore request-body identity fields. Tests cover spoofed `approvedBy` and `rejectedBy`. | Protection depends on correct operator authentication deployment. The default `dev-approval-token` is only suitable for localhost development. |
| Post-approval mutation | Approval validation rejects argument payload changes by recomputing the canonical hash. Gateway tests cover `APPROVAL_HASH_MISMATCH`. | Current validation is exact for supported JSON data only. Cross-language canonicalisation is not standardized yet. |
| Replay of a used approval | Approval grants track `used`; validation rejects already-used grants. | Consumption happens after an execution attempt, even when that attempt fails. The current gateway also collapses several non-match failures into the `APPROVAL_INVALIDATED` path. Concurrent duplicate execution is not explicitly prevented. |
| Approval reuse across the wrong tool | Approval grants store `toolName`. | Current validation checks the approval ID and canonical argument hash, but does not re-check `toolName` during `checkApproval(...)`. This means the stored tool name is not currently part of the enforcement invariant. |
| Approval expiry ambiguity | Approval grants support `expiresAt`, and expired grants are rejected by the approval store. | The normal gateway request flow does not assign an expiry basis, so expiry policy is not currently defined at the integration level. |
| Stale state / changed resource version | The tool router maps stale/version errors to reason code `STALE_STATE`. | The public schema includes `STALE_STATE` as an outcome state, but the current classifier returns `FAILED` with `reasonCode: "STALE_STATE"`. Recovery is documented, but emitted state semantics are inconsistent. |
| Confused deputy through broad tools | Unknown tools deny by default and risk classes are assigned explicitly through registry metadata. | Broad read, shell, database, filesystem, or network tools can still be overly powerful. Ananke is not a sandbox and does not reduce the executor's native authority. |
| Malicious tool metadata | Accepted ADRs and security docs treat MCP metadata as untrusted input. | The repository does not implement metadata sanitisation or hidden-character hardening beyond documentation requirements. |
| Prompt injection or hostile tool results | Security docs and roadmap explicitly treat tool descriptions and results as untrusted. A prompt-injection scenario exists in the testbench suite. | Phase 1 does not implement full content-sensitive read governance or downstream information-flow control. Read-only actions can still return hostile or sensitive content. |
| Cross-server exfiltration | `EXTERNAL_SEND` and `NETWORK_EGRESS` risk classes require approval by default. | Phase 1 governs action execution, not all downstream information flow. Sensitive read results can still reach an unsafe prompt or later tool call unless the broader system prevents it. |
| Read-only poisoning | Security docs state that `READ_ONLY` is assigned by tool identity, not content sensitivity. | Safe action classification does not guarantee safe returned content. Proposed content preflight work is not implemented yet. |
| Audit tampering or deletion | Audit engines record structured events and a SQLite backend exists. | The in-memory audit log supports `clear()`, and the repository does not enforce append-only storage, WORM media, or external tamper evidence. |
| Operator or dashboard compromise | OIDC JWT verification and deny-by-default RBAC are implemented. Approval endpoints require authenticated operator context. | Production control-plane work remains open: IdP login/logout flow, durable sessions, immediate revocation, rate limiting, security headers, and cookie/CSRF design if browser sessions are added. |
| Denial of service | Some read APIs bound audit query filters and limits. | The repository does not implement execution rate limiting, quotas, concurrency controls, or sandbox resource limits. Downstream tools can still hang, time out, or exhaust resources. |
| Partial-success ambiguity | The public schema includes `PARTIAL_SUCCESS` as both a state and a reason code. | The current gateway classifier does not emit a dedicated `PARTIAL_SUCCESS` state in the normal execution path, so retry and audit semantics remain underspecified. |
| Insecure topology | Accepted ADRs make deployment architecture part of the security model. | Local terminals, IDE extensions, shared dev tokens, and unsegmented hosts can all bypass or weaken governance if they retain direct authority. |

## Current Mitigations

Implemented and evidenced in the repository:

- unknown tools default to `UNKNOWN` and `DENY`;
- approval-required tools return `WAITING_FOR_APPROVAL` with an approval grant ID;
- approval grants bind to canonical argument hashes for supported JSON-shaped payloads;
- mutated approved payloads return `APPROVAL_INVALIDATED` with `APPROVAL_HASH_MISMATCH`;
- operator approval identity is derived from development-token or OIDC JWT authentication;
- approval and audit endpoints are protected by role-based permissions;
- audit events are recorded for tool requests, policy checks, approval decisions, execution, failures, and many outcome paths.

## Residual Risks

Residual risks that remain after current mitigations:

- Ananke is not a sandbox and does not secure the host, IDE, or tool environment by itself.
- Approval validation is narrower than the broader authority model described elsewhere; current enforcement is strongest on argument mutation, weaker on tool identity and policy-version binding.
- Audit integrity depends on deployment choices outside the repository.
- Timeout, stale-state, and partial-success recovery semantics are only partially aligned across schema, docs, and emitted runtime states.
- Content-sensitive read governance is planned, not implemented.

## Evidence

Primary evidence used for this document:

- [README.md](../README.md)
- [SECURITY.md](../SECURITY.md)
- [docs/APPROVAL_BINDING.md](APPROVAL_BINDING.md)
- [docs/AUTHENTICATION_AND_RBAC.md](AUTHENTICATION_AND_RBAC.md)
- [docs/ADR-0028-MCP-COMPATIBILITY-AND-GOVERNANCE.md](ADR-0028-MCP-COMPATIBILITY-AND-GOVERNANCE.md)
- [docs/ADR-0029-CHOKEPOINT-ENFORCEMENT.md](ADR-0029-CHOKEPOINT-ENFORCEMENT.md)
- [docs/ADR-0031-APPROVAL-UI-SECURITY.md](ADR-0031-APPROVAL-UI-SECURITY.md)
- [docs/ADR-0032-CANONICAL-PAYLOAD-HASHING.md](ADR-0032-CANONICAL-PAYLOAD-HASHING.md)
- [packages/schema/src/index.ts](../packages/schema/src/index.ts)
- [packages/runtime-core/src/index.ts](../packages/runtime-core/src/index.ts)
- [packages/runtime-core/src/routes.ts](../packages/runtime-core/src/routes.ts)
- [packages/runtime-core/src/gateway.test.ts](../packages/runtime-core/src/gateway.test.ts)
- [packages/authority-engine/src/approval-store.ts](../packages/authority-engine/src/approval-store.ts)
- [packages/authority-engine/src/canonical-hash.ts](../packages/authority-engine/src/canonical-hash.ts)
- [packages/authority-engine/src/approval-bind.test.ts](../packages/authority-engine/src/approval-bind.test.ts)
- [packages/outcome-engine/src/outcome-classifier.ts](../packages/outcome-engine/src/outcome-classifier.ts)
- [packages/tool-router/src/execution-wrapper.ts](../packages/tool-router/src/execution-wrapper.ts)

## Open Questions

- What should set approval expiry in the normal gateway flow, and should expiry be policy-driven, operator-driven, or tool-driven?
- Should approval validation bind `toolName`, `server`, `riskClass`, or policy version in addition to the canonical argument hash?
- Should used, expired, missing, and mismatched approvals continue to collapse into the same invalidation outcome?
- Is append-only audit a future policy requirement or only a recommended deployment property?
- What sanitisation or rendering rules should apply to untrusted tool metadata and tool results before operator display?
