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
| `WAITING_FOR_APPROVAL` | A side-effect approval is pending |
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
| `APPROVAL_REQUIRED` | Human side-effect approval is pending | Yes |
| `APPROVAL_HASH_MISMATCH` | Approved content was modified | No |
| `RESOURCE_VERSION_CHANGED` | Resource version changed | Yes |
| `UNKNOWN_FAILURE` | Unclassified failure | No |

## Content Preflight Reason Codes

When opt-in content preflight is enabled for a read result, the gateway may emit the following additional reason codes. Blocking decisions are emitted as `DENIED` and do not include raw tool output.

| Code group | Meaning |
|---|---|
| `CONTENT_PREFLIGHT_REQUIRED`, `CONTENT_SCAN_FAILED`, `CONTENT_UNSUPPORTED` | Required preflight evidence or a renderable safe surface is unavailable. |
| `CONTENT_RESOURCE_LIMIT`, `CONTENT_QUARANTINED` | Resource-risk content is quarantined. |
| `CONTENT_RISK_FLAGGED`, `CONTENT_SCRIPT_PRESENT`, `CONTENT_TYPE_MISMATCH` | A risky observation prevents release pending a safer workflow. |
| `CONTENT_SECRET_EXPOSURE`, `CONTENT_EXPOSURE_DOWNGRADED` | Only a lower derived surface may be released. |
| `CONTENT_APPROVAL_REQUIRED`, `CONTENT_APPROVAL_REJECTED`, `CONTENT_APPROVAL_INVALIDATED`, `CONTENT_RECEIPT_STALE` | Hash-bound content-approval receipt lifecycle. |

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
