# Risk Classes

Ananke classifies every registered tool into a deterministic risk class. The risk class determines the default policy decision.

| Risk Class | Default Policy | Example |
|-----------|----------------|---------|
| `READ_ONLY` | ALLOW | `calendar.list_events`, `filesystem.read_file` |
| `INTERNAL_WRITE` | REQUIRE_APPROVAL | `github.create_pr`, `database.insert`, `filesystem.write_file` |
| `EXTERNAL_SEND` | REQUIRE_APPROVAL | `gmail.send_email`, `slack.post_message` |
| `DELETE` | REQUIRE_APPROVAL | `github.delete_branch`, `filesystem.delete` |
| `PAYMENT` | REQUIRE_APPROVAL | `stripe.charge`, `invoice.send` |
| `DEPLOYMENT` | REQUIRE_APPROVAL | `vercel.deploy`, `kubectl.apply` |
| `PERMISSION_CHANGE` | REQUIRE_APPROVAL | `iam.grant_role`, `acl.modify` |
| `CREDENTIAL_ACCESS` | REQUIRE_APPROVAL | `vault.read_secret`, `oauth.export_token` |
| `NETWORK_EGRESS` | REQUIRE_APPROVAL | `http.post_external`, `webhook.deliver` |
| `SKILL_INSTALL` | REQUIRE_APPROVAL | `skill.install`, `plugin.enable` |
| `MODEL_PROVIDER_CHANGE` | REQUIRE_APPROVAL | `model.switch_provider`, `model.change_endpoint` |
| `UNKNOWN` | DENY | Any unregistered tool |

Override defaults per tool through policy configuration.

## V1 Limitation

In v1, risk class is assigned by tool identity, not argument content. For example, `filesystem.read_file` is `READ_ONLY` whether it reads `notes.txt` or `.env`. The `ALLOW` default means the action may execute; it does not automatically grant full exposure of whatever content comes back.

This means Phase 1 can govern whether a tool is allowed to execute, but it does not yet inspect the sensitivity of all content flowing through otherwise read-only tools. Content preflight observations, exposure levels, and content-aware approvals are planned in [ADR-XXXX Content Preflight Policy Enforcement](ADR-XXXX-ananke-content-preflight-policy-enforcement.md).

## Operational Guidance

- Register unknown tools as `UNKNOWN` until reviewed.
- Treat broad read tools as higher risk if they can access sensitive paths.
- Prefer narrow tools over generic shell/database/filesystem tools.
- Use policy overrides when a tool's identity alone is too coarse.
- Do not expose raw tool credentials to agents; risk classification only matters on paths that pass through Ananke.
- Treat skill installation, credential access, network egress, and model-provider changes as governed side effects until a more specific policy narrows their scope.
