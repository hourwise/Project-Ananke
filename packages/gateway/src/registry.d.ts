import type { ToolMetadata, RiskClass } from '@ananke/schema';
/**
 * Tool Registry — stores metadata about all available tools.
 */
export declare class ToolRegistry {
    private tools;
    register(tool: ToolMetadata): void;
    get(name: string): ToolMetadata | undefined;
    list(): ToolMetadata[];
    listByRisk(risk: RiskClass): ToolMetadata[];
}
//# sourceMappingURL=registry.d.ts.map