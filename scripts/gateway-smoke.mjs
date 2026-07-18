import { spawn } from 'node:child_process';

const port = 33147;
const child = spawn(process.execPath, ['packages/runtime-core/dist/server.js'], {
  cwd: process.cwd(),
  env: { ...process.env, ANANKE_PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', (data) => { output += data; });
child.stderr.on('data', (data) => { output += data; });

async function waitForGateway() {
  const endpoint = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const root = await fetch(endpoint);
      const identity = await fetch(`${endpoint}/api/runtime/identity`);
      if (root.ok && identity.ok) return;
    } catch {
      // The process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Gateway did not become ready. Output: ${output}`);
}

try {
  await waitForGateway();
  console.log('[PASS] standalone gateway start/probe/stop smoke test');
} finally {
  child.kill();
}
