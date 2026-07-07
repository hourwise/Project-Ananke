import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@ananke/schema': resolve(__dirname, 'packages/schema/src/index.ts'),
      '@ananke/authority-engine': resolve(__dirname, 'packages/authority-engine/src/index.ts'),
      '@ananke/policy-engine': resolve(__dirname, 'packages/policy-engine/src/index.ts'),
      '@ananke/outcome-engine': resolve(__dirname, 'packages/outcome-engine/src/index.ts'),
      '@ananke/audit-engine': resolve(__dirname, 'packages/audit-engine/src/index.ts'),
      '@ananke/tool-router': resolve(__dirname, 'packages/tool-router/src/index.ts'),
      '@ananke/mcp-adapter': resolve(__dirname, 'packages/mcp-adapter/src/index.ts'),
      '@ananke/runtime-core': resolve(__dirname, 'packages/runtime-core/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    server: {
      deps: {
        inline: ['@ananke/schema', '@ananke/authority-engine', '@ananke/policy-engine', '@ananke/outcome-engine', '@ananke/audit-engine', '@ananke/tool-router', '@ananke/runtime-core'],
      },
    },
  },
});
