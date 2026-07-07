import type { ToolMetadata, RiskClass, PolicyDecision } from '@ananke/schema';

/**
 * Tool Registry — stores metadata about all available tools.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolMetadata>();

  register(tool: ToolMetadata): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolMetadata | undefined {
    return this.tools.get(name);
  }

  list(): ToolMetadata[] {
    return [...this.tools.values()];
  }

  listByRisk(risk: RiskClass): ToolMetadata[] {
    return this.list().filter((t) => t.riskClass === risk);
  }
}
