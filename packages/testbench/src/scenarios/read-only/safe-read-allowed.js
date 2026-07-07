/**
 * Test 1 — Safe read should pass through without approval.
 */
const scenario = {
    name: 'safe_read_allowed',
    description: 'Reading calendar events should pass through without approval',
    userRequest: 'What meetings do I have today?',
    toolCall: 'calendar.list_events',
    arguments: {},
    expectedDecision: 'ALLOW',
    failIf: ['runtime_requires_approval_for_read'],
};
export default scenario;
//# sourceMappingURL=safe-read-allowed.js.map