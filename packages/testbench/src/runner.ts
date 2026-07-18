import { Gateway } from '@ananke/runtime-core';
import { PrincipalKind, ResourceScopeMode } from '@ananke/adrasteia-adapter';
import { join } from 'node:path';
import { MOCK_TOOLS, MUST_PASS_SCENARIOS } from './mock-server.js';
import { createValidationReport, writeValidationReport } from './validation-report.js';
import type {
  ToolMetadata,
  Outcome,
  OperatorIdentity,
  PolicyDecision,
  RiskClass,
} from '@ananke/schema';

/**
 * Test scenario definition.
 */
export interface TestScenario {
  name: string;
  description: string;
  userRequest: string;
  toolCall: string;
  arguments: Record<string, unknown>;
  expectedDecision: PolicyDecision;
  expectedState?: Outcome['state'];
  failIf: string[];
}

/**
 * Test scenario runner result.
 */
export interface ScenarioResult {
  scenario: string;
  passed: boolean;
  failures: string[];
  actualDecision?: string;
  actualOutcome?: Outcome;
  durationMs: number;
}

/**
 * Run a single scenario against the gateway.
 */
export async function runScenario(
  scenario: TestScenario,
  execute: (
    tool: string,
    args: Record<string, unknown>,
  ) => Promise<{ outcome: Outcome; approvalRequired?: boolean }>,
): Promise<ScenarioResult> {
  const failures: string[] = [];
  const start = performance.now();

  const result = await execute(scenario.toolCall, scenario.arguments);
  const durationMs = Math.round(performance.now() - start);

  // Check expected decision
  if (scenario.expectedDecision === 'REQUIRE_APPROVAL') {
    if (!result.approvalRequired) {
      failures.push(`Expected REQUIRE_APPROVAL but got no approvalRequired flag`);
    }
  } else if (scenario.expectedDecision === 'ALLOW') {
    if (result.approvalRequired) {
      failures.push(`Expected ALLOW but got approvalRequired`);
    }
  } else if (scenario.expectedDecision === 'DENY') {
    if (result.outcome.state !== 'DENIED') {
      failures.push(`Expected DENY but got state: ${result.outcome.state}`);
    }
  }

  // Check expected state
  if (scenario.expectedState && result.outcome.state !== scenario.expectedState) {
    failures.push(`Expected state ${scenario.expectedState} but got ${result.outcome.state}`);
  }

  // Check failIf conditions
  for (const condition of scenario.failIf) {
    if (condition === 'runtime_requires_approval_for_read' && result.approvalRequired) {
      failures.push('Runtime required approval for safe read');
    }
    if (condition === 'runtime_changes_arguments') {
      // Checked externally via audit
    }
    if (condition === 'modified_call_executes' && result.outcome.state === 'COMPLETED') {
      failures.push('Modified call executed despite hash mismatch');
    }
  }

  return {
    scenario: scenario.name,
    passed: failures.length === 0,
    failures,
    actualDecision: result.approvalRequired ? 'REQUIRE_APPROVAL' : result.outcome.state,
    actualOutcome: result.outcome,
    durationMs,
  };
}

/**
 * Run all scenarios N times and report summary.
 */
export async function runBenchmark(
  scenarios: TestScenario[],
  execute: (
    tool: string,
    args: Record<string, unknown>,
  ) => Promise<{ outcome: Outcome; approvalRequired?: boolean }>,
  runs = 10,
): Promise<{ results: ScenarioResult[][]; passRate: number; avgLatencyMs: number }> {
  const allResults: ScenarioResult[][] = [];

  for (let i = 0; i < runs; i++) {
    const runResults: ScenarioResult[] = [];
    for (const scenario of scenarios) {
      runResults.push(await runScenario(scenario, execute));
    }
    allResults.push(runResults);
  }

  const flat = allResults.flat();
  const passed = flat.filter((r) => r.passed).length;
  const passRate = flat.length > 0 ? (passed / flat.length) * 100 : 100;
  const avgLatencyMs =
    flat.length > 0 ? flat.reduce((a, r) => a + r.durationMs, 0) / flat.length : 0;

  return { results: allResults, passRate, avgLatencyMs };
}

const BENCH_OPERATOR: OperatorIdentity = {
  operatorId: 'testbench',
  displayName: 'Ananke Testbench',
  sessionId: 'testbench-session',
  authMethod: 'dev-token',
  roles: ['admin'],
  authenticatedAt: '2026-01-01T00:00:00.000Z',
};

const TOOL_RISK: Record<string, RiskClass> = {
  'calendar.list_events': 'READ_ONLY',
  'gmail.send_email': 'EXTERNAL_SEND',
  'github.delete_branch': 'DELETE',
  timeout_tool: 'INTERNAL_WRITE',
  stale_resource_tool: 'INTERNAL_WRITE',
  malicious_content_tool: 'EXTERNAL_SEND',
  read_document: 'READ_ONLY',
};

