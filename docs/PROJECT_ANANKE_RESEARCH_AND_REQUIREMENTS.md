# Project Ananke — Research Additions and Requirements

## Purpose

Ananke governs permissions, approvals, side effects, outcomes, and auditability across agents and runtimes.

It does not make agents intelligent. It makes their actions authorised, bounded, attributable, reviewable, and auditable.

## Governed Agent Skills

Before installation and execution, classify:
- filesystem access
- network access
- secrets
- shell execution
- package installation
- destructive commands
- external sends
- deployment
- permission changes
- self-modification
- update mechanism
- provenance and licence

```ts
type SkillTrustState = "unreviewed" | "verified" | "restricted" | "blocked";
```

A portable skill format never implies authority.

## Approval binding

Approval should bind to:
- exact skill ID and version
- source revision
- input
- target
- capability
- environment
- side effect
- expiry

A changed skill revision invalidates approval.

```ts
interface SkillApprovalBinding {
  skillId: string;
  skillVersion: string;
  sourceRevision: string;
  inputHash: string;
  targetHash?: string;
  capability: string;
  expiresAt: string;
}
```

## Sandbox-aware execution

```ts
type IsolationLevel =
  | "host"
  | "process"
  | "container"
  | "microvm"
  | "remote-sandbox";
```

Execution records should include isolation level, provider, file scope, network policy, limits, injected secrets, timings, exit state, output references, evidence, and cleanup status.

Policy does not replace sandboxing; sandboxing does not replace policy.

## Network and credentials

Future sandbox adapters should support:
- domain allowlists
- egress logging
- runtime credential injection
- credentials excluded from prompts
- credentials excluded from memory
- task-limited credential lifetime
- revocation on completion

Silent model/provider fallback is a policy-significant event.

## Voice and ambiguous intent

Ananke should require confirmation for ambiguous commands involving:
- external messages
- payments
- deletion
- rota or schedule changes
- compliance advice
- legal-time calculations
- driver/vehicle reassignment
- permission changes

```ts
interface TranscriptIntent {
  transcript: string;
  confidence?: number;
  alternatives?: string[];
  requiresConfirmation: boolean;
}
```

## Browser-agent governance

```text
Observe interface
      ↓
Propose action
      ↓
Classify risk
      ↓
Approve if required
      ↓
Execute exact action
      ↓
Capture evidence
      ↓
Return typed outcome
```

Browser actions should identify page origin, control, intended effect, destructive status, tenant-scope check, before-state, and after-state evidence.

## Expanded risk classes

```ts
type RiskClass =
  | "READ_ONLY"
  | "INTERNAL_WRITE"
  | "EXTERNAL_SEND"
  | "DELETE"
  | "PAYMENT"
  | "DEPLOYMENT"
  | "PERMISSION_CHANGE"
  | "CREDENTIAL_ACCESS"
  | "NETWORK_EGRESS"
  | "SKILL_INSTALL"
  | "MODEL_PROVIDER_CHANGE"
  | "UNKNOWN";
```

## Laws of Ananke

1. No capability implies authority.
2. Approval binds to the exact intended action.
3. Mutation invalidates approval.
4. Unknown risk is denied by default.
5. Every side effect returns a typed outcome.
6. Credentials are never authority-bearing instructions.
7. Sandboxing does not replace policy.
8. Policy does not replace sandboxing.
9. Ambiguous human intent is confirmed before meaningful side effects.
10. Every governed action remains attributable and auditable.

## Recommended next work

- skill trust and installation policy
- sandbox-neutral execution fields
- credential and egress policy
- voice-intent confirmation
- browser-action evidence schema
- provider-change risk class
- malicious-skill tests
- approval invalidation after skill updates
