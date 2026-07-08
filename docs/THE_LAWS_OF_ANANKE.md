# The Laws of Ananke

These laws define the Phase 1 governance model. They are implementation constraints, not branding language.

## Law I - Authority

> No side effect without authority.

An AI may reason freely. Reality changes only with authority granted through policy, approval, or a trusted execution rule.

## Law II - Explainability

> Every outcome is explainable.

A governed tool call must never return only `Tool failed`. Every failure needs a typed state, reason code, and recovery guidance.

## Law III - Content Binding

> Approval binds to content, not intention.

Approval is for the exact canonical payload. If the payload changes, the approval is invalid.

## Law IV - Frictionless Reads

> Safe reads should be frictionless.

Do not slow down intelligence unnecessarily. Read-only tools can pass through when policy allows them.

## Law V - Auditability

> Every governed action leaves durable evidence.

The audit log is part of the security model. A governed action without durable evidence is not fully governed.

## Law VI - Determinism

> Policies are deterministic given a captured input snapshot.

The same policy, tool identity, risk class, captured arguments, and relevant state snapshot must produce the same decision.

## Law VII - Model Independence

> Reasoning is replaceable. Authority is not.

The model can be GPT, Claude, Gemini, Qwen, or something else. Authority remains outside the model and is enforced by the runtime.

## Law VIII - Information Boundaries

> Information has authority too.

Reads can be dangerous when they expose secrets, private data, or privileged context. Phase 1 treats read risk by tool identity; future governance layers will classify content and information flow.

## Law IX - Chokepoint Enforcement

> A governed tool must not be directly reachable by the agent.

If an agent can bypass Ananke and call the same MCP server, API key, CLI, database, or stdio handle directly, Ananke cannot govern that path.
