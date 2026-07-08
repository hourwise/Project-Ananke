# Roadmap

**Status:** Solid Phase 1 prototype. 37 tests pass, all 7 must-pass safety scenarios are verified, and the filesystem MCP demo proves read/write approval over stdio. Not yet production-hardened.

## What Is Solid

| Area | State |
|------|-------|
| Outcome envelope | 7 typed states, 13 reason codes, recovery guidance on every failure |
| Approval binding | SHA-256 over deterministic canonical JSON, hash mismatch blocks execution |
| Policy engine | Deterministic risk-class-based defaults, configurable per tool |
| Audit log | In-memory and SQLite backends, pluggable via `IAuditLog` |
| MCP adapter | Stdio client adapter with a working filesystem demo |
| Testbench | 7 must-pass scenarios across 5 domains, 37 unit tests |
| CI | Build + test on push (Node 22, GitHub Actions) |

## In Progress

| Area | Priority |
|------|----------|
| Approval dashboard flow | Approve/reject with secure payload display |
| Policy file loading | Load risk overrides from `ananke.policy.yaml` |
| MCP adapter validation | Test with real MCP servers beyond the local demo |
| Agent SDK | Client library wrapping the agent loop for Claude/GPT/Gemini |
| CI hardening | Add repeated scenario benchmark runs to CI |

## Next Milestone

Make Phase 1 serious, narrow, testable, and honest about its boundaries:

1. Keep the filesystem MCP demo reliable and documented.
2. Document no-bypass/chokepoint deployment requirements.
3. Expand canonical hashing tests and document limitations.
4. Add approval dashboard security flow.
5. Only then start information-flow control design.

## Phase 1: Side-Effect Governance

Phase 1 governs whether a tool call may execute and whether a side effect is authorized.

| Area | Status |
|------|--------|
| Typed outcome envelopes | Implemented |
| Deterministic risk classes by tool identity | Implemented |
| Hash-bound approvals | Implemented |
| Policy engine | Implemented |
| Audit logging | Implemented |
| MCP stdio adapter | Implemented |
| Filesystem MCP demo | Implemented |
| Approval dashboard flow | Next |
| Policy file loading | Next |
| Audit query API | Future Phase 1 hardening |

## Phase 2: Information-Flow Governance

Phase 2 governs what information may be read, shown, stored, or passed into another tool.

| Area | Why it matters |
|------|----------------|
| Content-sensitive read classification | `filesystem.read_file` may be safe for `notes.txt` and unsafe for `.env` |
| Information-flow control | Prevent sensitive outputs from flowing into unsafe tools or prompts |
| Tool description sanitisation | Tool metadata can carry prompt-injection content or misleading instructions |
| Tool result poisoning protection | Tool outputs can manipulate downstream agent reasoning |
| Data labels and scopes | Policies need to distinguish public, private, secret, and regulated data |

## Phase 3: Multi-Agent Authority Chains

Phase 3 governs delegation, provenance, and approval across multiple agents and sessions.

| Area | Why it matters |
|------|----------------|
| Multi-agent authority chains | Approval and delegation need provenance across agents and sessions |
| Approving user/session model | Human authority must be traceable across workflows |
| Delegated approval scopes | One actor may approve a bounded subset of future actions |
| Cross-agent audit correlation | Operators need to reconstruct who caused which governed action |

## Cross-Phase Future Work

| Area | Why it matters |
|------|----------------|
| Policy expressiveness | Static risk defaults need conditions, scopes, subject identity, and environment state |
| Outcome schema versioning | Agents need stable contracts as outcome envelopes evolve |
| Approval UI security | Humans must approve readable content while hashes bind exact executable payloads |
| RFC 8785-compatible canonicalization | Cross-language clients need standard canonical payload hashing |
