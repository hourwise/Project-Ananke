import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, platform, release, type } from 'node:os';
import { join } from 'node:path';
import type { Outcome } from '@ananke/schema';
import type { ScenarioResult } from './runner.js';

export interface ValidationReportEnvironment {
  os: string;
  osRelease: string;
  platform: string;
  arch: string;
  node: string;
  npm: string;
  harness: string;
  model: string;
  mcpClient: string;
}

export interface ValidationReportTest {
  testId: string;
  run: number;
  suite: string;
  category: string;
  name: string;
  status: 'passed' | 'failed';
  durationMs: number;
  failureReason?: string;
  outcomeState?: Outcome['state'];
  outcomeReasonCode?: Outcome['reasonCode'];
  reproductionCommand: string;
}

export interface ValidationReport {
  schemaVersion: '0.1.0';
  project: 'Ananke';
  validationKind: 'scenario-benchmark';
  commitSha: string;
  startedAt: string;
  finishedAt: string;
  testSuiteVersion: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;
    avgLatencyMs: number;
  };
  environment: ValidationReportEnvironment;
  tests: ValidationReportTest[];
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

function suiteForScenario(name: string): string {
  if (name.includes('approval')) return 'Approval Binding';
  if (name.includes('policy') || name.includes('read')) return 'Policy Engine';
  if (name.includes('timeout')) return 'Outcome Engine';
  if (name.includes('prompt')) return 'Hostile Input';
  if (name.includes('send')) return 'Authority Engine';
  return 'Scenario Benchmark';
}

function categoryForScenario(name: string): string {
  if (name.includes('mismatch') || name.includes('prompt')) return 'malicious';
  if (name.includes('timeout') || name.includes('denied')) return 'failure';
  if (name.includes('approval')) return 'approval';
  return 'normal';
}

function testIdForScenario(name: string): string {
  return `ANANKE-${name.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`;
}

function flattenResults(results: ScenarioResult[][]): ValidationReportTest[] {
  return results.flatMap((run, runIndex) => (
    run.map((result) => ({
      testId: testIdForScenario(result.scenario),
      run: runIndex + 1,
      suite: suiteForScenario(result.scenario),
      category: categoryForScenario(result.scenario),
      name: result.scenario,
      status: result.passed ? 'passed' : 'failed',
      durationMs: result.durationMs,
      failureReason: result.failures.length > 0 ? result.failures.join('; ') : undefined,
      outcomeState: result.actualOutcome?.state,
      outcomeReasonCode: result.actualOutcome?.reasonCode,
      reproductionCommand: 'npm run test:bench',
    }))
  ));
}

export function createValidationReport(input: {
  startedAt: string;
  finishedAt: string;
  results: ScenarioResult[][];
  passRate: number;
  avgLatencyMs: number;
}): ValidationReport {
  const tests = flattenResults(input.results);
  const passed = tests.filter((test) => test.status === 'passed').length;
  const failed = tests.filter((test) => test.status === 'failed').length;

  return {
    schemaVersion: '0.1.0',
    project: 'Ananke',
    validationKind: 'scenario-benchmark',
    commitSha: currentCommitSha(),
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    testSuiteVersion: '0.1.0',
    summary: {
      total: tests.length,
      passed,
      failed,
      skipped: 0,
      passRate: input.passRate,
      avgLatencyMs: input.avgLatencyMs,
    },
    environment: {
      os: type(),
      osRelease: release(),
      platform: platform(),
      arch: arch(),
      node: process.version,
      npm: npmVersion(),
      harness: process.env.ANANKE_VALIDATION_HARNESS ?? (process.env.GITHUB_ACTIONS ? 'github-actions' : 'local'),
      model: process.env.ANANKE_VALIDATION_MODEL ?? 'unknown',
      mcpClient: process.env.ANANKE_VALIDATION_MCP_CLIENT ?? 'mock',
    },
    tests,
  };
}

function csvEscape(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function validationReportToCsv(report: ValidationReport): string {
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
    'run',
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
    test.run,
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

  return [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => row.map(csvEscape).join(',')),
  ].join('\n') + '\n';
}

export function writeValidationReport(report: ValidationReport, outputDir: string): void {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'validation-report.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(outputDir, 'validation-report.csv'), validationReportToCsv(report));
}
