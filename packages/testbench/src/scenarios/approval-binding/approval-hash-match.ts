import type { TestScenario } from '../../runner.js';

/**
 * Test 3 — Approval hash match executes successfully.
 */
const scenario: TestScenario = {
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
