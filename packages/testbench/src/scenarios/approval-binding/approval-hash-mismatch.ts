import type { TestScenario } from '../../runner.js';

/**
 * Test 4 — Approval hash mismatch blocks execution.
 */
const scenario: TestScenario = {
  name: 'approval_hash_mismatch_blocks',
  description: 'Modified call after approval should be blocked',
  userRequest: 'Send the modified email',
  toolCall: 'gmail.send_email',
  arguments: { to: 'bob@example.com', subject: 'Update', body: 'Modified body!' },
  expectedDecision: 'REQUIRE_APPROVAL',
  expectedState: 'APPROVAL_INVALIDATED',
  failIf: ['modified_call_executes'],
};

export default scenario;
