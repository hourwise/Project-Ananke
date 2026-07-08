import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Gateway } from '@ananke/runtime-core';
import { SqliteAuditLog } from '@ananke/audit-engine';
import { McpAdapter } from '@ananke/mcp-adapter';
import type { Outcome } from '@ananke/schema';

const FILE_NAME = 'note.txt';
const INITIAL_CONTENT = 'original file content\n';
const APPROVED_CONTENT = 'approved write from Ananke\n';
const SECOND_APPROVED_CONTENT = 'second approved write\n';
const TAMPERED_CONTENT = 'tampered write after approval\n';

function expectState(label: string, outcome: Outcome, expected: Outcome['state']): void {
  assert.equal(
    outcome.state,
    expected,
    `${label} expected ${expected}, got ${outcome.state}`,
  );
}

function printOutcome(label: string, outcome: Outcome, approvalId?: string): void {
  const reason = outcome.reasonCode ? ` reason=${outcome.reasonCode}` : '';
  const approval = approvalId ? ` approvalId=${approvalId}` : '';
  console.log(`${label}: ${outcome.state}${reason}${approval}`);
}

async function main(): Promise<void> {
  const demoRoot = await mkdtemp(join(tmpdir(), 'ananke-filesystem-mcp-'));
  const workspaceDir = join(demoRoot, 'workspace');
  const auditDbPath = join(demoRoot, 'audit.db');
  const serverPath = fileURLToPath(new URL('./filesystem-server.ts', import.meta.url));

  await mkdir(workspaceDir, { recursive: true });
  await writeFile(join(workspaceDir, FILE_NAME), INITIAL_CONTENT, 'utf8');

  const audit = new SqliteAuditLog(auditDbPath);
  const gateway = new Gateway({ audit });
  const adapter = new McpAdapter('filesystem', process.execPath, [
    '--import',
    'tsx',
    serverPath,
    workspaceDir,
  ]);

  try {
    await adapter.connect();

    for (const tool of await adapter.listTools()) {
      const isWrite = tool.name.endsWith('.write_file');
      gateway.registerTool({
        ...tool,
        riskClass: isWrite ? 'INTERNAL_WRITE' : 'READ_ONLY',
        requiresApproval: isWrite,
        requiredPermissions: [],
        retryable: false,
      });
      gateway.setExecutor(tool.name, adapter.executorFor(tool.name));
    }

    const readTool = 'filesystem.read_file';
    const writeTool = 'filesystem.write_file';
    const readArgs = { path: FILE_NAME };
    const writeArgs = { path: FILE_NAME, content: APPROVED_CONTENT };

    console.log('Ananke filesystem MCP demo');
    console.log(`Workspace: ${workspaceDir}`);
    console.log(`SQLite audit: ${auditDbPath}`);
    console.log('');

    const readResult = await gateway.execute(readTool, readArgs);
    expectState('read file', readResult.outcome, 'COMPLETED');
    printOutcome('1. Read file allowed immediately', readResult.outcome);

    const writeRequest = await gateway.execute(writeTool, writeArgs);
    expectState('write without approval', writeRequest.outcome, 'WAITING_FOR_APPROVAL');
    assert.ok(writeRequest.approvalGrantId, 'write request should return an approval id');
    printOutcome(
      '2. Write waits for approval',
      writeRequest.outcome,
      writeRequest.approvalGrantId,
    );

    const approvedGrant = gateway.approvals.approve(writeRequest.approvalGrantId, 'demo-human');
    assert.ok(approvedGrant, 'demo-human should be able to approve the pending write');
    gateway.audit.recordApprovalGranted(writeTool, approvedGrant.canonicalHash);
    console.log('   Approved by demo-human');

    const approvedWrite = await gateway.execute(writeTool, writeArgs, {
      approvalId: writeRequest.approvalGrantId,
    });
    expectState('exact approved write', approvedWrite.outcome, 'COMPLETED');
    printOutcome('3. Exact approved write executes', approvedWrite.outcome);
    assert.equal(await readFile(join(workspaceDir, FILE_NAME), 'utf8'), APPROVED_CONTENT);

    const secondWriteRequest = await gateway.execute(writeTool, {
      path: FILE_NAME,
      content: SECOND_APPROVED_CONTENT,
    });
    expectState('second write without approval', secondWriteRequest.outcome, 'WAITING_FOR_APPROVAL');
    assert.ok(secondWriteRequest.approvalGrantId, 'second write should return an approval id');
    const secondGrant = gateway.approvals.approve(secondWriteRequest.approvalGrantId, 'demo-human');
    assert.ok(secondGrant, 'demo-human should be able to approve the second pending write');
    gateway.audit.recordApprovalGranted(writeTool, secondGrant.canonicalHash);

    const tamperedWrite = await gateway.execute(
      writeTool,
      { path: FILE_NAME, content: TAMPERED_CONTENT },
      { approvalId: secondWriteRequest.approvalGrantId },
    );
    expectState('tampered write', tamperedWrite.outcome, 'APPROVAL_INVALIDATED');
    printOutcome('4. Mutated write after approval is blocked', tamperedWrite.outcome);
    assert.equal(await readFile(join(workspaceDir, FILE_NAME), 'utf8'), APPROVED_CONTENT);

    const auditEvents = audit.all();
    const eventTypes = new Set(auditEvents.map((event) => event.eventType));
    for (const expectedEvent of [
      'TOOL_CALL_REQUESTED',
      'POLICY_CHECKED',
      'APPROVAL_REQUESTED',
      'APPROVAL_GRANTED',
      'APPROVAL_INVALIDATED',
      'TOOL_EXECUTED',
      'OUTCOME_GENERATED',
    ] as const) {
      assert.ok(eventTypes.has(expectedEvent), `missing audit event ${expectedEvent}`);
    }

    console.log('');
    console.log(`5. SQLite audit log captured ${auditEvents.length} events`);
    for (const event of auditEvents) {
      const detail = event.outcome?.state ?? event.policyDecision ?? event.approvalHash ?? '-';
      console.log(`   ${event.eventType} ${event.toolName} ${detail}`);
    }
  } finally {
    await adapter.disconnect();
    audit.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
