# Outcome Envelope

Every tool result in Ananke is wrapped in a structured envelope. Agents never see raw failures.

## Structure

```json
{
  "state": "COMPLETED",
  "reasonCode": null,
  "retryable": false,
  "requiresUser": false,
  "safeToContinue": true,
  "nextAction": null,
  "data": { "events": [...] },
  "error": null
}
```

## Outcome States

| State | Meaning | Agent Response |
|-------|---------|---------------|
| `COMPLETED` | Tool executed successfully | Use `data` |
| `FAILED` | Execution error | Check `reasonCode`, retry if `retryable` |
| `DENIED` | Permanently blocked by policy | Stop. Reformulate or abandon. |
| `WAITING_FOR_APPROVAL` | Human approval needed | Ask human, retry with `approvalId` |
| `APPROVAL_INVALIDATED` | Approved content was modified | Re-request approval from scratch |
| `STALE_STATE` | Resource version changed | Reload and retry |
| `TIMED_OUT` | Downstream timeout | Retry with backoff |
| `PARTIAL_SUCCESS` | Some operations succeeded | Review partial results |

## Recovery Guidance

Every failed outcome includes:
- `reasonCode` — machine-readable error classification (13 codes)
- `retryable` — whether the agent should retry
- `requiresUser` — whether human intervention is needed
- `nextAction` — human-readable recovery instruction
