# Architecture — Ananke Outcome Gateway

## Overview

Ananke sits between AI clients and MCP servers/tools, providing a thin execution-control layer. It is not a replacement for MCP — it is a safety, audit, and recovery wrapper around MCP tool calls.

## Core Flow

```text
AI Client
  ↓
Ananke Gateway
  ├─ 1. Tool Registry lookup
  ├─ 2. Risk Classification
  ├─ 3. Policy Evaluation
  ├─ 4. Approval Check (if required)
  ├─ 5. Execution Wrapper
  ├─ 6. Outcome Classification
  └─ 7. Audit Log
  ↓
MCP Server / Tool
```

## Safe Read Path

```text
AI Client → Gateway → [ALLOW] → Tool → Outcome → AI Client
```

Latency target: < 50ms added.

## Risky Write Path

```text
AI Client → Gateway → [REQUIRE_APPROVAL] → Human → Approve → Gateway → [VERIFY HASH] → Tool → Outcome → AI Client
```

The hash verification ensures the exact approved content is what executes.

## Components

### Tool Registry
Stores metadata about all available tools: name, server, input schema, risk class, permissions, approval requirements.

### Risk Classifier
Classifies tools into risk levels (READ_ONLY through UNKNOWN). In MVP, this reads from the registry. Future phases may infer risk from tool schemas.

### Policy Engine
Evaluates whether a call should be ALLOWED, DENIED, or REQUIRE_APPROVAL based on risk class and configurable policy.

### Approval Engine
Manages the human approval queue. Approvals are bound to exact canonical call content via SHA-256 hashing.

### Execution Wrapper
Calls the underlying tool and captures structured results (success, failure, timeout, auth error, etc.).

### Outcome Classifier
Converts raw tool results into structured outcome envelopes with machine-readable state, reason codes, retryability, and next-action guidance.

### Audit Log
Records every event: tool call requested, policy checked, approval requested/granted/denied, tool executed/failed, outcome generated.

### Dashboard
Developer-facing UI showing recent calls, approval queue, and audit details.

## Design Principles

1. **Safe reads pass through** with minimal latency.
2. **Risky writes are gated** behind approval.
3. **Failures are machine-readable** with reason codes and recovery hints.
4. **Approvals bind to exact content** — not intent.
5. **Every side effect is auditable.**
6. **Milliseconds, not seconds** of overhead (no human in loop).
7. **Fail closed** for dangerous actions when uncertain.
