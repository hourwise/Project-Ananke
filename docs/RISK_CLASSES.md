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
| `UNKNOWN` | DENY | Any unregistered tool |

Override defaults per tool through policy configuration.

## V1 Limitation

In v1, risk class is assigned by tool identity, not argument content. For example, `filesystem.read_file` is `READ_ONLY` whether it reads `notes.txt` or `.env`. Content-sensitive reads, secret detection, data labels, and information-flow control are planned for a future governance layer.

This means Phase 1 can govern whether a tool is allowed to execute, but it does not yet inspect the sensitivity of all content flowing through otherwise read-only tools.

## Operational Guidance

- Register unknown tools as `UNKNOWN` until reviewed.
- Treat broad read tools as higher risk if they can access sensitive paths.
- Prefer narrow tools over generic shell/database/filesystem tools.
- Use policy overrides when a tool's identity alone is too coarse.
- Do not expose raw tool credentials to agents; risk classification only matters on paths that pass through Ananke.
