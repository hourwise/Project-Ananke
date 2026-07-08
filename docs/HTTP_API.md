# HTTP API

Ananke exposes a REST API for tool execution, approvals, and audit queries.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health check - returns `{ name, version }` |
| `GET` | `/api/tools` | List all registered tools with risk metadata |
| `GET` | `/api/tools/:name` | Get a single tool's metadata |
| `POST` | `/api/execute` | Execute a tool call - `{ toolName, arguments, approvalId? }` |
| `GET` | `/api/approvals` | List pending approval grants |
| `POST` | `/api/approvals/:id/approve` | Approve a pending grant - `{ approvedBy? }` |
| `POST` | `/api/approvals/:id/reject` | Reject a pending grant - `{ rejectedBy? }` |
| `GET` | `/api/audit` | Query audit log - `?toolName=&eventType=&since=&limit=` |
| `GET` | `/api/stats` | Runtime stats - executed, failed, denied, pending approvals |

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
