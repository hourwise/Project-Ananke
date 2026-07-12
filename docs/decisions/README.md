# Decisions Index

This index groups the repository's architecture decision records by current status so integrators can quickly separate accepted Phase 1 constraints from future design work.

## Accepted

| ADR | Status | Summary |
|---|---|---|
| [ADR-0028 MCP Compatibility And Governance](../ADR-0028-MCP-COMPATIBILITY-AND-GOVERNANCE.md) | Accepted for Phase 1 | MCP connects tools; Ananke governs execution and can also govern non-MCP executors |
| [ADR-0029 Chokepoint Enforcement](../ADR-0029-CHOKEPOINT-ENFORCEMENT.md) | Accepted for Phase 1 | Governance claims require exclusive routing through Ananke |
| [ADR-0031 Approval UI Security](../ADR-0031-APPROVAL-UI-SECURITY.md) | Accepted as a Phase 1 dashboard requirement | Human approval must be tied to readable payload review plus binding data |
| [ADR-0032 Canonical Payload Hashing](../ADR-0032-CANONICAL-PAYLOAD-HASHING.md) | Accepted for Phase 1 with limitations | Phase 1 approval binding uses SHA-256 over deterministic canonical JSON |
| [ADR-0033 Frictionless Validation And Ecosystem Compatibility](../ADR-0033-FRICTIONLESS-VALIDATION-AND-ECOSYSTEM-COMPATIBILITY.md) | Accepted for ecosystem planning | Validation and compatibility should become first-class ecosystem features |

## Proposed

| ADR | Status | Summary |
|---|---|---|
| [ADR-0030 Information-Flow Control](../ADR-0030-INFORMATION-FLOW-CONTROL.md) | Proposed for future work | Future governance layer for content-sensitive reads and information flow |
| [ADR-XXXX Content Preflight Policy Enforcement](../ADR-XXXX-ananke-content-preflight-policy-enforcement.md) | Proposed | Proposed policy direction for content exposure decisions and preflight observations |

## How To Read The ADR Set

- Treat accepted ADRs as current repository constraints unless later accepted decisions supersede them.
- Treat proposed ADRs as design intent, not implemented behaviour.
- Cross-check accepted ADRs against source and tests when operational details matter; several implementation-level questions remain open in Phase 1.
