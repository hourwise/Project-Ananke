# Architecture

Ananke is an AI governance runtime built as a set of focused engines, not a monolithic gateway.

MCP connects tools. Ananke governs execution. Governance claims apply only to calls routed through Ananke.

Ananke is not an MCP gateway replacement. Gateways handle discovery, routing, identity, auth, quotas, and traffic control. Ananke handles governed execution after a request reaches the runtime boundary.

## Engine Overview

| Engine | Package | Purpose |
|--------|---------|---------|
| **Runtime Core** | `@ananke/runtime-core` | Orchestrates all engines; HTTP server, tool registry, risk classifier |
| **Authority Engine** | `@ananke/authority-engine` | Canonical hashing, approval binding, human approval gating |
| **Policy Engine** | `@ananke/policy-engine` | Deterministic action policy evaluation by risk class and the Phase 2 content-preflight policy foundation |
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

## Ecosystem Position

Ananke is designed to run alongside sibling ecosystem projects:

- Project Mnemosyne: complementary runtime expected to run alongside Ananke.
- Project Runtime Contracts: shared protocol, types, schemas, constants, and interfaces used across runtimes.

Runtime Contracts is intentionally not a runtime layer. It should not contain engines, persistence, policies, databases, or runtime behavior.

The intended layering is:

```
AI Agent
   |
Gateway / routing layer
   |
Protocol compatibility check
   |
Ananke execution governance
   |
Mnemosyne persistent knowledge
   |
MCP servers / tools / APIs
```

This layering is provisional. The stable architectural requirement is separation of concerns: routing infrastructure should not replace execution governance, and memory/runtime failures must not bypass authority controls.

Runtime compatibility should be checked before combined execution. A client, coordinator, or future runtime should be able to compare runtime identity and `ProtocolVersion` values and reject incompatible combinations before tool execution starts.
