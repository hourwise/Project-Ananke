# Test Results — `<your-github-username>`

> **Date:** YYYY-MM-DD  
> **Ananke commit:** `<commit-hash>`  
> **Environment:** e.g. Node 22, macOS / Windows / Linux

---

## MCP Configuration

Paste your MCP client configuration (e.g. Claude Desktop `mcp.json`, VS Code `.mcp.json`, or custom agent config):

```json
{
  "mcpServers": {
    "ananke-gateway": {
      "command": "npx",
      "args": ["tsx", "packages/gateway/src/index.ts"],
      "env": {
        "UPSTREAM_MCP_URL": "http://localhost:3000"
      }
    }
  }
}
```

---

## Tools Under Test

List the MCP tools your server exposes. Example:

| Tool Name | Risk Class | Side Effect? | Registered in Ananke? |
|-----------|-----------|-------------|----------------------|
| `filesystem.read_file` | READ_ONLY | No | Yes |
| `slack.send_message` | EXTERNAL_SEND | Yes | Yes |
| `github.create_pr` | INTERNAL_WRITE | Yes | Yes |

---

## Scenario Results

Run the testbench and paste the summary table:

```
npx tsx packages/testbench/src/runner.ts
```

| # | Scenario | Expected | Actual | Pass? | Latency (ms) | Notes |
|---|----------|----------|--------|-------|-------------|-------|
| 1 | safe_read_allowed | ALLOW | | | | |
| 2 | external_send_requires_approval | REQUIRE_APPROVAL | | | | |
| 3 | approval_hash_match_executes | COMPLETED | | | | |
| 4 | approval_hash_mismatch_blocks | DENIED | | | | |
| 5 | timeout_typed_outcome | FAILED | | | | |
| 6 | policy_denied_no_retry | DENIED | | | | |
| 7 | prompt_injection_flagged | REQUIRE_APPROVAL | | | | |

**Summary:** `X / 7 passed`

---

## Observations

<!-- Any surprises, edge cases, performance notes, or suggestions. -->

- 
- 

---

## MCP Server Manifest (optional)

If you built a custom MCP server, paste its tool manifest:

```json
{
  "tools": [
    {
      "name": "...",
      "description": "...",
      "inputSchema": {}
    }
  ]
}
```
