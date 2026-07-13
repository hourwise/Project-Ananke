import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { arch, platform, release, type } from 'node:os';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Gateway } from '@ananke/runtime-core';
import { SqliteAuditLog } from '@ananke/audit-engine';
import { McpAdapter } from '@ananke/mcp-adapter';
import type { OperatorIdentity, Outcome } from '@ananke/schema';

const FILE_NAME = 'note.txt';
const INITIAL_CONTENT = 'original file content\n';
const APPROVED_CONTENT = 'approved write from Ananke\n';
const SECOND_APPROVED_CONTENT = 'second approved write\n';
const TAMPERED_CONTENT = 'tampered write after approval\n';
const REPORT_DIR = join(process.env.INIT_CWD ?? process.cwd(), 'validation-reports');
const DEMO_OPERATOR: OperatorIdentity = {
  operatorId: 'demo-human',
  displayName: 'Demo Human',
  sessionId: 'filesystem-demo-session',
  authMethod: 'dev-token',
  roles: ['admin'],
  authenticatedAt: '2026-01-01T00:00:00.000Z',
};

interface DemoStep {
  testId: string;
  suite: string;
  category: string;
  name: string;
  status: 'passed' | 'failed';
  durationMs: number;
  failureReason?: string;
  outcomeState?: Outcome['state'];
  outcomeReasonCode?: Outcome['reasonCode'];
}

interface FilesystemDemoReport {
  schemaVersion: '0.1.0';
  project: 'Ananke';
  validationKind: 'filesystem-mcp-demo';
  commitSha: string;
  startedAt: string;
  finishedAt: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;
    auditEventCount: number;
  };
  environment: {
    os: string;
    osRelease: string;
    platform: string;
    arch: string;
    node: string;
    npm: string;
    harness: string;
    model: string;
    mcpClient: string;
  };
  tests: Array<DemoStep & { reproductionCommand: string }>;
}

