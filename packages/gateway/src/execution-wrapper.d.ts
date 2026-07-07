import type { FailureReasonCode } from '@ananke/schema';
/**
 * Execution Wrapper — calls the underlying tool and captures structured results.
 *
 * In MVP, this wraps a simple async function. When integrated with MCP,
 * it will wrap the actual MCP client call.
 */
export type ToolExecutor = (args: Record<string, unknown>) => Promise<unknown>;
export interface ExecutionResult {
    success: boolean;
    data?: unknown;
    error?: string;
    errorCode?: FailureReasonCode;
    durationMs: number;
}
export declare function executeTool(toolName: string, args: Record<string, unknown>, executor: ToolExecutor): Promise<ExecutionResult>;
//# sourceMappingURL=execution-wrapper.d.ts.map