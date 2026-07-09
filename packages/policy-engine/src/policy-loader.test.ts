import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  discoverPolicyConfigFile,
  loadPolicyConfigFile,
  parsePolicyConfig,
} from './policy-loader.js';

describe('Policy Config Loader', () => {
  it('parses ananke.policy.yaml with a tools root', () => {
    const config = parsePolicyConfig(`
tools:
  gmail.send_email:
    risk: EXTERNAL_SEND
    approval: never
    maxRetries: 2
  github.delete_branch:
    risk: DELETE
    approval: required
`);

    expect(config['gmail.send_email']).toEqual({
      risk: 'EXTERNAL_SEND',
      approval: 'never',
      maxRetries: 2,
    });
    expect(config['github.delete_branch']).toEqual({
      risk: 'DELETE',
      approval: 'required',
      maxRetries: 1,
    });
  });

  it('parses top-level tool mappings', () => {
    const config = parsePolicyConfig(`
calendar.list_events:
  risk: READ_ONLY
  approval: required
`);

    expect(config['calendar.list_events']).toEqual({
      risk: 'READ_ONLY',
      approval: 'required',
      maxRetries: 1,
    });
  });

  it('parses JSON policy files', () => {
    const config = parsePolicyConfig(
      JSON.stringify({
        tools: {
          'filesystem.write_file': {
            risk: 'INTERNAL_WRITE',
            approval: 'required',
            condition: 'local_only',
          },
        },
      }),
      'ananke.policy.json',
    );

    expect(config['filesystem.write_file']).toEqual({
      risk: 'INTERNAL_WRITE',
      approval: 'required',
      condition: 'local_only',
      maxRetries: 1,
    });
  });

  it('loads the first discovered policy file', () => {
    const dir = join(tmpdir(), `ananke-policy-${crypto.randomUUID()}`);
    mkdirSync(dir, { recursive: true });

    try {
      const filePath = join(dir, 'ananke.policy.yaml');
      writeFileSync(filePath, 'tools:\n  gmail.send_email:\n    risk: EXTERNAL_SEND\n    approval: required\n');

      expect(discoverPolicyConfigFile(dir)).toBe(filePath);
      expect(loadPolicyConfigFile(filePath).config['gmail.send_email']?.approval).toBe('required');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects invalid policy values', () => {
    expect(() => parsePolicyConfig(`
tools:
  gmail.send_email:
    risk: EXTERNAL_SEND
    approval: maybe
`)).toThrow();
  });
});
