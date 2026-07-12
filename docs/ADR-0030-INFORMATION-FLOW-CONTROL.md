# ADR-0030: Information-Flow Control

## Status

Proposed for future work.

## Context

Phase 1 classifies risk by tool identity. This is sufficient for deterministic write approval, but it is not sufficient for all read risks. A read tool may expose secrets, credentials, private user data, or privileged context.

## Decision

Information-flow control is out of scope for Phase 1, but it is a planned governance layer.

The concrete policy direction is captured in [ADR-XXXX Content Preflight Policy Enforcement](ADR-XXXX-ananke-content-preflight-policy-enforcement.md): action classification remains advisory for content, and content exposure should be governed through preflight observations plus explicit exposure decisions.

## Future Requirements

- Content-sensitive read classification
- Content preflight observations and exposure levels
- Secret and credential detection
- Data labels and policy scopes
- Tool result poisoning protection
- Restrictions on where sensitive outputs may flow next
- Audit events that capture information boundary decisions

## Consequences

- Phase 1 documentation must be explicit that `READ_ONLY` means read-only by tool identity, not always safe by content.
- Production users should register broad read tools carefully and avoid exposing sensitive paths until content preflight governance exists.
