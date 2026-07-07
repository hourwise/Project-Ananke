const DEFAULT_POLICY = {
    READ_ONLY: 'ALLOW',
    INTERNAL_WRITE: 'REQUIRE_APPROVAL',
    EXTERNAL_SEND: 'REQUIRE_APPROVAL',
    DELETE: 'REQUIRE_APPROVAL',
    PAYMENT: 'REQUIRE_APPROVAL',
    DEPLOYMENT: 'REQUIRE_APPROVAL',
    PERMISSION_CHANGE: 'REQUIRE_APPROVAL',
    UNKNOWN: 'DENY',
};
/**
 * Policy Engine — decides what should happen before a tool executes.
 */
export class PolicyEngine {
    config = {};
    /**
     * Load a YAML/JSON policy config that overrides defaults.
     */
    loadConfig(config) {
        this.config = config;
    }
    /**
     * Evaluate the policy for a given tool and risk class.
     */
    evaluate(toolName, riskClass) {
        // Check explicit config first
        const toolPolicy = this.config[toolName];
        if (toolPolicy) {
            switch (toolPolicy.approval) {
                case 'never':
                    return 'ALLOW';
                case 'required':
                    return 'REQUIRE_APPROVAL';
                case 'conditional':
                    // In MVP, conditional defaults to REQUIRE_APPROVAL.
                    // Phase 2 will evaluate conditions.
                    return 'REQUIRE_APPROVAL';
            }
        }
        // Fall back to default risk-based policy
        return DEFAULT_POLICY[riskClass];
    }
}
//# sourceMappingURL=policy-engine.js.map