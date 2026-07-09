# Policy Configuration

Ananke has deterministic default policy decisions by risk class:

| Risk class | Default decision |
|------------|------------------|
| `READ_ONLY` | `ALLOW` |
| `INTERNAL_WRITE` | `REQUIRE_APPROVAL` |
| `EXTERNAL_SEND` | `REQUIRE_APPROVAL` |
| `DELETE` | `REQUIRE_APPROVAL` |
| `PAYMENT` | `REQUIRE_APPROVAL` |
| `DEPLOYMENT` | `REQUIRE_APPROVAL` |
| `PERMISSION_CHANGE` | `REQUIRE_APPROVAL` |
| `UNKNOWN` | `DENY` |

Policy files override those defaults per tool.

## File Names

The gateway automatically loads the first policy file found in the current working directory:

1. `ananke.policy.yaml`
2. `ananke.policy.yml`
3. `ananke.policy.json`

You can also pass an explicit file path:

```ts
const gateway = new Gateway({ policyFile: "./config/ananke.policy.yaml" });
```

Set `autoLoadPolicy: false` to disable automatic discovery.

## YAML Format

```yaml
tools:
  calendar.list_events:
    risk: READ_ONLY
    approval: never

  gmail.send_email:
    risk: EXTERNAL_SEND
    approval: required
    maxRetries: 1

  github.delete_branch:
    risk: DELETE
    approval: required
```

The `tools:` root is recommended. Top-level tool mappings are also accepted for small local files.

## JSON Format

```json
{
  "tools": {
    "gmail.send_email": {
      "risk": "EXTERNAL_SEND",
      "approval": "required",
      "maxRetries": 1
    }
  }
}
```

## Supported Fields

| Field | Values | Notes |
|-------|--------|-------|
| `risk` | Any Ananke risk class | Required for schema validation |
| `approval` | `never`, `required`, `conditional` | `conditional` currently behaves as `required` |
| `condition` | String | Parsed and stored, not evaluated in Phase 1 |
| `maxRetries` | Number | Defaults to `1` |

## Phase 1 Limits

- Policy is deterministic given tool name and risk class.
- Conditions are parsed but not evaluated yet.
- YAML support is intentionally narrow: simple nested mappings only.
- Policy files do not replace chokepoint enforcement. Governance still applies only to calls routed through Ananke.
