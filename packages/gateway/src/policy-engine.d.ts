import type { PolicyDecision, PolicyConfig, RiskClass } from '@ananke/schema';
/**
 * Policy Engine — decides what should happen before a tool executes.
 */
export declare class PolicyEngine {
    private config;
    /**
     * Load a YAML/JSON policy config that overrides defaults.
     */
    loadConfig(config: PolicyConfig): void;
    /**
     * Evaluate the policy for a given tool and risk class.
     */
    evaluate(toolName: string, riskClass: RiskClass): PolicyDecision;
}
//# sourceMappingURL=policy-engine.d.ts.map