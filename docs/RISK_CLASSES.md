# Risk Classes

Tools are classified into risk levels that drive policy decisions.

## Risk Levels

| Level | Description | Default Policy |
|-------|-------------|----------------|
| `READ_ONLY` | No side effects; only reads data | ALLOW |
| `INTERNAL_WRITE` | Modifies internal/owned data | REQUIRE_APPROVAL |
| `EXTERNAL_SEND` | Sends data to external recipients | REQUIRE_APPROVAL |
| `DELETE` | Destroys or removes data | REQUIRE_APPROVAL |
| `PAYMENT` | Initiates financial transactions | REQUIRE_APPROVAL |
| `DEPLOYMENT` | Deploys code or infrastructure | REQUIRE_APPROVAL |
| `PERMISSION_CHANGE` | Modifies access control | REQUIRE_APPROVAL |
| `UNKNOWN` | Unclassified tool | DENY |

## Classification Rules

1. Registered tools use their declared risk class.
2. Unregistered tools default to `UNKNOWN` and are denied.

## Examples

```yaml
calendar.list_events:    READ_ONLY
gmail.send_email:        EXTERNAL_SEND
github.delete_branch:    DELETE
stripe.create_payment:   PAYMENT
vercel.deploy:           DEPLOYMENT
iam.grant_access:        PERMISSION_CHANGE
```

## Future: Automatic Classification

Later phases may infer risk from tool schemas and descriptions when metadata is not explicitly registered.
