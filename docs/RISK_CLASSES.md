# Risk Classes

Ananke classifies every tool into a risk level. The risk class determines the default policy decision.

| Risk Class | Default Policy | Example |
|-----------|---------------|---------|
| `READ_ONLY` | ALLOW | `calendar.list_events`, `filesystem.read_file` |
| `INTERNAL_WRITE` | REQUIRE_APPROVAL | `github.create_pr`, `database.insert` |
| `EXTERNAL_SEND` | REQUIRE_APPROVAL | `gmail.send_email`, `slack.post_message` |
| `DELETE` | REQUIRE_APPROVAL | `github.delete_branch`, `filesystem.delete` |
| `PAYMENT` | REQUIRE_APPROVAL | `stripe.charge`, `invoice.send` |
| `DEPLOYMENT` | REQUIRE_APPROVAL | `vercel.deploy`, `kubectl.apply` |
| `PERMISSION_CHANGE` | REQUIRE_APPROVAL | `iam.grant_role`, `acl.modify` |
| `UNKNOWN` | DENY | Any unregistered tool |

Override defaults per-tool via policy configuration.
