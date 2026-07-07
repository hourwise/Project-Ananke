# Architecture

Ananke is built as a set of focused engines, not a monolithic gateway.

## Engine Overview

| Engine | Package | Purpose |
|--------|---------|---------|
| **Runtime Core** | `@ananke/runtime-core` | Orchestrates all engines; HTTP server, tool registry, risk classifier |
| **Authority Engine** | `@ananke/authority-engine` | Canonical hashing, approval binding, human approval gating |
| **Policy Engine** | `@ananke/policy-engine` | Deterministic policy evaluation by risk class |
| **Outcome Engine** | `@ananke/outcome-engine` | Converts raw results into structured, recoverable outcomes |
| **Audit Engine** | `@ananke/audit-engine` | Pluggable audit logging - in-memory and SQLite backends |
| **Tool Router** | `@ananke/tool-router` | Wraps tool execution, captures typed results and errors |
| **MCP Adapter** | `@ananke/mcp-adapter` | Stdio-based MCP client for real server connectivity |
| **Schema** | `@ananke/schema` | Zod schemas shared across all engines |
| **Dashboard** | `@ananke/dashboard` | React/Vite developer dashboard |
| **Testbench** | `@ananke/testbench` | Repeated-run safety scenario test harness |

## Data Flow

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

- **Safe reads** pass through with minimal latency.
- **Risky writes** are gated behind hash-bound approval.
- **Failures** are always typed, never raw.
- **Every side effect** is audited.
