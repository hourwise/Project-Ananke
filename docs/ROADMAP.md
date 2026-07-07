# Roadmap

**Status:** Solid prototype — 30 tests pass, all 7 must-pass safety scenarios verified. Not yet production-hardened.

## What Is Solid

| Area | State |
|------|-------|
| Outcome envelope | 7 typed states, 13 reason codes, recovery guidance on every failure |
| Approval binding | SHA-256 canonical hashing, hash mismatch blocks execution |
| Policy engine | Deterministic risk-class-based defaults, configurable per-tool |
| Audit log | In-memory and SQLite backends, pluggable via `IAuditLog` |
| Testbench | 7 must-pass scenarios across 5 domains, 30 unit tests |
| CI | Build + test on push (Node 22, GitHub Actions) |

## In Progress

| Area | Priority |
|------|----------|
| MCP adapter validation | Test with real MCP servers (filesystem, GitHub, Slack) |
| Agent SDK | Client library wrapping the agent loop for Claude/GPT/Gemini |
| Approval dashboard flow | Approve/reject from the dashboard UI |
| Policy file loading | Load risk overrides from `ananke.policy.yaml` |
| CI hardening | Add scenario benchmark (N runs) to CI |

## Next Milestone

End-to-end with one harmless read tool + one risky write tool via the MCP adapter, with an agent handling the full approval loop. Target: 100% scenario pass rate against a real MCP server.
