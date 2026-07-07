# HTTP API

Ananke exposes a REST API for tool execution, approvals, and audit queries.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health check — returns `{ name, version }` |
| `GET` | `/api/tools` | List all registered tools with risk metadata |
| `GET` | `/api/tools/:name` | Get a single tool's metadata |
| `POST` | `/api/execute` | Execute a tool call — `{ toolName, arguments, approvalId? }` |
| `GET` | `/api/approvals` | List pending approval grants |
| `GET` | `/api/audit` | Query audit log — `?toolName=&eventType=&since=&limit=` |
| `GET` | `/api/stats` | Runtime stats — executed, failed, denied, pending approvals |

## Execute Response

The `/api/execute` endpoint returns an outcome envelope:

```json
{
  "outcome": {
    "state": "COMPLETED",
    "reasonCode": null,
    "retryable": false,
    "requiresUser": false,
    "safeToContinue": true,
    "nextAction": null,
    "data": { "events": [...] }
  },
  "approvalRequired": false,
  "approvalGrantId": null
}
```

When approval is required, the response includes `approvalGrantId` for the retry call.
