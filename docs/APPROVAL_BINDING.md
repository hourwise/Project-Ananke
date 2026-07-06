# Approval Binding

> Approval is not approval of intent. Approval is approval of exact canonical call content.

## How It Works

1. A risky tool call is proposed with specific arguments.
2. The runtime hashes the canonical form of those arguments (SHA-256).
3. A human reviews and approves the **exact** call content.
4. The agent retries with the same arguments + the approval grant ID.
5. The runtime re-hashes the arguments and compares against the stored hash.
6. If the hashes match → execute. If they differ → block.

## Canonical JSON

Arguments are serialized to deterministic JSON before hashing:

- Object keys are sorted alphabetically.
- No extraneous whitespace.
- Nested objects are also key-sorted.

This ensures that logically identical arguments produce the same hash regardless of key order:

```typescript
hashCanonicalCall({ name: "Alice", age: 30 })
  === hashCanonicalCall({ age: 30, name: "Alice" })  // true
```

## Hash Verification

```typescript
verifyApprovalBinding(
  { to: "bob@example.com", body: "Approved content" },   // approved
  { to: "bob@example.com", body: "Approved content" },   // retried
) // → true

verifyApprovalBinding(
  { to: "bob@example.com", body: "Approved content" },   // approved
  { to: "bob@example.com", body: "Injected content" },   // retried
) // → false
```

## Security Properties

- **Content binding:** A change of even one character invalidates approval.
- **No replay:** Each approval grant can be used only once.
- **Expiry support:** Approvals can have expiration timestamps.
- **Non-repudiation:** The audit log records who approved what and when.
