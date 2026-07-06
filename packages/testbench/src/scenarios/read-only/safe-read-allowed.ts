import type { TestScenario } from '../../runner.js';

/**
 * Test 1 — Safe read should pass through without approval.
 */
const scenario: TestScenario = {
  name: 'safe_read_allowed',
  description: 'Reading calendar events should pass through without approval',
  userRequest: 'What meetings do I have today?',
  toolCall: 'calendar.list_events',
  arguments: {},
  expectedDecision: 'ALLOW',
  failIf: ['runtime_requires_approval_for_read'],
};

export default scenario;
