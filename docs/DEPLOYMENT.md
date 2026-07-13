# Deployment

## Build

```bash
npm run build
```

This builds all engines in dependency order: schema → authority-engine → policy-engine → tool-router → audit-engine → outcome-engine → mcp-adapter → runtime-core.

## Run

```bash
# Start with in-memory audit (default)
node packages/runtime-core/dist/index.js

# Start with persistent SQLite audit
ANANKE_AUDIT_DB=./audit.db node packages/runtime-core/dist/index.js
```

The gateway listens on port 3000 by default. Set `PORT` env var to override.

## Policy File

Place `ananke.policy.yaml`, `ananke.policy.yml`, or `ananke.policy.json` in the gateway working directory to override default risk-class policy decisions.

```bash
cp ananke.policy.example.yaml ananke.policy.yaml
npm run dev:gateway
```

The gateway auto-loads the first matching file. Use `new Gateway({ policyFile: "./config/ananke.policy.yaml" })` for an explicit path, or `autoLoadPolicy: false` to disable discovery.

## Production Operator Authentication

Bundled `dev-approval-token` and `dev-execution-token` credentials are disabled unless `developmentMode: true` is explicitly configured. Never enable that switch outside localhost development. Configure operator OIDC with a dedicated audience and configure a separate production `executionAuth` workload authenticator. See [Operator Authentication and RBAC](AUTHENTICATION_AND_RBAC.md).

## Connecting to MCP Servers

See the [Quick Start](../README.md#quick-start) in the README for a complete example using the MCP adapter.
