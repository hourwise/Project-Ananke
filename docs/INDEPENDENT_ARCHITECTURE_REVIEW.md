# Independent Architecture Review

This document records external design review input from multiple AI systems. These are not testimonials or marketing claims. They are engineering review notes used to clarify Phase 1 boundaries and future work.

## Summary

Reviewers broadly agreed that the Phase 1 architecture is coherent:

- Typed outcome envelopes
- Deterministic risk classes
- Hash-bound approvals
- Policy engine
- Audit logging
- MCP adapter
- Testbench

The main recurring feedback was to keep Ananke narrow and honest: MCP connects tools; Ananke governs execution; governance claims apply only to calls routed through Ananke.

## Review Observations

| Reviewer | Observation |
|----------|-------------|
| Gemini | Emphasized that Ananke should be positioned as governance around execution, not as a replacement for MCP. |
| Claude | Highlighted the need to document bypass risks and make the gateway an explicit chokepoint. |
| Copilot | Focused on developer-facing reliability: tests, demo flow, roadmap clarity, and canonical hashing edge cases. |
| ChatGPT | Recommended making Phase 1 narrow, testable, and explicit about limitations before starting information-flow control. |

## What Changed As A Result

- README now describes Ananke as an AI governance runtime for MCP-compatible and protocol-agnostic tool execution.
- Documentation now states that MCP connects tools while Ananke governs execution.
- Chokepoint/no-bypass requirements are documented explicitly.
- Risk class documentation now states the v1 limitation: risk is assigned by tool identity, not argument content.
- Roadmap now includes information-flow control, content-sensitive reads, tool description sanitisation, result poisoning protection, multi-agent authority chains, policy expressiveness, outcome schema versioning, and audit query API.
- Approval UI security requirements were added.
- Canonical hashing limitations were documented and tested.

## Open Design Risks

- A governed tool is not actually governed if the agent has a direct route to the same capability.
- Read-only tools can still expose sensitive information.
- Tool descriptions and tool results can carry prompt-injection content.
- Current canonicalization is deterministic but not RFC 8785-complete.
- Multi-agent approval and delegation semantics are not yet specified.
