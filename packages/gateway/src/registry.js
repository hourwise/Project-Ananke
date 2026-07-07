/**
 * Tool Registry — stores metadata about all available tools.
 */
export class ToolRegistry {
    tools = new Map();
    register(tool) {
        this.tools.set(tool.name, tool);
    }
    get(name) {
        return this.tools.get(name);
    }
    list() {
        return [...this.tools.values()];
    }
    listByRisk(risk) {
        return this.list().filter((t) => t.riskClass === risk);
    }
}
//# sourceMappingURL=registry.js.map