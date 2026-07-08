# ADR-0031: Approval UI Security

## Status

Accepted as a Phase 1 dashboard requirement.

## Context

Hash-bound approval is only useful if the human can understand what is being approved. An opaque hash alone is not meaningful authority.

## Decision

The approval UI must show readable content and canonical binding data before a human approves or rejects a governed action.

Detailed implementation requirements live in [Approval UI Security Requirements](APPROVAL_UI_SECURITY.md).

## Consequences

- Approval UI design is part of the security model.
- Payload rendering must be stable and resistant to hidden-character confusion.
- Editing a payload after approval must require a new hash and a new approval.
- Governance claims apply only to calls routed through Ananke.
