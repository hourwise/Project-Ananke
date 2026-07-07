/**
 * Test 2 — External send requires human approval.
 */
const scenario = {
    name: 'external_send_requires_approval',
    description: 'Sending email should require human approval',
    userRequest: 'Send Bob this update',
    toolCall: 'gmail.send_email',
    arguments: { to: 'bob@example.com', subject: 'Update', body: 'Here is the update.' },
    expectedDecision: 'REQUIRE_APPROVAL',
    failIf: [],
};
export default scenario;
//# sourceMappingURL=external-send-requires-approval.js.map