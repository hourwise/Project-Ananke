# Project Ananke

> **Intelligence should never change reality without governance.**

Ananke is the runtime layer between AI agents and the real world. It ensures every action is authorised, auditable, and recoverable before it changes reality.

---

## Why Ananke exists

MCP solved tool **access**. It did not solve tool **execution**.

Today, agents receive `Success` or `Failure`. That is not enough.

Ananke wraps every tool call in a structured outcome that tells the agent exactly what happened, why, and what to do next. Safe reads pass through instantly. Risky writes are gated behind hash-bound human approval. Everything is audited. Nothing fails silently.

```
MCP                                    Ananke
────                                   ──────
AI                                     AI
 │                                      │
 ▼                                      ▼
Tool                                  Policy
 │                                      │
 ▼                                      ▼
Response                             Authority
                                       │
                                       ▼
                                     Approval
                                       │
                                       ▼
                                     Outcome
                                       │
                                       ▼
                                     Audit
                                       │
                                       ▼
                                      Tool
```

---

## Architecture

```
AI Client -> Ananke Gateway -> MCP Server / Tool
                |
        +-------+--------+
        |       |        |
   Registry   Policy   Approval
        |       |        |
        +-------+--------+
                |
           Audit Log
```

Ananke is built as ten focused engines, not a monolithic gateway. [Full architecture ->](docs/ARCHITECTURE.md)

---

## Quick Start

```bash
npm install
npm run build
npm test                            # 30 tests
npx tsx examples/mock-mcp-server/index.ts
```

The gateway starts on port 3000. Connect a real MCP server:

```ts
import { Gateway } from "@ananke/runtime-core";
import { McpAdapter } from "@ananke/mcp-adapter";

const gateway = new Gateway({ port: 3000 });
const adapter = new McpAdapter("filesystem", "npx",
  ["-y", "@anthropic/mcp-server-filesystem", "/tmp"]);
await adapter.connect();

for (const tool of await adapter.listTools()) {
  gateway.registerTool({ ...tool,
    riskClass: tool.name.includes("write") ? "INTERNAL_WRITE" : "READ_ONLY",
    requiresApproval: tool.name.includes("write"),
    requiredPermissions: [], retryable: false,
  });
  gateway.setExecutor(tool.name, adapter.executorFor(tool.name));
}

gateway.start();
```

---

## Current Status

**Solid prototype.** 30 tests pass across 4 test files. All 7 must-pass safety scenarios verified. Engine architecture stable. Not yet production-hardened.

| What works | What is next |
|-----------|-------------|
| Typed outcomes (7 states, 13 codes) | MCP adapter validation with real servers |
| Hash-bound approval binding | Agent SDK for Claude/GPT/Gemini |
| Deterministic policy engine | Approval action flow in dashboard |
| SQLite + in-memory audit | Policy file loading from YAML |
| CI (build + test on push) | Scenario benchmark in CI |

[Full roadmap ->](docs/ROADMAP.md)

---

## Documentation

| Document | Content |
|----------|---------|
| [Architecture](docs/ARCHITECTURE.md) | Engine overview and data flow |
| [The Laws of Ananke](docs/THE_LAWS_OF_ANANKE.md) | Seven design principles |
| [Outcome Envelope](docs/OUTCOME_ENVELOPE.md) | States, reason codes, recovery |
| [Approval Binding](docs/APPROVAL_BINDING.md) | Canonical hashing and security |
| [Risk Classes](docs/RISK_CLASSES.md) | Risk levels and default policies |
| [HTTP API](docs/HTTP_API.md) | Endpoint reference |
| [Agent Integration](docs/AGENT_INTEGRATION.md) | Decision flow and TypeScript loop |
| [Deployment](docs/DEPLOYMENT.md) | Build, run, SQLite audit |
| [Vision](docs/VISION.md) | Long-term direction |
| [Roadmap](docs/ROADMAP.md) | What is solid, in progress, next |

---

## Community Testing

Help harden Ananke. Run the testbench against your MCP setup and submit results.

1. Fork -> run testbench -> fill [template](TEST_RESULTS_TEMPLATE.md) -> open PR
2. Connect a real MCP server using the adapter, report what breaks
3. Open an issue if an outcome state or recovery action is missing
4. Pick an engine -- each is less than 200 lines and independently testable

[Submit results ->](test-results/)

---

## License

MIT