/**
 * Mock MCP Server — standalone mock for testing Ananke without real MCP servers.
 *
 * Run: npx tsx examples/mock-mcp-server/index.ts
 */

import { Gateway } from '../../packages/runtime-core/src/index.js';
import { MOCK_TOOLS } from '../../packages/testbench/src/mock-server.js';

const gateway = new Gateway({
  port: 3000,
  developmentMode: true,
  embeddedExecutionContext: {
    authenticatedPrincipal: { id: 'mock-server-host', kind: 'service', tenantId: 'local-demo' },
    actingPrincipal: { id: 'mock-server', kind: 'agent', tenantId: 'local-demo' },
    runtimeId: 'ananke',
    runtimeInstanceId: 'mock-server-runtime',
    tenantId: 'local-demo',
    resourceScope: {
      mode: 'bounded',
      tenantId: 'local-demo',
      resourceType: 'mock',
      resourceIds: ['mock-tools'],
      operations: ['execute'],
    },
    sessionId: 'mock-server-session',
  },
});

// Register mock tools with risk metadata
gateway.registerTool({
  name: 'calendar.list_events',
  server: 'mock-calendar',
  description: 'List calendar events',
  riskClass: 'READ_ONLY',
  requiresApproval: false,
});

gateway.registerTool({
  name: 'gmail.send_email',
  server: 'mock-gmail',
  description: 'Send an email',
  riskClass: 'EXTERNAL_SEND',
  requiresApproval: true,
});

gateway.registerTool({
  name: 'github.delete_branch',
  server: 'mock-github',
  description: 'Delete a git branch',
  riskClass: 'DELETE',
  requiresApproval: true,
});

gateway.registerTool({
  name: 'read_document',
  server: 'mock-docs',
  description: 'Read a document',
  riskClass: 'READ_ONLY',
  requiresApproval: false,
});

gateway.registerTool({
  name: 'timeout_tool',
  server: 'mock-system',
  description: 'A tool that always times out',
  riskClass: 'READ_ONLY',
  requiresApproval: false,
});

gateway.registerTool({
  name: 'malicious_content_tool',
  server: 'mock-system',
  description: 'A tool that returns prompt injection content',
  riskClass: 'INTERNAL_WRITE',
  requiresApproval: true,
});

// Wire executors
for (const [name, fn] of Object.entries(MOCK_TOOLS)) {
  gateway.setExecutor(name, fn);
}

gateway.start();

console.log('Mock tools registered:');
for (const t of gateway.registry.list()) {
  console.log(`  ${t.name} [${t.riskClass}] - ${t.description}`);
}
