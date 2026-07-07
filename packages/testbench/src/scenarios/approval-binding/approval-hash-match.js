/**
 * Test 3 — Approval hash match executes successfully.
 */
const scenario = {
    name: 'approval_hash_match_executes',
    description: 'Approved exact call should execute successfully',
    userRequest: 'Send the approved email',
    toolCall: 'gmail.send_email',
    arguments: { to: 'bob@example.com', subject: 'Update', body: 'Here is the update.' },
    expectedDecision: 'REQUIRE_APPROVAL',
    expectedState: 'COMPLETED',
    failIf: [],
};
export default scenario;
//# sourceMappingURL=approval-hash-match.js.map