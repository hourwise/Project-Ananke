# Outcome Schema

Every tool call through Ananke returns a structured outcome envelope. Raw results are never returned directly to the agent.

## Outcome Envelope

```typescript
interface Outcome {
  state: OutcomeState;
  reasonCode?: FailureReasonCode;
  retryable: boolean;
  requiresUser: boolean;
  safeToContinue: boolean;
  nextAction?: string;
  data?: unknown;
  error?: string;
}
```

## Outcome States

| State | Meaning |
|-------|---------|
| `COMPLETED` | Tool executed successfully |
| `FAILED` | Tool execution failed |
| `DENIED` | Policy or approval check denied the call |
| `STALE_STATE` | Resource version changed; refresh needed |
| `APPROVAL_INVALIDATED` | Approved content was modified before execution |
| `TIMED_OUT` | Downstream server timed out |
| `PARTIAL_SUCCESS` | Some operations succeeded, some failed |

## Failure Reason Codes

| Code | Meaning | Retryable |
|------|---------|-----------|
| `VALIDATION_ERROR` | Invalid arguments | No |
| `AUTH_EXPIRED` | Authentication token expired | Yes |
| `PERMISSION_DENIED` | Insufficient permissions | No |
| `DOWNSTREAM_TIMEOUT` | Downstream server timed out | Yes |
| `RATE_LIMITED` | Rate limit exceeded | Yes |
| `STALE_STATE` | Resource version changed | Yes |
| `CONFLICT` | Resource conflict | No |
| `PARTIAL_SUCCESS` | Partial completion | Yes |
| `POLICY_DENIED` | Policy denied the action | No |
| `APPROVAL_HASH_MISMATCH` | Approved content was modified | No |
| `RESOURCE_VERSION_CHANGED` | Resource version changed | Yes |
| `UNKNOWN_FAILURE` | Unclassified failure | No |

## Example

### Successful Execution

```json
{
  "state": "COMPLETED",
  "retryable": false,
  "requiresUser": false,
  "safeToContinue": true,
  "data": { "events": [{"id": "1", "title": "Standup"}] }
}
```

### Timeout

```json
{
  "state": "FAILED",
  "reasonCode": "DOWNSTREAM_TIMEOUT",
  "retryable": true,
  "requiresUser": false,
  "safeToContinue": true,
  "nextAction": "Retry once, then report downstream unavailable."
}
```

### Policy Denied

```json
{
  "state": "DENIED",
  "reasonCode": "POLICY_DENIED",
  "retryable": false,
  "requiresUser": true,
  "safeToContinue": false,
  "nextAction": "Action denied by policy. Do not retry."
}
```
