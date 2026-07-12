# Roadmap

**Status:** Solid Phase 1 prototype. 75 tests pass, all 7 must-pass safety scenarios are verified, and the filesystem MCP demo proves read/write approval over stdio. Not yet production-hardened.

**Requirements baseline:** [Project Ananke Research and Requirements](PROJECT_ANANKE_RESEARCH_AND_REQUIREMENTS.md).

## What Is Solid

| Area | State |
|------|-------|
| Outcome envelope | 7 typed states, 13 reason codes, recovery guidance on every failure |
| Approval binding | SHA-256 over deterministic canonical JSON, hash mismatch blocks execution |
| Policy engine | Deterministic risk-class-based defaults, configurable per tool and policy file |
| Audit log | In-memory and SQLite backends, pluggable via `IAuditLog` |
| MCP adapter | Stdio client adapter with local filesystem and official Everything and Memory reference-server coverage |
| Testbench | 7 must-pass scenarios across 5 domains, 75 tests |
| CI | Build, unit tests, scenario benchmark, and filesystem MCP demo on push |

## In Progress

| Area | Priority |
|------|----------|
| MCP adapter validation | Automated real-stdio coverage for the filesystem demo plus pinned official Everything and Memory reference servers; broader matrix still desirable |
| Validation reporting | Generate downloadable JSON/CSV reports for local and CI runs |
| Ecosystem compatibility plan | Prepare Ananke + Mnemosyne + Runtime Contracts validation shape |
| Environment check | Implemented locally and in CI; expand into guided remediation later |
| Agent SDK | Client library wrapping the agent loop for Claude/GPT/Gemini |
| CI hardening | Filesystem, Everything, and Memory MCP adapter tests run in CI; add further server families as needed |

## Next Milestone

Make Phase 1 serious, narrow, testable, and honest about its boundaries:

1. Keep the filesystem MCP demo reliable and documented.
2. Document no-bypass/chokepoint deployment requirements.
3. Expand canonical hashing tests and document limitations.
4. Harden approval dashboard authentication, session identity, and operator audit metadata.
5. Only then start content preflight and information-flow enforcement design.

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
| Approval dashboard flow | Implemented: pending queue, approve/reject API, readable arguments, canonical payload, hash display |
| Dashboard auth/RBAC | Implemented: OIDC JWT verification, development-token mode, deny-by-default roles, endpoint permissions, authenticated operator identity, spoofing tests, and audit metadata |
| Session lifecycle hardening | Future: IdP login/logout integration, immediate revocation, durable sessions, rotation workflows, and operator lifecycle controls |
| Policy file loading | Implemented: auto-discovery for `ananke.policy.yaml`, `ananke.policy.yml`, and `ananke.policy.json` |
| Expanded governance risk classes | Implemented: credential access, network egress, skill installation, and model-provider change require approval by default |
| Audit query API | Implemented: authenticated HTTP query API with validated filters and bounded pagination |
| Validation report export | Implemented for scenario benchmark and filesystem demo JSON/CSV |
| Development toolchain security | Implemented: Vitest 4.1.10 and Vite 8.1.4; `npm audit` reports zero vulnerabilities |
| GitHub report workflow | Future Phase 1 hardening: user-approved anonymised report submission |

## Ecosystem Build Plan

Ananke is part of a broader ecosystem with [Project Mnemosyne](https://github.com/hourwise/Project-Mnemosyne) and [Project Runtime Contracts](https://github.com/hourwise/project-runtime-contracts).

### Ecosystem Phase 1: Ananke Validation Surface

| Work | Status |
|------|--------|
| Unit tests | Implemented |
| Scenario benchmark | Implemented and wired into CI |
| Filesystem MCP demo | Implemented, wired into CI, exports JSON/CSV report |
| One-command quick validation | Implemented: `npm run validate:quick` |
| Environment preflight | Implemented: `npm run validate:env`, exports JSON/CSV report |
| Validation report schema | Implemented locally in testbench; move to Runtime Contracts after stabilization |
| JSON/CSV report export | Implemented for scenario benchmark and filesystem demo |
| Downloadable local report artifact | Implemented for CI scenario benchmark |
| GitHub issue/discussion report generation | Future |

### Ecosystem Phase 2: Runtime Contracts

Runtime Contracts should become the shared home for stable cross-runtime contracts once they are defined. It must remain contracts-only: types, schemas, enums, constants, protocol definitions, and small runtime-agnostic helpers only.

Runtime Contracts must not contain engines, databases, persistence, policies, retrieval, reliability scoring, context packs, memory stores, or runtime behavior.

| Contract | Purpose |
|----------|---------|
| Runtime identity | Standard `runtime`, `version`, and `protocolVersion` declaration |
| Protocol version | Fast deterministic compatibility negotiation before execution |
| Runtime names | Stable names for Ananke, Mnemosyne, Moirae Code, and third-party runtimes |
| Validation report schema | Shared JSON/CSV shape for Ananke, Mnemosyne, and combined runs |
| Capability manifest | Describes runtime capabilities, versions, and compatibility |
| Health contract | Standard readiness and environment checks |
| Audit/event contract | Shared event fields for cross-runtime correlation |
| Outcome/decision contract | Shared result vocabulary where appropriate |

Build order:

1. Define stable runtime identity and protocol version contracts.
2. Define validation report schema for Ananke local/CI runs.
3. Move report schema into Runtime Contracts once stable.
4. Add Ananke compatibility check against Runtime Contracts.
5. Add Mnemosyne compatibility check when Mnemosyne exposes a stable runnable surface.
6. Add combined Ananke + Mnemosyne validation after both runtimes consume the same contract package.

### Ecosystem Phase 3: Mnemosyne Compatibility

Once Mnemosyne has a stable runnable surface, add combined validation suites:

| Test Area | Requirement |
|-----------|-------------|
| Startup/shutdown | Ananke and Mnemosyne can start and stop without ordering hazards |
| Port/config isolation | No port, env var, or config collisions |
| SQLite/storage isolation | No database lock conflicts or accidental shared writes |
| Namespace isolation | MCP tool names and memory namespaces do not collide |
| Failure isolation | Ananke failure must not corrupt Mnemosyne memory |
| Authority isolation | Mnemosyne failure must not bypass Ananke authority |
| Audit ordering | Cross-runtime events can be correlated in order |

### Ecosystem Phase 4: Future Coordination

A future coordinator may become useful for service discovery, runtime registration, capability negotiation, health, policies, and version compatibility.

Do not start this as a Phase 1 Ananke deliverable. Let the need emerge from real Ananke, Mnemosyne, and Runtime Contracts integration work.

## Phase 2: Information-Flow Governance

Phase 2 governs what information may be read, shown, stored, or passed into another tool.

| Area | Why it matters |
|------|----------------|
| Content preflight observations | A safe action does not imply safe content; policy needs deterministic evidence about what was scanned |
| Content-sensitive read classification | `filesystem.read_file` may be safe for `notes.txt` and unsafe for `.env` |
| Content exposure decisions | Policy should distinguish derived-only, sanitized metadata, selected content, and full content |
| Approval binding for content | Human approval must bind to content hash, observation ID, exposure level, destination, and purpose |
| Information-flow control | Prevent sensitive outputs from flowing into unsafe tools or prompts |
| Tool description sanitisation | Tool metadata can carry prompt-injection content or misleading instructions |
| Tool result poisoning protection | Tool outputs can manipulate downstream agent reasoning |
| Secret and executable-content handling | Policies need first-class responses for secrets, scripts, macros, type mismatches, and scan failure |
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
