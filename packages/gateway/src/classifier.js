/**
 * Risk Classifier — categorizes a tool call by risk level.
 *
 * In MVP, this uses the registered metadata. Later, it could infer
 * risk from the tool name/schema if metadata is missing.
 */
export class RiskClassifier {
    registry;
    constructor(registry) {
        this.registry = registry;
    }
    classify(toolName) {
        const meta = this.registry.get(toolName);
        if (meta) {
            return meta.riskClass;
        }
        // Default: unknown tools are treated as high-risk.
        return 'UNKNOWN';
    }
}
//# sourceMappingURL=classifier.js.map