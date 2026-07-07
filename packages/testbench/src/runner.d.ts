import type { Outcome, PolicyDecision } from '@ananke/schema';
/**
 * Test scenario definition.
 */
export interface TestScenario {
    name: string;
    description: string;
    userRequest: string;
    toolCall: string;
    arguments: Record<string, unknown>;
    expectedDecision: PolicyDecision;
    expectedState?: Outcome['state'];
    failIf: string[];
}
/**
 * Test scenario runner result.
 */
export interface ScenarioResult {
    scenario: string;
    passed: boolean;
    failures: string[];
    actualDecision?: string;
    actualOutcome?: Outcome;
    durationMs: number;
}
/**
 * Run a single scenario against the gateway.
 */
export declare function runScenario(scenario: TestScenario, execute: (tool: string, args: Record<string, unknown>) => Promise<{
    outcome: Outcome;
    approvalRequired?: boolean;
}>): Promise<ScenarioResult>;
/**
 * Run all scenarios N times and report summary.
 */
export declare function runBenchmark(scenarios: TestScenario[], execute: (tool: string, args: Record<string, unknown>) => Promise<{
    outcome: Outcome;
    approvalRequired?: boolean;
}>, runs?: number): Promise<{
    results: ScenarioResult[][];
    passRate: number;
    avgLatencyMs: number;
}>;
//# sourceMappingURL=runner.d.ts.map