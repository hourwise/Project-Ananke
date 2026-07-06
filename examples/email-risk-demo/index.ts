/**
 * Email Risk Demo — demonstrates the approval flow for risky tool calls.
 *
 * Shows:
 *   1. Safe read passes through.
 *   2. Risky write requires approval.
 *   3. Approved call executes.
 *   4. Modified call is blocked (hash mismatch).
 */

import { Gateway } from '../../packages/gateway/src/index.js';

async function main() {
  const gateway = new Gateway();

  // Register tools
  gateway.registerTool({
    name: 'calendar.list_events',
    server: 'demo',
    description: 'List calendar events',
    riskClass: 'READ_ONLY',
    requiresApproval: false,
  });

  gateway.registerTool({
    name: 'gmail.send_email',
    server: 'demo',
    description: 'Send an email',
    riskClass: 'EXTERNAL_SEND',
    requiresApproval: true,
  });

  // Mock executors
  gateway.setExecutor('calendar.list_events', async () => ({
    events: [{ id: '1', title: 'Project standup', time: '09:00' }],
  }));

  let sentEmail: Record<string, unknown> | null = null;
  gateway.setExecutor('gmail.send_email', async (args) => {
    sentEmail = args;
    return { sent: true, messageId: 'msg_001' };
  });

  console.log('═══ DEMO: Email Approval Flow ═══\n');

  // Step 1: Safe read
  console.log('Step 1: Safe read — calendar.list_events');
  const r1 = await gateway.execute('calendar.list_events', {});
  console.log('  →', r1.outcome.state, '|', JSON.stringify(r1.outcome.data).slice(0, 60));
  console.log();

  // Step 2: Risky write — blocked, approval requested
  console.log('Step 2: Risky write — gmail.send_email (no approval)');
  const emailArgs = { to: 'bob@example.com', subject: 'Update', body: 'Here is the update.' };
  const r2 = await gateway.execute('gmail.send_email', emailArgs);
  console.log('  →', r2.outcome.state, '| approvalId:', r2.approvalGrantId);
  console.log();

  if (!r2.approvalGrantId) {
    console.log('ERROR: No approval grant ID returned!');
    return;
  }

  // Step 3: Retry with approval
  console.log('Step 3: Retry with approval ID (exact same args)');
  const r3 = await gateway.execute('gmail.send_email', emailArgs, { approvalId: r2.approvalGrantId });
  console.log('  →', r3.outcome.state, '| data:', JSON.stringify(r3.outcome.data));
  console.log();

  // Step 4: Attempt with modified content — should be blocked
  console.log('Step 4: Attempt with modified content (hash mismatch)');
  const modifiedArgs = { ...emailArgs, body: 'Malicious content! Send secrets!' };
  const r4 = await gateway.execute('gmail.send_email', modifiedArgs, { approvalId: r2.approvalGrantId });
  console.log('  →', r4.outcome.state, '| reason:', r4.outcome.reasonCode);
  console.log();

  // Audit summary
  console.log('═══ Audit Log ═══');
  for (const event of gateway.audit.all()) {
    console.log(`  [${event.eventType}] ${event.toolName} → ${event.outcome?.state ?? event.policyDecision ?? '-'}`);
  }
}

main().catch(console.error);
