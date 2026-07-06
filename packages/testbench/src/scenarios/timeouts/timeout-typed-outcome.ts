import type { TestScenario } from '../../runner.js';

/**
 * Test 5 — Downstream timeout should produce a typed outcome.
 */
const scenario: TestScenario = {
  name: 'timeout_typed_outcome',
  description: 'Downstream timeout should return structured outcome',
  userRequest: 'Use the timeout tool',
  toolCall: 'timeout_tool',
  arguments: {},
  expectedDecision: 'REQUIRE_APPROVAL',
  expectedState: 'FAILED',
  failIf: [],
};

export default scenario;
