# Approval Binding

> Approval is not approval of intent. Approval is approval of exact canonical call content.

## How It Works

1. Agent proposes a tool call with arguments.
2. If the tool requires approval, Ananke serializes the arguments into canonical JSON.
3. Ananke hashes that canonical payload with SHA-256.
4. Human approval is recorded against that hash.
5. The agent retries with the `approvalId`.
6. Ananke re-hashes the proposed arguments and compares them with the approved hash.
7. If identical, the tool executes. If different, Ananke returns `APPROVAL_INVALIDATED`.

## Why Canonical Hashing

Without canonicalization, two logically identical calls might produce different hashes due to object key ordering:

```json
{"to":"bob","body":"hi"}
{"body":"hi","to":"bob"}
```

Ananke sorts object keys before hashing, so both payloads bind to the same approval.

## Current Canonicalization Scope

The current implementation is deterministic for JavaScript values handled by `JSON.stringify` with sorted object keys. It is not a full implementation of RFC 8785 / JSON Canonicalization Scheme.

Current behavior:

- Object keys are sorted recursively.
- Array order is preserved.
- `null` and missing fields are different.
- Whitespace inside strings is preserved.
- JavaScript numbers `1` and `1.0` hash the same because they are the same numeric value.
- Unicode strings are not normalized; composed and decomposed forms hash differently.
- Non-JSON values follow `JSON.stringify` behavior and should not be used in approval payloads.

Future work should either adopt RFC 8785-compatible canonicalization or formally define an Ananke canonical payload profile for all supported client languages.

## Security Property

Changing a single byte of the approved arguments, including whitespace inside a string, invalidates approval. There is no way to slightly modify an approved call and keep the same approval binding.
