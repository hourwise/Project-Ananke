import { describe, expect, it } from 'vitest';
import { RiskClass } from '@ananke/schema';
import { PolicyEngine } from './policy-engine.js';

describe('PolicyEngine expanded risk classes', () => {
  it('accepts the governance risk classes required for skills and sandbox-aware execution', () => {
    expect(RiskClass.parse('CREDENTIAL_ACCESS')).toBe('CREDENTIAL_ACCESS');
    expect(RiskClass.parse('NETWORK_EGRESS')).toBe('NETWORK_EGRESS');
    expect(RiskClass.parse('SKILL_INSTALL')).toBe('SKILL_INSTALL');
    expect(RiskClass.parse('MODEL_PROVIDER_CHANGE')).toBe('MODEL_PROVIDER_CHANGE');
  });

  it.each([
    'CREDENTIAL_ACCESS',
    'NETWORK_EGRESS',
    'SKILL_INSTALL',
    'MODEL_PROVIDER_CHANGE',
  ] as const)('requires approval by default for %s', (riskClass) => {
    const policy = new PolicyEngine();

    expect(policy.evaluate(`test.${riskClass.toLowerCase()}`, riskClass)).toBe('REQUIRE_APPROVAL');
  });
});
