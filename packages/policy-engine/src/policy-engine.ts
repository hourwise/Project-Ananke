import type { PolicyDecision, PolicyConfig, RiskClass } from '@ananke/schema';

const DEFAULT_POLICY: Record<RiskClass, PolicyDecision> = {
  READ_ONLY: 'ALLOW',
  INTERNAL_WRITE: 'REQUIRE_APPROVAL',
  EXTERNAL_SEND: 'REQUIRE_APPROVAL',
  DELETE: 'REQUIRE_APPROVAL',
  PAYMENT: 'REQUIRE_APPROVAL',
  DEPLOYMENT: 'REQUIRE_APPROVAL',
  PERMISSION_CHANGE: 'REQUIRE_APPROVAL',
  CREDENTIAL_ACCESS: 'REQUIRE_APPROVAL',
  NETWORK_EGRESS: 'REQUIRE_APPROVAL',
  SKILL_INSTALL: 'REQUIRE_APPROVAL',
  MODEL_PROVIDER_CHANGE: 'REQUIRE_APPROVAL',
  UNKNOWN: 'DENY',
};

/**
 * Policy Engine — decides what should happen before a tool executes.
 */
export class PolicyEngine {
  private config: PolicyConfig = {};

  /**
   * Load a YAML/JSON policy config that overrides defaults.
   */
  loadConfig(config: PolicyConfig): void {
    this.config = config;
  }

  /**
   * Evaluate the policy for a given tool and risk class.
   */
  evaluate(toolName: string, riskClass: RiskClass): PolicyDecision {
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
