# Security

Ananke is an AI governance runtime that sits between agents and tools, enforcing policy, approval, auditability, and recoverable outcomes.

MCP connects tools. Ananke governs execution. Governance claims apply only to calls routed through Ananke.

## Required Boundary

Ananke only governs tool calls that pass through the Ananke Gateway. If an agent has direct access to the same MCP server, API key, CLI, database, or stdio handle, Ananke cannot govern that path.

## Phase 1 Security Rules

- No direct tool bypass: governed tools must be reachable exclusively through Ananke.
- No raw credentials to agents: API keys, database URLs, shell access, and MCP stdio handles must stay outside the agent context.
- Unknown tools deny by default: unregistered tools are classified as `UNKNOWN` and receive `DENY` by default policy.
- Read-only does not mean content-safe: v1 risk class is assigned by tool identity, not argument content or returned data.
- Tool descriptions and results are untrusted: metadata and outputs can contain misleading or prompt-injection content.
- Approval decisions require authenticated operator context: the dashboard/API must not trust `approvedBy` or `rejectedBy` from request bodies.

## Current Limitations

- Ananke is not a sandbox by itself.
- Phase 1 does not provide content-sensitive read classification.
- Phase 1 does not provide full information-flow control.
- Current canonical hashing is deterministic but not RFC 8785-complete.
- Approval UI has a local development token guard and records operator/session metadata, but production SSO, RBAC, rotation, and durable session management are not implemented yet.

## Reporting Security Issues

This repository is in prototype stage. Do not use public issues for exploitable deployment details. Report privately to the project maintainer until a formal disclosure process exists.
