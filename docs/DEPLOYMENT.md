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

## Connecting to MCP Servers

See the [Quick Start](../README.md#quick-start) in the README for a complete example using the MCP adapter.
