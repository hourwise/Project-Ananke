import type { RiskClass, ToolMetadata } from '@ananke/schema';

/**
 * Risk Classifier — categorizes a tool call by risk level.
 *
 * In MVP, this uses the registered metadata. Later, it could infer
 * risk from the tool name/schema if metadata is missing.
 */
export class RiskClassifier {
  constructor(private registry: { get(name: string): ToolMetadata | undefined }) {}

  classify(toolName: string): RiskClass {
    const meta = this.registry.get(toolName);
    if (meta) {
      return meta.riskClass;
    }
    // Default: unknown tools are treated as high-risk.
    return 'UNKNOWN';
  }
}
