import type { ToolExecutor } from './execution-wrapper.js';
import type { ToolMetadata } from '@ananke/schema';
/**
 * MCP Adapter — connects to a real MCP server over stdio and wraps
 * its tools as executors that the Gateway can call.
 *
 * Usage:
 *   const adapter = new McpAdapter('my-server', 'npx', ['-y', '@anthropic/mcp-server-filesystem', '/tmp']);
 *   await adapter.connect();
 *   const tools = await adapter.listTools();
 *   // tools: Array<{ name, description, inputSchema }>
 *   // Register each as a gateway tool, then set the adapter as executor.
 */
export declare class McpAdapter {
    readonly serverName: string;
    private client;
    private transport;
    private connected;
    constructor(serverName: string, command: string, args?: string[], env?: Record<string, string>);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    /**
     * List tools from the MCP server and return them as ToolMetadata.
     */
    listTools(): Promise<ToolMetadata[]>;
    /**
     * Build a ToolExecutor that calls the MCP tool through the adapter.
     */
    executorFor(toolName: string): ToolExecutor;
}
/**
 * Convenience: connect to an MCP server, list tools, and return
 * both the adapter and tool metadata ready for registration.
 */
export declare function connectMcpServer(serverName: string, command: string, args?: string[], env?: Record<string, string>): Promise<{
    adapter: McpAdapter;
    tools: ToolMetadata[];
}>;
//# sourceMappingURL=mcp-adapter.d.ts.map