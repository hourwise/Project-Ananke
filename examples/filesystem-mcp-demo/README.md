# Filesystem MCP Demo

This demo proves Ananke against a real MCP stdio transport without requiring an external server download.

It starts a small local filesystem MCP server, connects through `McpAdapter`, and runs the gateway approval flow:

1. Read file -> `COMPLETED`
2. Write file -> `WAITING_FOR_APPROVAL`
3. Retry exact write with `approvalId` -> `COMPLETED`
4. Retry mutated write with an approval for different content -> `APPROVAL_INVALIDATED`
5. Query the SQLite audit log and print every event

Run it from the repo root:

```bash
npm run demo:filesystem
```

The demo writes its workspace and SQLite database under the OS temp directory, then prints both paths.
