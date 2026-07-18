import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const expected = {
  packageName: 'project-runtime-contracts',
  packageVersion: '0.4.0',
  protocolVersion: '1.4.0',
  minimumProtocolVersion: '1.0.0',
  artifactSha256: '11ee062b079f74d2a4558af315c9b9b12a6aede291d409c48f038d93c416e2c2',
  artifactUrl:
    'https://github.com/hourwise/Project-Adrasteia/releases/download/adrasteia-adoption-v0.4.0-protocol-1.4.0/project-runtime-contracts-0.4.0.tgz',
};

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}

const recordPath = new URL('../docs/integration/adrasteia-baseline.json', import.meta.url);
const lockPath = new URL('../package-lock.json', import.meta.url);
if (!existsSync(recordPath) || !existsSync(lockPath)) {
  fail('Adrasteia adoption record or package lock is missing.');
} else {
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  const lockfile = readFileSync(lockPath, 'utf8');
  for (const [key, value] of Object.entries(expected)) {
    if (key === 'artifactUrl') continue;
    if (record[key] !== value) fail(`Adoption record ${key} does not match the immutable baseline.`);
  }
  if (!lockfile.includes(expected.artifactUrl)) fail('package-lock does not pin the immutable release URL.');

  const require = createRequire(import.meta.url);
  const packageJson = JSON.parse(
    readFileSync(join(dirname(require.resolve('project-runtime-contracts')), '..', 'package.json'), 'utf8'),
  );
  if (packageJson.name !== expected.packageName || packageJson.version !== expected.packageVersion) {
    fail('Installed runtime-contract package name or version differs from the baseline.');
  }
  const contracts = await import('project-runtime-contracts');
  for (const name of [
    'AgentExecutionContextSchema',
    'ResourceScopeSchema',
    'CorrelationContextSchema',
    'RuntimeIdentitySchema',
    'RuntimeRegistrationSchema',
    'RuntimeHealthSchema',
    'RuntimeReadinessSchema',
    'CompatibilityManifestSchema',
    'negotiateDetailed',
  ]) {
    if (!(name in contracts)) fail(`Installed package is missing public export ${name}.`);
  }
}

if (!process.exitCode) console.log('[PASS] Project Adrasteia Stage-A baseline is pinned and exported.');
