import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { McpAdapter } from './mcp-adapter.js';

const serverPath = fileURLToPath(new URL('../../../examples/filesystem-mcp-demo/filesystem-server.ts', import.meta.url));
const everythingServerPath = fileURLToPath(
  new URL('../../../node_modules/@modelcontextprotocol/server-everything/dist/index.js', import.meta.url),
);

describe('McpAdapter with the filesystem MCP server', () => {
  let adapter: McpAdapter | undefined;
  let workspaceDir: string | undefined;

  afterEach(async () => {
    await adapter?.disconnect();
    if (workspaceDir) {
      await rm(workspaceDir, { recursive: true, force: true });
    }
    adapter = undefined;
    workspaceDir = undefined;
  });

  async function connect(): Promise<McpAdapter> {
    workspaceDir = await mkdtemp(join(tmpdir(), 'ananke-mcp-adapter-test-'));
    await writeFile(join(workspaceDir, 'note.txt'), 'original\n', 'utf8');
    adapter = new McpAdapter('filesystem', process.execPath, [
      '--import',
      'tsx',
      serverPath,
      workspaceDir,
    ]);
    await adapter.connect();
    return adapter;
  }

  it('discovers tools and executes structured MCP results over stdio', async () => {
    const connected = await connect();

    await expect(connected.listTools()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'filesystem.read_file',
        server: 'filesystem',
        riskClass: 'UNKNOWN',
      }),
      expect.objectContaining({
        name: 'filesystem.write_file',
        server: 'filesystem',
      }),
    ]));

    const read = connected.executorFor('filesystem.read_file');
    await expect(read({ path: 'note.txt' })).resolves.toEqual({
      path: 'note.txt',
      content: 'original\n',
      bytes: 9,
    });

    const write = connected.executorFor('filesystem.write_file');
    await expect(write({ path: 'note.txt', content: 'updated\n' })).resolves.toMatchObject({
      path: 'note.txt',
      written: true,
      bytes: 8,
    });
    await expect(readFile(join(workspaceDir!, 'note.txt'), 'utf8')).resolves.toBe('updated\n');
  });

  it('surfaces MCP tool errors to the gateway executor', async () => {
    const connected = await connect();
    const read = connected.executorFor('filesystem.read_file');

    await expect(read({ path: '../outside.txt' })).rejects.toThrow('MCP_TOOL_ERROR:');
  });
});

describe('McpAdapter with the official Everything MCP reference server', () => {
  let adapter: McpAdapter | undefined;

  afterEach(async () => {
    await adapter?.disconnect();
    adapter = undefined;
  });

  it('discovers and invokes an external reference server tool over stdio', async () => {
    adapter = new McpAdapter('everything', process.execPath, [everythingServerPath, 'stdio']);
    await adapter.connect();

    await expect(adapter.listTools()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'everything.echo',
        server: 'everything',
      }),
    ]));

    const echo = adapter.executorFor('everything.echo');
    await expect(echo({ message: 'Ananke MCP validation' })).resolves.toEqual({
      text: 'Echo: Ananke MCP validation',
    });
  });
});
