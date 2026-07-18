# Approval Binding

> Approval is not approval of intent. Approval is approval of one exact action by one authenticated human for one authenticated execution context.

## How It Works

1. An authenticated human/service workload and distinct acting agent propose a server/tool call with arguments.
2. If the tool requires approval, Ananke serializes the complete action into canonical JSON.
3. Ananke hashes server identity, tool identity, canonical arguments, authenticated principal, acting agent, represented principal when present, tenant/project/workspace, structured resource scope, purpose, agent session, policy version, stable action ID when supplied, and expiry into `actionHash`.
4. Authenticated human principal and session are added to `bindingHash` when approval is granted.
5. The agent retries with the `approvalId`.
6. Ananke re-hashes the complete proposed action and verifies the human binding.
7. If identical, the tool executes. If different, Ananke returns `APPROVAL_INVALIDATED`.

## Why Canonical Hashing

Without canonicalization, two logically identical calls might produce different hashes due to object key ordering:

```json
{"to":"bob","body":"hi"}
{"body":"hi","to":"bob"}
```

Ananke sorts object keys before hashing, so both payloads bind to the same approval.

## Current Canonicalization Scope

The current implementation accepts a strict JSON-shaped payload profile with sorted object keys. It is not a full implementation of RFC 8785 / JSON Canonicalization Scheme.

Current behavior:

- Object keys are sorted recursively.
- Array order is preserved.
- `null` and missing fields are different.
- Whitespace inside strings is preserved.
- JavaScript numbers `1` and `1.0` hash the same because they are the same numeric value.
- Unicode strings are not normalized; composed and decomposed forms hash differently.
- Payloads reject `undefined`, `NaN`, infinities, negative zero, `bigint`, functions, and symbols rather than coercing or omitting them.
- Payloads reject dates and other non-plain objects, sparse arrays, custom array properties, accessors, non-enumerable properties, and cyclic or shared object references.

Rejecting these values prevents a JavaScript executor from receiving arguments whose semantics differ from the JSON payload a human approved. Callers must convert supported input to plain JSON data before requesting approval.

Future work should either adopt RFC 8785-compatible canonicalization or formally define an Ananke canonical payload profile for all supported client languages.

## Security Property

Changing any bound field invalidates approval. This includes a single byte of argument content (including whitespace inside a string), server or tool identity, either principal, represented principal, tenant/project/workspace, resource scope, purpose, session, policy version, stable action ID, or expiry. Grants are bounded and one-time use.

`requestId` and `causationId` are per-attempt observational correlation fields and are excluded from approval binding so an approved action can be retried with a fresh request ID. A supplied stable `actionId` is authority-relevant and is bound. `correlationId` is retained for traceability but does not turn a retried action into a different approval.
