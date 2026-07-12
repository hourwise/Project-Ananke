# Deployment Assumptions

This document states the assumptions an integration must satisfy before it can claim that Ananke governs a capability. These are deployment properties, not guarantees automatically provided by the repository.

## Non-Negotiable Assumption

Ananke governs only actions and credentials that are exclusively routed through it.

If the same agent session can still reach the tool, credential, MCP server stdio handle, CLI, terminal, IDE extension, browser session, database, or alternate network endpoint directly, that path bypasses Ananke.

## Exclusive Routing And Credentials

Required for governance claims:

- the agent must call the gateway, not the raw tool;
- raw credentials must stay outside the agent context;
- governed MCP servers must not expose their stdio handles directly to the agent;
- governed shell, filesystem, database, or API operations must not remain reachable through a side channel;
- approval and audit claims apply only to governed paths that actually pass through the gateway.

Repository evidence for this assumption:

- [docs/ADR-0029-CHOKEPOINT-ENFORCEMENT.md](../ADR-0029-CHOKEPOINT-ENFORCEMENT.md)
- [SECURITY.md](../../SECURITY.md)
- [README.md](../../README.md)

## Network Exposure

Current repository behaviour:

- the runtime exposes HTTP endpoints for execution, approvals, audit, auth introspection, and stats;
- CORS is currently configured with `origin: '*'` on `/api/*`;
- the repository does not implement TLS termination, reverse-proxy policy, or network segmentation.

Deployment assumptions:

- do not expose prototype defaults directly on a shared or untrusted network;
- terminate TLS and restrict ingress outside this repository when running remotely;
- scope CORS, reverse-proxy rules, and network ACLs to the actual operator and agent clients;
- do not assume localhost development defaults are production-safe.

## Local And Remote Deployment

Local development assumptions:

- the bundled `dev-approval-token` is for localhost development only;
- the local operator and the local agent may share a machine, so host compromise or terminal access can bypass governance;
- development convenience settings should not be treated as production controls.

Remote deployment assumptions:

- operator and agent traffic need independent trust decisions;
- remote tool execution still depends on exclusive routing and credential separation;
- Ananke does not harden the surrounding runtime host by itself.

## Dashboard Authentication

Implemented in the repository:

- development-token authentication;
- OIDC JWT verification with issuer, audience, JWKS, role-claim, and session-claim support;
- optional SQLite-backed operator sessions with immediate local revocation and JWT ID rotation checks;
- session lifecycle audit events for start, rotation, and revocation;
- deny-by-default RBAC for `viewer`, `approver`, `auditor`, and `admin`.

Still assumed outside the repository:

- IdP-specific login/logout integration;
- secure browser session handling if cookies or a backend-for-frontend are added;
- refresh-token protection outside browser JavaScript;
- operator provisioning and group-to-role review.

## Audit Protection

Implemented in the repository:

- structured in-memory audit and SQLite audit backends;
- authenticated audit query API with bounded filters.

Not guaranteed by the repository alone:

- append-only storage;
- immutable retention;
- off-host replication;
- tamper-evident signing;
- separation of duties for audit storage administrators.

Deployment assumption:

- treat audit records as sensitive operational data and protect the underlying files, database paths, and backups accordingly.

## Process Identity And Execution Environment

Current repository boundary:

- operator identity is authenticated for operator APIs;
- tool execution identity is the gateway process identity or the connected downstream tool environment;
- Ananke does not isolate each tool call into a separate sandbox by itself.

Deployment assumption:

- run the gateway with only the filesystem, network, and credential permissions it actually needs;
- do not grant the gateway process broader host authority than the governed tools require;
- treat executor-specific permissions as part of the security review.

## Filesystem Permissions

Repository evidence includes filesystem demos and SQLite audit storage, but host filesystem controls are external to the repository.

Deployment assumption:

- protect policy files, audit databases, runtime secrets, and any local MCP server workspaces with host-level permissions;
- do not store governed secrets in locations readable by the agent if the agent is expected to be governed rather than trusted;
- recognize that terminal, shell, or extension access to the same files can create bypass paths.

## Sensitive Logs

Current logging and audit behaviour can include:

- tool names and arguments;
- approval metadata and operator identity;
- outcome states and reason codes;
- downstream error text.

Deployment assumption:

- treat console output, gateway logs, audit exports, and dashboard responses as potentially sensitive;
- redact or segment log sinks outside the repository if tool arguments may contain secrets or personal data;
- do not assume `READ_ONLY` tools only return harmless content.

## Terminal, IDE, And Extension Bypass

Ananke does not secure:

- an IDE extension that can invoke the same tool directly;
- a terminal that already has the same shell or API-key authority;
- browser tabs, local apps, or background services with independent credentials;
- a memory or orchestration runtime that can act outside the gateway.

This is why the chokepoint requirement is architectural, not cosmetic.

## Open Questions

- Should append-only audit become a formal product requirement rather than a deployment recommendation?
- Should the repository ship stricter default CORS or operator-network guidance for remote deployments?
- What minimum deployment profile should be required before claims beyond prototype-local use are made?

## Evidence

- [README.md](../../README.md)
- [SECURITY.md](../../SECURITY.md)
- [docs/DEPLOYMENT.md](../DEPLOYMENT.md)
- [docs/AUTHENTICATION_AND_RBAC.md](../AUTHENTICATION_AND_RBAC.md)
- [docs/ADR-0029-CHOKEPOINT-ENFORCEMENT.md](../ADR-0029-CHOKEPOINT-ENFORCEMENT.md)
- [packages/runtime-core/src/index.ts](../../packages/runtime-core/src/index.ts)
- [packages/runtime-core/src/routes.ts](../../packages/runtime-core/src/routes.ts)
