import type { RiskClass, ToolMetadata } from '@ananke/schema';
/**
 * Risk Classifier — categorizes a tool call by risk level.
 *
 * In MVP, this uses the registered metadata. Later, it could infer
 * risk from the tool name/schema if metadata is missing.
 */
export declare class RiskClassifier {
    private registry;
    constructor(registry: {
        get(name: string): ToolMetadata | undefined;
    });
    classify(toolName: string): RiskClass;
}
//# sourceMappingURL=classifier.d.ts.map