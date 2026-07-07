/**
 * Mock tool implementations used for testing.
 * These simulate real MCP tool behavior without external dependencies.
 */
export declare const MOCK_TOOLS: Record<string, (args: Record<string, unknown>) => Promise<unknown>>;
/**
 * Standard test scenarios — must pass 100% of the time.
 * Re-exported from the scenarios barrel.
 */
export { MUST_PASS_SCENARIOS } from './scenarios/index.js';
//# sourceMappingURL=mock-server.d.ts.map