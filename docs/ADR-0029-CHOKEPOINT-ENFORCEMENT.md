# ADR-0029: Chokepoint Enforcement

## Status

Accepted for Phase 1.

## Context

Ananke can enforce policy and approvals only when it is the path through which tool calls pass. If the agent can directly access the same tool, credential, database, CLI, or stdio handle, it can bypass Ananke.

Governance claims apply only to calls routed through Ananke.

## Decision

A governed tool must not be directly reachable by the agent. Production deployments must make Ananke the exclusive execution chokepoint for governed capabilities.

## Required Deployment Properties

- Agents do not receive raw tool credentials.
- Agents do not receive direct stdio handles to governed MCP servers.
- Agents do not receive direct database URLs or shell access for governed operations.
- Audit completeness is claimed only for calls through the gateway.

## Consequences

- Ananke is a governance layer, not a sandbox by itself.
- Deployment architecture is part of the security model.
- Bypass paths must be found and removed during integration review.
