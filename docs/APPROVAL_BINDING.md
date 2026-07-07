# Approval Binding

> Approval is not approval of intent. Approval is approval of exact canonical call content.

## How It Works

1. Agent proposes a tool call with arguments
2. If the tool requires approval, Ananke hashes the canonical form of the arguments (SHA-256, sorted keys)
3. Human approves the **exact hash**
4. Agent retries with the `approvalId`
5. Ananke re-hashes the arguments and compares to the approved hash
6. If identical -> execute. If different -> `APPROVAL_INVALIDATED`.

## Why Canonical Hashing

Without canonical hashing, two identical calls might produce different hashes due to key ordering:

```json
{"to": "bob", "body": "hi"}  -> hash A
{"body": "hi", "to": "bob"}  -> hash B  (different!)
```

Canonical JSON sorts keys alphabetically before hashing, so both produce the same hash.

## Security Property

Changing a single byte of the approved arguments - even a space in the email body - invalidates the approval. There is no way to "slightly modify" an approved call.
