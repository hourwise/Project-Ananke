import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
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
export class McpAdapter {
  public readonly serverName: string;
  private client: Client;
  private transport: StdioClientTransport;
  private connected = false;

  constructor(serverName: string, command: string, args: string[] = [], env?: Record<string, string>) {
    this.serverName = serverName;
    this.transport = new StdioClientTransport({ command, args, env });
    this.client = new Client(
      { name: `ananke-gateway-${serverName}`, version: '0.1.0' },
      { capabilities: { tools: {} } },
    );
  }

  async connect(): Promise<void> {
    await this.client.connect(this.transport);
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }

  /**
   * List tools from the MCP server and return them as ToolMetadata.
   */
  async listTools(): Promise<ToolMetadata[]> {
    const result = await this.client.listTools();
    return result.tools.map((tool) => ({
      name: `${this.serverName}.${tool.name}`,
      server: this.serverName,
      description: tool.description ?? undefined,
      inputSchema: tool.inputSchema as Record<string, unknown> | undefined,
      riskClass: 'UNKNOWN' as const, // caller should override
      requiresApproval: false,       // caller should override
    }));
  }

  /**
   * Build a ToolExecutor that calls the MCP tool through the adapter.
   */
  executorFor(toolName: string): ToolExecutor {
    // Strip server prefix if present
    const mcpToolName = toolName.startsWith(`${this.serverName}.`)
      ? toolName.slice(this.serverName.length + 1)
      : toolName;

    return async (args: Record<string, unknown>) => {
      const result = await this.client.callTool({
        name: mcpToolName,
        arguments: args,
      });

      // MCP returns content as an array of {type, text} or {type, resource}, etc.
      if (result.isError) {
        const errorText = result.content
          .map((c) => (c.type === 'text' ? c.text : JSON.stringify(c)))
          .join('\n');
        throw new Error(`MCP_TOOL_ERROR: ${errorText}`);
      }

      // Extract structured content
      const textParts = result.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text);

      // Try to parse JSON if it looks like JSON
      if (textParts.length === 1) {
        try {
          return JSON.parse(textParts[0]);
        } catch {
          return { text: textParts[0] };
        }
      }
      return { content: textParts };
    };
  }
}

/**
 * Convenience: connect to an MCP server, list tools, and return
 * both the adapter and tool metadata ready for registration.
 */
export async function connectMcpServer(
  serverName: string,
  command: string,
  args: string[] = [],
  env?: Record<string, string>,
): Promise<{ adapter: McpAdapter; tools: ToolMetadata[] }> {
  const adapter = new McpAdapter(serverName, command, args, env);
  await adapter.connect();
  const tools = await adapter.listTools();
  return { adapter, tools };
}
