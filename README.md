# Project Ananke

> Intelligence should never change reality without governance.

Ananke is an AI governance runtime that sits between agents and tools, enforcing policy, approval, auditability, and recoverable outcomes.

Ananke is built for MCP-compatible and protocol-agnostic tool execution. MCP connects tools. Ananke governs execution. It does not replace MCP; it adds a governance chokepoint around tool calls, whether those tools are reached through MCP, local adapters, APIs, CLIs, databases, or other execution transports.

---

## Why Ananke Exists

MCP solved tool access. It did not solve governed execution.

Today, agents often receive only `Success` or `Failure`. That is not enough when a tool can change files, send messages, deploy software, modify permissions, or expose sensitive information.

Ananke wraps governed tool calls in structured outcome envelopes. Safe reads pass through immediately. Risky writes are gated behind hash-bound human approval. Every governed action is audited. Failures are recoverable, typed, and explicit.

```
MCP-compatible tool access         Ananke governed execution
--------------------------         --------------------------
Agent -> MCP server/tool           Agent -> Ananke Gateway
                                            |
                                            v
                                          Policy
                                            |
                                            v
                                         Approval
                                            |
                                            v
                                          Outcome
                                            |
                                            v
                                           Audit
                                            |
                                            v
                                      MCP server/tool/API/CLI
```

---

## Chokepoint Requirement

Ananke only enforces governance when tools are reachable exclusively through the Ananke Gateway.

If an agent has direct access to the same MCP server, API key, CLI, database, or stdio handle, Ananke cannot govern that path.

Operationally, this means production deployments must ensure:

- Agents call Ananke, not tools directly.
- Raw credentials are held by Ananke or a controlled execution environment, not by the agent.
- MCP server stdio handles, API keys, database URLs, and shell access are not exposed through an alternate path.
- Governance claims apply only to calls routed through Ananke.

This is a security boundary, not an implementation detail.

---

## Architecture

```
AI Client -> Ananke Gateway -> MCP Server / Tool / API / CLI
                |
        +-------+--------+
        |       |        |
   Registry   Policy   Approval
        |       |        |
        +-------+--------+
                |
           Audit Log
```

Ananke is built as focused engines, not a monolithic gateway. [Full architecture ->](docs/ARCHITECTURE.md)

---

## Quick Start

```bash
npm install
npm run build
npm test                            # 45 tests
npm run demo:filesystem             # read/write approval demo over MCP stdio
npx tsx examples/mock-mcp-server/index.ts
```

## Filesystem MCP Demo

Ananke includes a real MCP stdio demo that proves safe execution and audit for filesystem tools:

1. Read file -> allowed immediately
2. Write file -> waits for approval
3. Exact approved write -> executes
4. Mutated write after approval -> blocked as `APPROVAL_INVALIDATED`
5. Every step is written to SQLite audit

Run:

```bash
npm run demo:filesystem
```

The demo starts a local MCP stdio filesystem server, connects through `McpAdapter`, routes calls through `Gateway`, and records events in `SqliteAuditLog`.

---

## Connecting MCP Tools

Ananke can govern MCP tools through the MCP adapter:

```ts
import { Gateway } from "@ananke/runtime-core";
import { McpAdapter } from "@ananke/mcp-adapter";

const gateway = new Gateway({ port: 3000 });
const adapter = new McpAdapter("filesystem", "npx", [
  "-y",
  "@modelcontextprotocol/server-filesystem",
  "/tmp",
]);
await adapter.connect();

for (const tool of await adapter.listTools()) {
  const isWrite = tool.name.includes("write");
  gateway.registerTool({
    ...tool,
    riskClass: isWrite ? "INTERNAL_WRITE" : "READ_ONLY",
    requiresApproval: isWrite,
    requiredPermissions: [],
    retryable: false,
  });
  gateway.setExecutor(tool.name, adapter.executorFor(tool.name));
}

gateway.start();
```

Ananke is not limited to MCP. The same gateway can govern protocol-agnostic executors as long as the agent cannot bypass the gateway.

---

## Current Status

Solid Phase 1 prototype. 45 tests pass across 4 test files. All 7 must-pass safety scenarios are verified. Engine architecture is stable. Not yet production-hardened.

| What works | What is next |
|-----------|--------------|
| Typed outcomes (7 states, 13 codes) | Policy file loading from YAML |
| Hash-bound approval binding | Production auth/RBAC for dashboard |
| Deterministic risk-class policy | Real MCP server validation beyond the demo |
| SQLite + in-memory audit | Agent SDK for Claude/GPT/Gemini |
| MCP stdio adapter | Scenario benchmark in CI |
| Filesystem MCP demo | Content-sensitive read governance design |
| Dashboard auth/session guard | Audit query API |

[Full roadmap ->](docs/ROADMAP.md)

---

## Documentation

| Document | Content |
|----------|---------|
| [Architecture](docs/ARCHITECTURE.md) | Engine overview and data flow |
| [The Laws of Ananke](docs/THE_LAWS_OF_ANANKE.md) | Governance design principles |
| [Security](SECURITY.md) | Phase 1 security boundary and deployment requirements |
| [Outcome Envelope](docs/OUTCOME_ENVELOPE.md) | States, reason codes, recovery |
| [Approval Binding](docs/APPROVAL_BINDING.md) | Canonical hashing and security |
| [Approval UI Security](docs/APPROVAL_UI_SECURITY.md) | Requirements for safe human approval |
| [Risk Classes](docs/RISK_CLASSES.md) | Risk levels, defaults, and v1 limitations |
| [HTTP API](docs/HTTP_API.md) | Endpoint reference |
| [Agent Integration](docs/AGENT_INTEGRATION.md) | Decision flow and TypeScript loop |
| [Deployment](docs/DEPLOYMENT.md) | Build, run, SQLite audit |
| [Vision](docs/VISION.md) | Long-term direction |
| [Roadmap](docs/ROADMAP.md) | What is solid, in progress, next |
| [Independent Architecture Review](docs/INDEPENDENT_ARCHITECTURE_REVIEW.md) | External design review input and resulting changes |
| [ADR-0028 MCP Compatibility And Governance](docs/ADR-0028-MCP-COMPATIBILITY-AND-GOVERNANCE.md) | MCP connects tools; Ananke governs execution |
| [ADR-0029 Chokepoint Enforcement](docs/ADR-0029-CHOKEPOINT-ENFORCEMENT.md) | No-bypass deployment requirement |
| [ADR-0030 Information-Flow Control](docs/ADR-0030-INFORMATION-FLOW-CONTROL.md) | Future content-sensitive governance layer |
| [ADR-0031 Approval UI Security](docs/ADR-0031-APPROVAL-UI-SECURITY.md) | Decision record for approval UI requirements |
| [ADR-0032 Canonical Payload Hashing](docs/ADR-0032-CANONICAL-PAYLOAD-HASHING.md) | Decision record for hash-bound payload approval |

---

## Community Testing

Help harden Ananke. Run the testbench against your MCP setup and submit results.

1. Fork -> run testbench -> fill [template](TEST_RESULTS_TEMPLATE.md) -> open PR
2. Connect a real MCP server using the adapter, report what breaks
3. Open an issue if an outcome state or recovery action is missing
4. Pick an engine; each is small and independently testable

[Submit results ->](test-results/)

---

## License

MIT
