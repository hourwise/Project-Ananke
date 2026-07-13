# HTTP API

Ananke exposes a REST API for tool execution, approvals, and audit queries.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health check - returns `{ name, version }` |
| `GET` | `/api/tools` | List all registered tools with risk metadata |
| `GET` | `/api/tools/:name` | Get a single tool's metadata |
| `POST` | `/api/execute` | Authenticated workload execution - `{ toolName, arguments, approvalId?, contentAccess?, contentApprovalId? }` |
| `GET` | `/api/auth/me` | Verified operator identity, roles, and effective permissions |
| `POST` | `/api/auth/logout` | Revoke the authenticated Ananke operator session |
| `GET` | `/api/approvals` | List pending grants; requires `approvals:read` |
| `POST` | `/api/approvals/:id/approve` | Approve a pending grant; requires `approvals:decide` |
| `POST` | `/api/approvals/:id/reject` | Reject a pending grant; requires `approvals:decide` |
| `GET` | `/api/content-approvals` | List pending content exposure receipts; requires `approvals:read` |
| `POST` | `/api/content-approvals/:id/approve` | Approve a pending content receipt; requires `approvals:decide` |
| `POST` | `/api/content-approvals/:id/reject` | Reject a pending content receipt; requires `approvals:decide` |
| `GET` | `/api/audit` | Query audit log; requires `audit:read` - `?toolName=&eventType=&since=&limit=` |
| `GET` | `/api/stats` | Runtime stats; requires `stats:read` |

## Execute Response

`POST /api/execute` requires a workload bearer credential. Missing or invalid credentials return `401`; caller, agent, tenant, resource, session, and policy identity are never accepted from the JSON body. Explicit local development mode provides `dev-execution-token`; production deployments must configure `executionAuth`.

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

## Content Preflight

Content preflight is disabled by default. When the gateway enables it, every successful `READ_ONLY` result needs a registered adapter and a `contentAccess` request:

```json
{
  "toolName": "notes.read",
  "arguments": { "id": "note-1" },
  "contentAccess": {
    "requestedExposure": "SELECTED_CONTENT",
    "destination": { "runtime": "ananke-agent", "agentId": "agent-1" },
    "purpose": "Summarize this note",
    "selection": { "fields": ["title", "summary"] }
  }
}
```

The gateway returns only the adapter-rendered surface matching the granted exposure in `outcome.data.content`. If preflight is unavailable, the scanner fails, the requested surface is unsupported, or policy blocks it, the outcome is `DENIED` and raw tool output is withheld. Preflight and decision evidence are recorded as `CONTENT_PREFLIGHTED` and `CONTENT_ACCESS_DECIDED` audit events.

When policy requires elevated exposure, the gateway creates a pending content receipt and returns `WAITING_FOR_APPROVAL` with `outcome.data.contentApprovalReceiptId`. Approve or reject that receipt through the content-approval endpoints, then re-submit the same content access request with `contentApprovalId`. The receipt is one-time, hash-bound to the current observation and destination, and cannot authorize changed content.

## Audit Query

`GET /api/audit` requires an authenticated operator with the `audit:read` permission. A central sanitizer runs before every audit backend: arguments are reduced to shape-only markers, outcome payload/error text is removed, and sensitive metadata is redacted or pseudonymized.

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

## Operator Logout

`POST /api/auth/logout` requires a valid operator credential and revokes its Ananke session immediately:

```json
{
  "sessionId": "oidc-session-id",
  "status": "revoked",
  "revokedAt": "2026-07-12T12:00:00.000Z"
}
```

The same credential then receives `401` from operator endpoints, even if its JWT expiration time has not passed. This endpoint revokes the local Ananke session only; production callers must also use their identity provider end-session flow.

## Approval Response

Operator endpoints accept a signed OIDC JWT in production mode. Explicit local development mode accepts:

```http
Authorization: Bearer dev-approval-token
```

The approval API does not trust `approvedBy` or `rejectedBy` from the request body. Approver identity is derived from authenticated request context.

See [Operator Authentication and RBAC](AUTHENTICATION_AND_RBAC.md) for OIDC configuration, roles, claims, and permissions. Invalid credentials return `401`; valid credentials without the required permission return `403`.

`GET /api/approvals` returns pending grants with dashboard-safe review fields:

```json
{
  "id": "approval-id",
  "serverName": "filesystem",
  "toolName": "filesystem.write_file",
  "riskClass": "INTERNAL_WRITE",
  "status": "pending",
  "arguments": { "path": "note.txt", "content": "hello" },
  "canonicalPayload": "{\"content\":\"hello\",\"path\":\"note.txt\"}",
  "actionHash": "...",
  "executionContext": {
    "agentPrincipalId": "agent-1",
    "tenantId": "tenant-1",
    "resourceScope": "filesystem:/workspace",
    "sessionId": "agent-session-1",
    "policyVersion": "policy-v1"
  },
  "expiresAt": "2026-07-08T12:05:00.000Z",
  "requestedAt": "2026-07-08T12:00:00.000Z"
}
```

Approving a grant records `APPROVAL_GRANTED` in audit. Rejecting a grant records `APPROVAL_DENIED`; a later retry with that grant returns a denied outcome.

Approval decision audit metadata includes:

```json
{
  "decision": "approved",
  "operatorId": "sha256:...",
  "operatorDisplayName": "[REDACTED]",
  "sessionId": "sha256:...",
  "authMethod": "dev-token",
  "decidedAt": "2026-07-08T12:00:00.000Z"
}
```
