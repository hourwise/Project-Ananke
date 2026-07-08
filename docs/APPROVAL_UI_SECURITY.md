# Approval UI Security Requirements

The approval dashboard is part of the authority boundary. It must help a human approve what will actually execute, not merely approve a vague agent intention.

## Required Approval Display

For every approval request, the dashboard must show:

- Tool name
- Risk class
- Human-readable arguments
- Canonical payload preview
- Hash
- Approval or rejection decision
- Timestamp
- Approving user/session

## Binding Rule

The human approves readable content. The hash enforces that the approved content is exactly what executes.

This means the UI must make the readable content and the canonical payload relationship clear. The user should not be asked to approve an opaque hash without seeing the relevant arguments.

## Operator Identity Rule

Approval identity must come from authenticated dashboard/API context. The backend must ignore `approvedBy`, `rejectedBy`, operator ID, or session ID values supplied in the request body.

For the current local development dashboard, approval queue and decision endpoints require:

```http
Authorization: Bearer dev-approval-token
```

This token guard is for local development only. Production deployments need real authentication, authorization, session management, token rotation, and operator lifecycle controls.

## Minimum Security Requirements

- Show the exact tool name and server/source namespace.
- Show risk class and policy decision before approval.
- Render arguments in a stable, readable format.
- Provide a canonical payload preview for debugging and audit.
- Show the hash that will be bound to the approval.
- Record approve/reject decision with timestamp and approving user/session.
- Derive approving user/session from authenticated context, not user-editable request fields.
- Prevent editing the payload inside the approval UI unless a new approval hash is generated.
- Warn when arguments are large, truncated, binary-like, or contain hidden characters.
- Treat tool descriptions and tool results as untrusted text.

## Non-Goals For Phase 1

Phase 1 does not provide full content-sensitive review, data loss prevention, or information-flow control. These are future governance layers.