function safeExec(command: string, args: string[], fallback: string): string {
  try {
    return execFileSync(command, args, { encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

function currentCommitSha(): string {
  return process.env.GITHUB_SHA ?? safeExec('git', ['rev-parse', '--short=12', 'HEAD'], 'unknown');
}

function npmVersion(): string {
  const userAgent = process.env.npm_config_user_agent;
  const version = userAgent?.match(/npm\/([^\s]+)/)?.[1];
  if (version) return version;
  return safeExec(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], 'unknown');
}

function expectState(label: string, outcome: Outcome, expected: Outcome['state']): void {
  assert.equal(outcome.state, expected, `${label} expected ${expected}, got ${outcome.state}`);
}

function printOutcome(label: string, outcome: Outcome, approvalId?: string): void {
  const reason = outcome.reasonCode ? ` reason=${outcome.reasonCode}` : '';
  const approval = approvalId ? ` approvalId=${approvalId}` : '';
  console.log(`${label}: ${outcome.state}${reason}${approval}`);
}

async function recordStep<T>(
  steps: DemoStep[],
  metadata: Pick<DemoStep, 'testId' | 'suite' | 'category' | 'name'>,
  run: () => Promise<{ value: T; outcome?: Outcome }>,
): Promise<T> {
  const start = performance.now();
  try {
    const result = await run();
    steps.push({
      ...metadata,
      status: 'passed',
      durationMs: Math.round(performance.now() - start),
      outcomeState: result.outcome?.state,
      outcomeReasonCode: result.outcome?.reasonCode,
    });
    return result.value;
  } catch (error) {
    steps.push({
      ...metadata,
      status: 'failed',
      durationMs: Math.round(performance.now() - start),
      failureReason: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function csvEscape(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function reportToCsv(report: FilesystemDemoReport): string {
  const headers = [
    'project',
    'commitSha',
    'startedAt',
    'finishedAt',
    'os',
    'platform',
    'arch',
    'node',
    'npm',
    'harness',
    'model',
    'mcpClient',
    'testId',
    'suite',
    'category',
    'name',
    'status',
    'durationMs',
    'failureReason',
    'outcomeState',
    'outcomeReasonCode',
    'reproductionCommand',
  ];
  const rows = report.tests.map((test) => [
    report.project,
    report.commitSha,
    report.startedAt,
    report.finishedAt,
    report.environment.os,
    report.environment.platform,
    report.environment.arch,
    report.environment.node,
    report.environment.npm,
    report.environment.harness,
    report.environment.model,
    report.environment.mcpClient,
    test.testId,
    test.suite,
    test.category,
    test.name,
    test.status,
    test.durationMs,
    test.failureReason,
    test.outcomeState,
    test.outcomeReasonCode,
    test.reproductionCommand,
  ]);

  return (
    [headers.map(csvEscape).join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join(
      '\n',
    ) + '\n'
  );
}

async function writeDemoReport(input: {
  startedAt: string;
  finishedAt: string;
  steps: DemoStep[];
  auditEventCount: number;
}): Promise<void> {
  const passed = input.steps.filter((step) => step.status === 'passed').length;
  const failed = input.steps.filter((step) => step.status === 'failed').length;
  const report: FilesystemDemoReport = {
    schemaVersion: '0.1.0',
    project: 'Ananke',
    validationKind: 'filesystem-mcp-demo',
    commitSha: currentCommitSha(),
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    summary: {
      total: input.steps.length,
      passed,
      failed,
      skipped: 0,
      passRate: input.steps.length > 0 ? (passed / input.steps.length) * 100 : 100,
      auditEventCount: input.auditEventCount,
    },
    environment: {
      os: type(),
      osRelease: release(),
      platform: platform(),
      arch: arch(),
      node: process.version,
      npm: npmVersion(),
      harness:
        process.env.ANANKE_VALIDATION_HARNESS ??
        (process.env.GITHUB_ACTIONS ? 'github-actions' : 'local'),
      model: process.env.ANANKE_VALIDATION_MODEL ?? 'unknown',
      mcpClient: 'stdio-filesystem',
    },
    tests: input.steps.map((step) => ({
      ...step,
      reproductionCommand: 'npm run demo:filesystem:run',
    })),
  };

  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(
    join(REPORT_DIR, 'filesystem-demo-report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await writeFile(join(REPORT_DIR, 'filesystem-demo-report.csv'), reportToCsv(report));
  console.log(`validationReport=${join(REPORT_DIR, 'filesystem-demo-report.json')}`);
  console.log(`validationCsv=${join(REPORT_DIR, 'filesystem-demo-report.csv')}`);
}

function approvalMetadata(operator: OperatorIdentity): Record<string, unknown> {
  return {
    decision: 'approved',
    operatorId: operator.operatorId,
    operatorDisplayName: operator.displayName,
    sessionId: operator.sessionId,
    authMethod: operator.authMethod,
    decidedAt: new Date().toISOString(),
  };
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const steps: DemoStep[] = [];
  let auditEventCount = 0;
  let thrown: unknown;
  const demoRoot = await mkdtemp(join(tmpdir(), 'ananke-filesystem-mcp-'));
  const workspaceDir = join(demoRoot, 'workspace');
  const auditDbPath = join(demoRoot, 'audit.db');
  const serverPath = fileURLToPath(new URL('./filesystem-server.ts', import.meta.url));

  await mkdir(workspaceDir, { recursive: true });
  await writeFile(join(workspaceDir, FILE_NAME), INITIAL_CONTENT, 'utf8');

  const audit = new SqliteAuditLog(auditDbPath);
  const gateway = new Gateway({
    audit,
    embeddedExecutionContext: {
      agentPrincipalId: 'filesystem-demo',
      tenantId: 'local-demo',
      resourceScope: 'filesystem:demo',
      sessionId: 'filesystem-demo-session',
    },
  });
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

    const readResult = await recordStep(
      steps,
      {
        testId: 'ANANKE-FILESYSTEM-DEMO-READ',
        suite: 'Filesystem MCP Demo',
        category: 'normal',
        name: 'read_file_allowed',
      },
      async () => {
        const result = await gateway.execute(readTool, readArgs);
        expectState('read file', result.outcome, 'COMPLETED');
        return { value: result, outcome: result.outcome };
      },
    );
    printOutcome('1. Read file allowed immediately', readResult.outcome);

    const writeRequest = await recordStep(
      steps,
      {
        testId: 'ANANKE-FILESYSTEM-DEMO-WAITING-FOR-APPROVAL',
        suite: 'Filesystem MCP Demo',
        category: 'approval',
        name: 'write_waits_for_approval',
      },
      async () => {
        const result = await gateway.execute(writeTool, writeArgs);
        expectState('write without approval', result.outcome, 'WAITING_FOR_APPROVAL');
        assert.ok(result.approvalGrantId, 'write request should return an approval id');
        return { value: result, outcome: result.outcome };
      },
    );
    printOutcome('2. Write waits for approval', writeRequest.outcome, writeRequest.approvalGrantId);

    const approvedGrant = gateway.approvals.approve(writeRequest.approvalGrantId, DEMO_OPERATOR);
    assert.ok(approvedGrant, 'demo-human should be able to approve the pending write');
    gateway.audit.recordApprovalGranted(
      writeTool,
      approvedGrant.bindingHash ?? approvedGrant.actionHash,
      approvalMetadata(DEMO_OPERATOR),
    );
    console.log('   Approved by demo-human');

    const approvedWrite = await recordStep(
      steps,
      {
        testId: 'ANANKE-FILESYSTEM-DEMO-APPROVED-WRITE',
        suite: 'Filesystem MCP Demo',
        category: 'approval',
        name: 'exact_approved_write_executes',
      },
      async () => {
        const result = await gateway.execute(writeTool, writeArgs, {
          approvalId: writeRequest.approvalGrantId,
        });
        expectState('exact approved write', result.outcome, 'COMPLETED');
        assert.equal(await readFile(join(workspaceDir, FILE_NAME), 'utf8'), APPROVED_CONTENT);
        return { value: result, outcome: result.outcome };
      },
    );
    printOutcome('3. Exact approved write executes', approvedWrite.outcome);

    const secondWriteRequest = await gateway.execute(writeTool, {
      path: FILE_NAME,
      content: SECOND_APPROVED_CONTENT,
    });
    expectState(
      'second write without approval',
      secondWriteRequest.outcome,
      'WAITING_FOR_APPROVAL',
    );
    assert.ok(secondWriteRequest.approvalGrantId, 'second write should return an approval id');
    const secondGrant = gateway.approvals.approve(
      secondWriteRequest.approvalGrantId,
      DEMO_OPERATOR,
    );
    assert.ok(secondGrant, 'demo-human should be able to approve the second pending write');
    gateway.audit.recordApprovalGranted(
      writeTool,
      secondGrant.bindingHash ?? secondGrant.actionHash,
      approvalMetadata(DEMO_OPERATOR),
    );

    const tamperedWrite = await recordStep(
      steps,
      {
        testId: 'ANANKE-FILESYSTEM-DEMO-TAMPERED-WRITE',
        suite: 'Filesystem MCP Demo',
        category: 'malicious',
        name: 'mutated_write_blocked',
      },
      async () => {
        const result = await gateway.execute(
          writeTool,
          { path: FILE_NAME, content: TAMPERED_CONTENT },
          { approvalId: secondWriteRequest.approvalGrantId },
        );
        expectState('tampered write', result.outcome, 'APPROVAL_INVALIDATED');
        assert.equal(await readFile(join(workspaceDir, FILE_NAME), 'utf8'), APPROVED_CONTENT);
        return { value: result, outcome: result.outcome };
      },
    );
    printOutcome('4. Mutated write after approval is blocked', tamperedWrite.outcome);

    const auditEvents = await recordStep(
      steps,
      {
        testId: 'ANANKE-FILESYSTEM-DEMO-AUDIT',
        suite: 'Filesystem MCP Demo',
        category: 'audit',
        name: 'audit_log_captured',
      },
      async () => {
        const events = audit.all();
        const eventTypes = new Set(events.map((event) => event.eventType));
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
        return { value: events };
      },
    );
    auditEventCount = auditEvents.length;

    console.log('');
    console.log(`5. SQLite audit log captured ${auditEvents.length} events`);
    for (const event of auditEvents) {
      const detail = event.outcome?.state ?? event.policyDecision ?? event.approvalHash ?? '-';
      console.log(`   ${event.eventType} ${event.toolName} ${detail}`);
    }
  } catch (error) {
    thrown = error;
  } finally {
    await adapter.disconnect();
    if (auditEventCount === 0) {
      auditEventCount = audit.all().length;
    }
    audit.close();
    await writeDemoReport({
      startedAt,
      finishedAt: new Date().toISOString(),
      steps,
      auditEventCount,
    });
  }

  if (thrown) {
    throw thrown;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
