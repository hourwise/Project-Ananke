import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
    resolve: {
        alias: {
            '@ananke/schema': resolve(__dirname, 'packages/schema/src/index.ts'),
            '@ananke/approval-bind': resolve(__dirname, 'packages/approval-bind/src/index.ts'),
            '@ananke/gateway': resolve(__dirname, 'packages/gateway/src/index.ts'),
        },
    },
    test: {
        include: ['packages/*/src/**/*.test.ts'],
        server: {
            deps: {
                inline: ['@ananke/schema', '@ananke/approval-bind', '@ananke/gateway'],
            },
        },
    },
});
//# sourceMappingURL=vitest.config.js.map