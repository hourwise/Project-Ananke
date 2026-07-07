# Vision

The more we build this, the less it feels like software.

MCP standardised how AI connects to tools — the TCP/IP moment for tool access. Ananke aims to do the same for **actions**: a shared, predictable runtime for *what happens after the tool is called*.

Typed outcomes. Bound approvals. Deterministic policy. Explainable failure. Auditable side effects. Model-agnostic. That's the layer we're building.

## The Explanation Engine

Not for humans. For agents.

Instead of:

```
Denied.
```

The runtime produces:

```
Reason: External email requires approval.
Recovery: Request approval for the canonical email.
Alternative: Save as draft.
```

That isn't an error. It's guidance — exception handling evolved for AI.

Ananke's outcome envelope already delivers this: every result carries `state`, `reasonCode`, `retryable`, `requiresUser`, and `nextAction`. Agents never see raw failures.
