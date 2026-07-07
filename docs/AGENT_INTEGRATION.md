# Agent Integration

An agent calling Ananke follows a simple loop. The outcome envelope tells the agent exactly what to do next.

## Decision Flow

```
                    ┌─────────────────────────┐
                    │  Agent calls Ananke     │
                    │  POST /api/execute      │
                    └───────────┬─────────────┘
                                │
                    ┌───────────▼─────────────┐
                    │  Check outcome.state    │
                    └───────────┬─────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
  COMPLETED              WAITING_FOR_APPROVAL      DENIED
        │                       │                       │
  Return result          Ask human to approve     Stop. Do not retry.
  to user                Re-submit with            Reformulate or
                         approvalId               abandon.

        │                       │
  FAILED                  APPROVAL_INVALIDATED
        │                       │
  Check reasonCode.        Content was tampered.
  Retry if retryable.      Re-request approval
  Escalate if not.         from scratch.
```

## TypeScript Agent Loop

```ts
async function agentLoop(gatewayUrl: string, tool: string, args: Record<string, unknown>) {
  let approvalId: string | undefined;

  while (true) {
    const res = await fetch(`${gatewayUrl}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolName: tool, arguments: args, approvalId }),
    });
    const { outcome, approvalGrantId } = await res.json();

    switch (outcome.state) {
      case "COMPLETED":
        return outcome.data;                                                    // done

      case "WAITING_FOR_APPROVAL":
        approvalId = approvalGrantId;                                          // ask human, then loop
        console.log(`⚠️  Approval needed: ${outcome.nextAction}`);
        await waitForHumanApproval();                                           // your UI logic
        break;

      case "DENIED":
        throw new Error(`Permanently denied: ${outcome.reasonCode}`);          // stop

      case "APPROVAL_INVALIDATED":
        approvalId = undefined;                                                // re-request approval
        console.log(`🔒 Approval invalidated: ${outcome.reasonCode}`);
        break;

      case "FAILED":
        if (outcome.retryable) {
          console.log(`🔄 Retrying: ${outcome.nextAction}`);
          await sleep(1000);                                                   // backoff
          break;
        }
        throw new Error(`Unrecoverable failure: ${outcome.reasonCode}`);       // escalate
    }
  }
}
```
