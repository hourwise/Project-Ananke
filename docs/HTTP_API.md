# HTTP API

Ananke exposes a REST API for tool execution, approvals, and audit queries.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health check - returns `{ name, version }` |
| `GET` | `/api/tools` | List all registered tools with risk metadata |
| `GET` | `/api/tools/:name` | Get a single tool's metadata |
| `POST` | `/api/execute` | Execute a tool call - `{ toolName, arguments, approvalId? }` |
| `GET` | `/api/auth/me` | Verified operator identity, roles, and effective permissions |
| `GET` | `/api/approvals` | List pending grants; requires `approvals:read` |
| `POST` | `/api/approvals/:id/approve` | Approve a pending grant; requires `approvals:decide` |
| `POST` | `/api/approvals/:id/reject` | Reject a pending grant; requires `approvals:decide` |
| `GET` | `/api/audit` | Query audit log; requires `audit:read` - `?toolName=&eventType=&since=&limit=` |
| `GET` | `/api/stats` | Runtime stats; requires `stats:read` |

## Execute Response

The `/api/execute` endpoint returns an outcome envelope:

```json
{
  "outcome": {
    "state": "COMPLETED",
    "retryable": false,
    "requiresUser": false,
    "safeToContinue": true,
    "data": { "events": [] }
  }
}
```

## Audit Query

`GET /api/audit` requires an authenticated operator with the `audit:read` permission because audit events can contain tool arguments and approval metadata.

Optional filters are `toolName`, `eventType`, and `since` (an ISO 8601 timestamp). `limit` defaults to 100 and accepts integers from 1 through 500. Invalid filters return `400` rather than being passed to the audit backend.

When approval is required, the response includes `approvalGrantId`:

```json
{
  "outcome": {
    "state": "WAITING_FOR_APPROVAL",
    "reasonCode": "APPROVAL_REQUIRED",
    "retryable": true,
    "requiresUser": true,
    "safeToContinue": false
  },
  "approvalRequired": true,
  "approvalGrantId": "approval-id"
}
```

The retry succeeds only after that grant is approved through the approval API or approval engine.

## Approval Response

Operator endpoints accept a signed OIDC JWT in production mode. The bundled local development mode accepts:

```http
Authorization: Bearer dev-approval-token
```

The approval API does not trust `approvedBy` or `rejectedBy` from the request body. Approver identity is derived from authenticated request context.

See [Operator Authentication and RBAC](AUTHENTICATION_AND_RBAC.md) for OIDC configuration, roles, claims, and permissions. Invalid credentials return `401`; valid credentials without the required permission return `403`.

`GET /api/approvals` returns pending grants with dashboard-safe review fields:

```json
{
  "id": "approval-id",
  "toolName": "filesystem.write_file",
  "riskClass": "INTERNAL_WRITE",
  "status": "pending",
  "arguments": { "path": "note.txt", "content": "hello" },
  "canonicalPayload": "{\"content\":\"hello\",\"path\":\"note.txt\"}",
  "canonicalHash": "...",
  "requestedAt": "2026-07-08T12:00:00.000Z"
}
```

Approving a grant records `APPROVAL_GRANTED` in audit. Rejecting a grant records `APPROVAL_DENIED`; a later retry with that grant returns a denied outcome.

Approval decision audit metadata includes:

```json
{
  "decision": "approved",
  "operatorId": "local-dashboard",
  "operatorDisplayName": "Local Dashboard",
  "sessionId": "local-dev-session",
  "authMethod": "dev-token",
  "decidedAt": "2026-07-08T12:00:00.000Z"
}
```
