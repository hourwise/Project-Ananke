# ADR-0028: MCP Compatibility And Governance

## Status

Accepted for Phase 1.

## Context

MCP standardizes how agents discover and call tools. It does not, by itself, define a governance runtime for policy, approval binding, audit, or recoverable outcomes.

## Decision

Ananke is positioned as an AI governance runtime for MCP-compatible and protocol-agnostic tool execution.

MCP connects tools. Ananke governs execution. Ananke does not replace MCP.

## Consequences

- Ananke can use MCP adapters where MCP is available.
- Ananke can also govern non-MCP executors such as APIs, CLIs, databases, or local functions.
- Governance claims apply only to calls routed through Ananke.
- MCP server metadata remains untrusted input and should not be treated as policy authority.
