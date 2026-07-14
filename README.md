# Project Ananke

> Intelligence should never change reality without governance.

Ananke is an AI governance runtime that sits between agents and tools, enforcing policy, approval, auditability, and recoverable outcomes.

Ananke is built for MCP-compatible and protocol-agnostic tool execution. MCP connects tools. Ananke governs execution. It does not replace MCP; it adds a governance chokepoint around tool calls, whether those tools are reached through MCP, local adapters, APIs, CLIs, databases, or other execution transports.

---

## Why Ananke Exists

MCP solved tool access. It did not solve governed execution.

Today, agents often receive only `Success` or `Failure`. That is not enough when a tool can change files, send messages, deploy software, modify permissions, or expose sensitive information.

Ananke wraps governed tool calls in structured outcome envelopes. Read-only actions can be allowed quickly, but read-only classification does not automatically make returned content safe. Risky writes are gated behind hash-bound human approval. Every governed action is audited. Failures are recoverable, typed, and explicit.

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
- If the same agent session can still reach a governed capability through an IDE extension, terminal, shell, local credential, or alternate network path, that path bypasses Ananke.
- Governance claims apply only to calls routed through Ananke.

This is a security boundary, not an implementation detail.

## Content Exposure Boundary

Ananke governs action execution first. Content exposure is a separate authority decision.

A tool classified as `READ_ONLY` may still return unsafe content: secrets, prompt injection, macros, hostile metadata, or oversized payloads. A safe action does not imply safe content.

The current Phase 1 runtime classifies actions by tool identity. The proposed next layer adds content preflight observations and policy decisions over exposure levels such as derived-only, selected content, and full content.

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

Requires Node.js 22.12 or newer.

```bash
npm install
npm run validate:env                 # preflight diagnostics, writes environment report
npm run validate:quick               # build, tests, benchmark, filesystem demo, reports
npm run build
npm test                            # 108 tests
npm run test:bench                  # writes validation-reports/*.json and *.csv
npm run demo:filesystem             # MCP demo, also writes validation-reports/*.json and *.csv
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

It also writes:

- `validation-reports/filesystem-demo-report.json`
- `validation-reports/filesystem-demo-report.csv`

---

## Connecting MCP Tools

Ananke can govern MCP tools through the MCP adapter:

```ts
import { Gateway } from "@ananke/runtime-core";
import { McpAdapter } from "@ananke/mcp-adapter";

const gateway = new Gateway({
  port: 3000,
  developmentMode: true, // known local credentials; never enable in production
  embeddedExecutionContext: {
    agentPrincipalId: "local-demo-agent",
    tenantId: "local-demo",
    resourceScope: "filesystem:/tmp",
    sessionId: "local-demo-session",
  },
});
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

## Ecosystem

Ananke is being developed as part of a small runtime ecosystem:

