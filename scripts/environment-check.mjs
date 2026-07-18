import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { arch, platform, release, type } from 'node:os';
import { join } from 'node:path';

const repoRoot = process.env.INIT_CWD ?? process.cwd();
const reportDir = process.env.ANANKE_REPORT_DIR ?? join(repoRoot, 'validation-reports');
const startedAt = new Date().toISOString();

function safeExec(command, args, fallback = 'unknown') {
  try {
    return execFileSync(command, args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

function npmVersion() {
  const version = process.env.npm_config_user_agent?.match(/npm\/([^\s]+)/)?.[1];
  if (version) return version;
  return safeExec(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version']);
}

function currentCommitSha() {
  return process.env.GITHUB_SHA ?? safeExec('git', [
    '-c',
    `safe.directory=${repoRoot.replace(/\\/g, '/')}`,
    'rev-parse',
    '--short=12',
    'HEAD',
  ]);
}

function supportsRequiredNodeVersion() {
  const [majorText, minorText] = process.versions.node.split('.');
  const major = Number.parseInt(majorText ?? '0', 10);
  const minor = Number.parseInt(minorText ?? '0', 10);
  return major > 22 || (major === 22 && minor >= 12);
}

function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

function result(id, name, status, details, remediation) {
  return {
    id,
    name,
    status,
    details,
    remediation: status === 'passed' ? undefined : remediation,
  };
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function reportToCsv(report) {
  const headers = [
    'project',
    'commitSha',
    'startedAt',
    'finishedAt',
    'id',
    'name',
    'status',
    'details',
    'remediation',
  ];

  return [
    headers.join(','),
    ...report.checks.map((check) => [
      report.project,
      report.commitSha,
      report.startedAt,
      report.finishedAt,
      check.id,
      check.name,
      check.status,
      check.details,
      check.remediation,
    ].map(csvEscape).join(',')),
  ].join('\n') + '\n';
}

async function main() {
  const checks = [];
  const npm = npmVersion();

  checks.push(result(
    'ANANKE-ENV-NODE',
    'Node.js version',
    supportsRequiredNodeVersion() ? 'passed' : 'failed',
    process.version,
    'Install Node.js 22.12 or newer.',
  ));

  checks.push(result(
    'ANANKE-ENV-NPM',
    'npm available',
    npm !== 'unknown' ? 'passed' : 'failed',
    npm,
    'Install npm or repair the Node.js installation.',
  ));

  checks.push(result(
    'ANANKE-ENV-PACKAGE-LOCK',
    'package-lock present',
    existsSync(join(repoRoot, 'package-lock.json')) ? 'passed' : 'failed',
    'package-lock.json',
    'Restore package-lock.json and use npm ci for reproducible installs.',
  ));

  checks.push(result(
    'ANANKE-ENV-NODE-MODULES',
    'dependencies installed',
    existsSync(join(repoRoot, 'node_modules')) ? 'passed' : 'failed',
    'node_modules',
    'Run npm install or npm ci.',
  ));

  checks.push(result(
    'ANANKE-ENV-TYPESCRIPT',
    'TypeScript installed',
    existsSync(join(repoRoot, 'node_modules', 'typescript')) ? 'passed' : 'failed',
    'node_modules/typescript',
    'Run npm install or npm ci.',
  ));

  checks.push(result(
    'ANANKE-ENV-TSX',
    'tsx available',
    existsSync(join(repoRoot, 'node_modules', 'tsx')) ? 'passed' : 'failed',
    'node_modules/tsx',
    'Run npm install or npm ci.',
  ));

  checks.push(result(
    'ANANKE-ENV-SQLITE',
    'better-sqlite3 installed',
    existsSync(join(repoRoot, 'node_modules', 'better-sqlite3')) ? 'passed' : 'failed',
    'node_modules/better-sqlite3',
    'Run npm install or npm ci. If native install fails, check local build tools.',
  ));

  checks.push(result(
    'ANANKE-ENV-FILESYSTEM-DEMO',
    'filesystem MCP demo server present',
    existsSync(join(repoRoot, 'examples', 'filesystem-mcp-demo', 'filesystem-server.ts')) ? 'passed' : 'failed',
    'examples/filesystem-mcp-demo/filesystem-server.ts',
    'Restore the filesystem demo server file.',
  ));

  for (const port of [3000, 5173]) {
    const available = await checkPort(port);
    checks.push(result(
      `ANANKE-ENV-PORT-${port}`,
      `port ${port} available`,
      available ? 'passed' : 'warning',
      available ? 'available' : 'occupied',
      available ? undefined : `Stop the process using port ${port} if you need to start that local service.`,
    ));
  }

  const failed = checks.filter((check) => check.status === 'failed').length;
  const warnings = checks.filter((check) => check.status === 'warning').length;
  const passed = checks.filter((check) => check.status === 'passed').length;
  const finishedAt = new Date().toISOString();

  const report = {
    schemaVersion: '0.1.0',
    project: 'Ananke',
    validationKind: 'environment-check',
    commitSha: currentCommitSha(),
    startedAt,
    finishedAt,
    summary: {
      total: checks.length,
      passed,
      failed,
      warnings,
    },
    environment: {
      os: type(),
      osRelease: release(),
      platform: platform(),
      arch: arch(),
      node: process.version,
      npm,
      harness: process.env.ANANKE_VALIDATION_HARNESS ?? (process.env.GITHUB_ACTIONS ? 'github-actions' : 'local'),
      model: process.env.ANANKE_VALIDATION_MODEL ?? 'unknown',
    },
    checks,
  };

  mkdirSync(reportDir, { recursive: true });
  writeFileSync(join(reportDir, 'environment-check.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(reportDir, 'environment-check.csv'), reportToCsv(report));

  for (const check of checks) {
    const marker = check.status === 'passed' ? 'PASS' : check.status === 'warning' ? 'WARN' : 'FAIL';
    console.log(`[${marker}] ${check.name}: ${check.details}`);
    if (check.status !== 'passed' && check.remediation) {
      console.log(`       ${check.remediation}`);
    }
  }

  console.log(`environmentReport=${join(reportDir, 'environment-check.json')}`);
  console.log(`environmentCsv=${join(reportDir, 'environment-check.csv')}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main();
