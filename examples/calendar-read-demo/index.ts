/**
 * Calendar Read Demo — demonstrates safe read passthrough.
 *
 * Shows:
 *   1. Safe reads pass through with no approval.
 *   2. Structured outcome envelope is returned.
 */

import { Gateway } from '../../packages/gateway/src/index.js';

async function main() {
  const gateway = new Gateway({
    embeddedExecutionContext: {
      authenticatedPrincipal: { id: 'calendar-demo-host', kind: 'service', tenantId: 'local-demo' },
      actingPrincipal: { id: 'calendar-demo', kind: 'agent', tenantId: 'local-demo' },
      runtimeId: 'ananke',
      runtimeInstanceId: 'calendar-demo-runtime',
      tenantId: 'local-demo',
      resourceScope: {
        mode: 'bounded',
        tenantId: 'local-demo',
        resourceType: 'calendar',
        resourceIds: ['calendar-demo'],
        operations: ['read'],
      },
      sessionId: 'calendar-demo-session',
    },
  });

  gateway.registerTool({
    name: 'calendar.list_events',
    server: 'demo',
    description: 'List calendar events',
    riskClass: 'READ_ONLY',
    requiresApproval: false,
  });

  gateway.setExecutor('calendar.list_events', async () => ({
    events: [
      { id: '1', title: 'Project standup', time: '09:00' },
      { id: '2', title: 'Design review', time: '11:00' },
      { id: '3', title: 'Lunch with team', time: '12:30' },
    ],
    total: 3,
  }));

  console.log('═══ DEMO: Safe Read Passthrough ═══\n');

  const result = await gateway.execute('calendar.list_events', {});
  console.log('State:', result.outcome.state);
  console.log('Retryable:', result.outcome.retryable);
  console.log('Safe to continue:', result.outcome.safeToContinue);
  console.log('Data:', JSON.stringify(result.outcome.data, null, 2));
  console.log();

  console.log('Audit entries:', gateway.audit.all().length);
}

main().catch(console.error);
