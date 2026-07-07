import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';

const rootDir = resolve(process.argv[2] ?? process.cwd());

function resolveInsideRoot(requestedPath: string): string {
  if (isAbsolute(requestedPath)) {
    throw new Error('Absolute paths are not allowed in this demo server');
  }

  const target = resolve(rootDir, requestedPath);
  const relativeTarget = relative(rootDir, target);

  if (relativeTarget.startsWith('..') || isAbsolute(relativeTarget)) {
    throw new Error('Path escapes the demo workspace');
  }

  return target;
}

const server = new McpServer({
  name: 'ananke-filesystem-demo-server',
  version: '0.1.0',
});

server.registerTool(
  'read_file',
  {
    description: 'Read a UTF-8 text file from the demo workspace.',
    inputSchema: {
      path: z.string().describe('Workspace-relative file path'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  async ({ path }) => {
    const target = resolveInsideRoot(path);
    const content = await readFile(target, 'utf8');
    const result = {
      path,
      content,
      bytes: Buffer.byteLength(content, 'utf8'),
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  },
);

server.registerTool(
  'write_file',
  {
    description: 'Write a UTF-8 text file inside the demo workspace.',
    inputSchema: {
      path: z.string().describe('Workspace-relative file path'),
      content: z.string().describe('New file contents'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ path, content }) => {
    const target = resolveInsideRoot(path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');

    const result = {
      path,
      written: true,
      bytes: Buffer.byteLength(content, 'utf8'),
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[filesystem-demo] MCP server rooted at ${rootDir}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
