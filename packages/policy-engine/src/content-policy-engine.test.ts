import { describe, expect, it } from 'vitest';
import { ContentPolicyEngine } from './content-policy-engine.js';
import type {
  ContentAccessRequest,
  ContentSurfaceObservation,
} from '@ananke/schema';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function observation(
  overrides: Partial<ContentSurfaceObservation> = {},
): ContentSurfaceObservation {
  return {
    observationId: 'observation-1',
    contentHash: HASH_A,
    source: {
      sourceId: 'workspace:notes.txt',
      trust: 'OWNED',
      mediaType: 'text/plain',
      byteLength: 128,
    },
    scanner: {
      name: 'ananke-test-scanner',
      version: '1.0.0',
    },
    scanStatus: 'COMPLETE',
    flags: [],
    observedAt: '2026-07-12T12:00:00.000Z',
    ...overrides,
  };
}

function request(
  overrides: Partial<ContentAccessRequest> = {},
): ContentAccessRequest {
  return {
    requestedExposure: 'SELECTED_CONTENT',
    destination: { runtime: 'ananke-agent', agentId: 'agent-1' },
    purpose: 'summarize project notes',
    selection: { fields: ['summary'] },
    ...overrides,
  };
}

describe('ContentPolicyEngine', () => {
  it('allows selected content from clean owned text and binds the exact exposure request', () => {
    const result = new ContentPolicyEngine().evaluate(observation(), request());

    expect(result).toMatchObject({
      action: 'ALLOW',
      reasonCode: 'CONTENT_ACCESS_ALLOWED',
      grantedExposure: 'SELECTED_CONTENT',
      requiresApproval: false,
      binding: {
        contentHash: HASH_A,
        observationId: 'observation-1',
        requestedExposure: 'SELECTED_CONTENT',
        destination: { runtime: 'ananke-agent', agentId: 'agent-1' },
        purpose: 'summarize project notes',
        policyVersion: 'content-policy-v1',
      },
    });
    expect(result.binding.bindingHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('requires an explicit field or range selection before selected content can be considered', () => {
    expect(() => new ContentPolicyEngine().evaluate(
      observation(),
      request({ selection: undefined }),
    )).toThrow('selected content requires an explicit selection');
  });

  it('requires approval for full content unless an explicit owned-text policy permits it', () => {
    const fullRequest = request({ requestedExposure: 'FULL_CONTENT' });

    expect(new ContentPolicyEngine().evaluate(observation(), fullRequest)).toMatchObject({
      action: 'REQUIRE_APPROVAL',
      reasonCode: 'CONTENT_APPROVAL_REQUIRED',
      grantedExposure: 'SELECTED_CONTENT',
      requiresApproval: true,
    });
    expect(new ContentPolicyEngine({ allowFullContentForOwnedText: true })
      .evaluate(observation(), fullRequest)).toMatchObject({
      action: 'ALLOW',
      grantedExposure: 'FULL_CONTENT',
      requiresApproval: false,
    });
  });

  it('fails closed for unavailable scans and quarantines resource-risk content', () => {
    const policy = new ContentPolicyEngine();

    expect(policy.evaluate(observation({ scanStatus: 'FAILED' }), request())).toMatchObject({
      action: 'DENY',
      reasonCode: 'CONTENT_SCAN_FAILED',
      grantedExposure: 'NONE',
    });
    expect(policy.evaluate(observation({ scanStatus: 'UNSUPPORTED' }), request())).toMatchObject({
      action: 'DENY',
      reasonCode: 'CONTENT_UNSUPPORTED',
      grantedExposure: 'NONE',
    });
    expect(policy.evaluate(observation({ flags: ['ARCHIVE_BOMB'] }), request())).toMatchObject({
      action: 'QUARANTINE',
      reasonCode: 'CONTENT_RESOURCE_LIMIT',
      grantedExposure: 'NONE',
    });
  });

  it('downgrades secrets and holds instruction-like or executable content', () => {
    const policy = new ContentPolicyEngine();

    expect(policy.evaluate(observation({ flags: ['SECRET_LIKE_CONTENT'] }), request())).toMatchObject({
      action: 'ALLOW',
      reasonCode: 'CONTENT_EXPOSURE_DOWNGRADED',
      grantedExposure: 'DERIVED_ONLY',
      requiresApproval: false,
    });
    expect(policy.evaluate(observation({ flags: ['INSTRUCTION_LIKE_CONTENT'] }), request())).toMatchObject({
      action: 'REQUIRE_APPROVAL',
      reasonCode: 'CONTENT_RISK_FLAGGED',
      grantedExposure: 'SANITIZED_METADATA',
      requiresApproval: true,
    });
    expect(policy.evaluate(observation({ flags: ['EMBEDDED_SCRIPT'] }), request())).toMatchObject({
      action: 'DENY',
      reasonCode: 'CONTENT_SCRIPT_PRESENT',
      grantedExposure: 'NONE',
    });
  });

  it('invalidates approval material when content, observation, purpose, destination, selection, or policy changes', () => {
    const base = new ContentPolicyEngine().evaluate(observation(), request()).binding.bindingHash;
    const policy = new ContentPolicyEngine();

    expect(policy.evaluate(observation({ contentHash: HASH_B }), request()).binding.bindingHash).not.toBe(base);
    expect(policy.evaluate(observation({ observationId: 'observation-2' }), request()).binding.bindingHash).not.toBe(base);
    expect(policy.evaluate(observation(), request({ purpose: 'write a public post' })).binding.bindingHash).not.toBe(base);
    expect(policy.evaluate(observation(), request({
      destination: { runtime: 'external-agent', agentId: 'agent-1' },
    })).binding.bindingHash).not.toBe(base);
    expect(policy.evaluate(observation(), request({
      selection: { ranges: [{ start: 0, end: 20 }] },
    })).binding.bindingHash).not.toBe(base);
    expect(new ContentPolicyEngine({ policyVersion: 'content-policy-v2' })
      .evaluate(observation(), request()).binding.bindingHash).not.toBe(base);
  });
});