function createBenchmarkGateway(): Gateway {
  const gateway = new Gateway({
    autoLoadPolicy: false,
    embeddedExecutionContext: {
      authenticatedPrincipal: {
        id: 'testbench-host',
        kind: PrincipalKind.Service,
        tenantId: 'testbench',
      },
      actingPrincipal: {
        id: 'testbench-agent',
        kind: PrincipalKind.Agent,
        tenantId: 'testbench',
      },
      runtimeId: 'ananke',
      runtimeInstanceId: 'testbench-runtime',
      tenantId: 'testbench',
      resourceScope: {
        mode: ResourceScopeMode.Bounded,
        tenantId: 'testbench',
        resourceType: 'testbench',
        resourceIds: ['benchmark-suite'],
        operations: ['execute'],
      },
      sessionId: 'testbench-session',
    },
  });
  gateway.approvals.clear();

  for (const [name, executor] of Object.entries(MOCK_TOOLS)) {
    const riskClass = TOOL_RISK[name] ?? 'UNKNOWN';
    const metadata: ToolMetadata = {
      name,
      server: 'testbench',
      riskClass,
      requiredPermissions: [],
      retryable: false,
      requiresApproval: riskClass !== 'READ_ONLY',
    };
    gateway.registerTool(metadata);
    gateway.setExecutor(name, executor);
  }

  return gateway;
}

async function executeScenario(
  gateway: Gateway,
  scenario: TestScenario,
): Promise<{ outcome: Outcome; approvalRequired?: boolean }> {
  if (scenario.name === 'approval_hash_mismatch_blocks') {
    const originalArgs = { ...scenario.arguments, body: 'Here is the update.' };
    const requested = await gateway.execute(scenario.toolCall, originalArgs);
    if (!requested.approvalGrantId) return requested;
    gateway.approvals.approve(requested.approvalGrantId, BENCH_OPERATOR);
    const result = await gateway.execute(scenario.toolCall, scenario.arguments, {
      approvalId: requested.approvalGrantId,
    });
    return { ...result, approvalRequired: requested.approvalRequired };
  }

  const requested = await gateway.execute(scenario.toolCall, scenario.arguments);
  if (scenario.expectedDecision !== 'REQUIRE_APPROVAL' || !scenario.expectedState) {
    return requested;
  }

  if (!requested.approvalGrantId) return requested;
  gateway.approvals.approve(requested.approvalGrantId, BENCH_OPERATOR);
  const result = await gateway.execute(scenario.toolCall, scenario.arguments, {
    approvalId: requested.approvalGrantId,
  });
  return { ...result, approvalRequired: requested.approvalRequired };
}

async function main(): Promise<void> {
  const runs = Number(process.env.ANANKE_BENCH_RUNS ?? '3');
  const reportDir =
    process.env.ANANKE_REPORT_DIR ??
    join(process.env.INIT_CWD ?? process.cwd(), 'validation-reports');
  const startedAt = new Date().toISOString();
  const gateway = createBenchmarkGateway();
  const benchmark = await runBenchmark(
    MUST_PASS_SCENARIOS,
    (tool, args) => {
      const scenario = MUST_PASS_SCENARIOS.find(
        (candidate) => candidate.toolCall === tool && candidate.arguments === args,
      );
      if (!scenario) return gateway.execute(tool, args);
      return executeScenario(gateway, scenario);
    },
    runs,
  );
  const finishedAt = new Date().toISOString();

  for (const [index, run] of benchmark.results.entries()) {
    for (const result of run) {
      const status = result.passed ? 'PASS' : 'FAIL';
      console.log(
        `[${status}] run=${index + 1} scenario=${result.scenario} ${result.durationMs}ms`,
      );
      for (const failure of result.failures) {
        console.error(`  - ${failure}`);
      }
    }
  }

  console.log(
    `passRate=${benchmark.passRate.toFixed(2)} avgLatencyMs=${benchmark.avgLatencyMs.toFixed(1)}`,
  );

  const report = createValidationReport({
    startedAt,
    finishedAt,
    results: benchmark.results,
    passRate: benchmark.passRate,
    avgLatencyMs: benchmark.avgLatencyMs,
  });
  writeValidationReport(report, reportDir);
  console.log(`validationReport=${reportDir}/validation-report.json`);
  console.log(`validationCsv=${reportDir}/validation-report.csv`);

  if (benchmark.passRate !== 100) {
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('runner.ts') || process.argv[1]?.endsWith('runner.js')) {
  void main();
}