- [Project Ananke](https://github.com/hourwise/Project-Ananke): execution governance, approval binding, auditability, and recoverable outcomes.
- [Project Mnemosyne](https://github.com/hourwise/Project-Mnemosyne): sister project built in the same repository format and intended to run alongside Ananke.
- [Project Runtime Contracts](https://github.com/hourwise/project-runtime-contracts): shared protocol, types, schemas, constants, and interfaces used across runtimes.

The projects are separate runtimes with complementary responsibilities. Ananke focuses on governed tool execution: policy, approval, auditability, and recoverable outcomes. Mnemosyne is expected to run alongside Ananke rather than replace it. Runtime Contracts is not a runtime; it is the contracts-only package for protocol compatibility, runtime identity, version negotiation, shared schemas, and stable interfaces.

Runtime Contracts should not contain engines, persistence, policies, databases, or runtime behavior. Those remain inside Ananke, Mnemosyne, or future runtimes.

---

## Current Status

Solid Phase 1 prototype. 108 tests pass across 13 test files. All must-pass safety scenarios are verified. Engine architecture is stable. Not yet production-hardened.

| What works | What is next |
|-----------|--------------|
| Typed outcome schema (8 states, 28 codes, including content-preflight outcomes) | Real MCP server validation beyond the demo |
| Full action/principal/scope/session/policy/expiry approval binding | Production workload identity integration |
| Deterministic risk-class policy | MCP adapter validation |
| Centrally sanitized SQLite + in-memory audit | Agent SDK for Claude/GPT/Gemini |
| MCP stdio adapter | Production-grade MCP server matrix |
| Filesystem MCP demo and opt-in content-preflight enforcement with durable approval receipts | Source-aware scanners, receipt revocation, and downstream destination enforcement |
| Authenticated execution context plus OIDC operator RBAC/session lifecycle | IdP end-session/BFF integration and operator lifecycle controls |
| Policy file loading | Policy expressiveness |

[Full roadmap ->](docs/ROADMAP.md)

---

## Documentation

| Document | Content |
|----------|---------|
| [Architecture](docs/ARCHITECTURE.md) | Engine overview and data flow |
| [Threat Model](docs/threat-model.md) | Scope, trust boundaries, threats, mitigations, residual risks, and open questions |
| [The Laws of Ananke](docs/THE_LAWS_OF_ANANKE.md) | Governance design principles |
| [Security](SECURITY.md) | Phase 1 security boundary and deployment requirements |
| [Deployment Assumptions](docs/security/deployment-assumptions.md) | What must be true in deployment for Ananke governance claims to hold |
| [Outcome Envelope](docs/OUTCOME_ENVELOPE.md) | States, reason codes, recovery |
| [Approval Binding](docs/APPROVAL_BINDING.md) | Canonical hashing and security |
| [Approval UI Security](docs/APPROVAL_UI_SECURITY.md) | Requirements for safe human approval |
| [Operator Authentication and RBAC](docs/AUTHENTICATION_AND_RBAC.md) | OIDC JWT verification, roles, and endpoint permissions |
| [Risk Classes](docs/RISK_CLASSES.md) | Risk levels, defaults, and v1 limitations |
| [Content Preflight Contract](docs/CONTENT_PREFLIGHT_CONTRACT.md) | Phase 2 observation, exposure, decision, and approval-binding foundation |
| [Policy Configuration](docs/POLICY_CONFIGURATION.md) | `ananke.policy.yaml` and JSON policy overrides |
| [HTTP API](docs/HTTP_API.md) | Endpoint reference |
| [Agent Integration](docs/AGENT_INTEGRATION.md) | Decision flow and TypeScript loop |
| [Gateway Contract](docs/integration/gateway-contract.md) | Formal execution lifecycle, approval checks, outcomes, and audit stages |
| [Failure Recovery](docs/operations/failure-recovery.md) | What each outcome means, what to do next, and where current behaviour differs from public schema |
| [Retry and Idempotency](docs/operations/retry-and-idempotency.md) | Current retry ownership, approval reuse rules, and unresolved duplicate-execution semantics |
| [Deployment](docs/DEPLOYMENT.md) | Build, run, SQLite audit |
| [Vision](docs/VISION.md) | Long-term direction |
| [Project Research and Requirements](docs/PROJECT_ANANKE_RESEARCH_AND_REQUIREMENTS.md) | Scope, requirements, acceptance evidence, and deferred decisions |
| [Roadmap](docs/ROADMAP.md) | What is solid, in progress, next |
| [Decisions Index](docs/decisions/README.md) | Accepted and proposed ADRs in one place |
| [Independent Architecture Review](docs/INDEPENDENT_ARCHITECTURE_REVIEW.md) | External design review input and resulting changes |
| [ADR-0028 MCP Compatibility And Governance](docs/ADR-0028-MCP-COMPATIBILITY-AND-GOVERNANCE.md) | MCP connects tools; Ananke governs execution |
| [ADR-0029 Chokepoint Enforcement](docs/ADR-0029-CHOKEPOINT-ENFORCEMENT.md) | No-bypass deployment requirement |
| [ADR-0030 Information-Flow Control](docs/ADR-0030-INFORMATION-FLOW-CONTROL.md) | Future content-sensitive governance layer |
| [ADR-0031 Approval UI Security](docs/ADR-0031-APPROVAL-UI-SECURITY.md) | Decision record for approval UI requirements |
| [ADR-0032 Canonical Payload Hashing](docs/ADR-0032-CANONICAL-PAYLOAD-HASHING.md) | Decision record for hash-bound payload approval |
| [ADR-0033 Frictionless Validation And Ecosystem Compatibility](docs/ADR-0033-FRICTIONLESS-VALIDATION-AND-ECOSYSTEM-COMPATIBILITY.md) | Decision record for validation reports and ecosystem compatibility |
| [ADR-XXXX Content Preflight Policy Enforcement](docs/ADR-XXXX-ananke-content-preflight-policy-enforcement.md) | Decision record for content exposure policy and preflight observations |
| [ADR-XXXX Dual-Principal MCP Delegation And Compatibility](docs/ADR-XXXX-dual-principal-mcp-delegation-and-compatibility.md) | Proposed dual-principal MCP delegation and cross-runtime compatibility |

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
