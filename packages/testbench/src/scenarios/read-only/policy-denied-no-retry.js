/**
 * Test 6 — Policy denied should not be retryable.
 */
const scenario = {
    name: 'policy_denied_no_retry',
    description: 'Forbidden actions should be marked non-retryable',
    userRequest: 'Do something dangerous',
    toolCall: 'dangerous_unknown_tool',
    arguments: {},
    expectedDecision: 'DENY',
    expectedState: 'DENIED',
    failIf: [],
};
export default scenario;
//# sourceMappingURL=policy-denied-no-retry.js.map