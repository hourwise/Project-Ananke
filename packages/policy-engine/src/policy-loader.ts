import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PolicyConfig } from '@ananke/schema';
import type { PolicyConfig as PolicyConfigType } from '@ananke/schema';

export const DEFAULT_POLICY_FILE_NAMES = [
  'ananke.policy.yaml',
  'ananke.policy.yml',
  'ananke.policy.json',
] as const;

export interface PolicyFileLoadResult {
  path: string;
  config: PolicyConfigType;
}

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseScalar(value: string): unknown {
  const unquoted = stripQuotes(value);
  if (unquoted === 'true') return true;
  if (unquoted === 'false') return false;
  if (unquoted === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(unquoted)) return Number(unquoted);
  return unquoted;
}

function parseSimpleYaml(text: string): PlainObject {
  const root: PlainObject = {};
  const stack: Array<{ indent: number; value: PlainObject }> = [{ indent: -1, value: root }];

  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue;
    if (rawLine.includes('\t')) {
      throw new Error('Policy YAML must use spaces, not tabs');
    }

    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trim();
    const match = /^([^:]+):(.*)$/.exec(line);
    if (!match) {
      throw new Error(`Unsupported policy YAML line: ${line}`);
    }

    const key = stripQuotes(match[1]!.trim());
    const rawValue = match[2]!.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1]!.indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1]!.value;
    if (!rawValue) {
      const child: PlainObject = {};
      parent[key] = child;
      stack.push({ indent, value: child });
      continue;
    }

    parent[key] = parseScalar(rawValue);
  }

  return root;
}

function normalizePolicyRoot(parsed: unknown): unknown {
  if (!isPlainObject(parsed)) {
    throw new Error('Policy config must be an object');
  }

  return isPlainObject(parsed.tools) ? parsed.tools : parsed;
}

export function parsePolicyConfig(text: string, sourcePath = 'ananke.policy.yaml'): PolicyConfigType {
  const parsed = sourcePath.endsWith('.json')
    ? JSON.parse(text) as unknown
    : parseSimpleYaml(text);

  return PolicyConfig.parse(normalizePolicyRoot(parsed));
}

export function loadPolicyConfigFile(filePath: string): PolicyFileLoadResult {
  const text = readFileSync(filePath, 'utf8');
  return {
    path: filePath,
    config: parsePolicyConfig(text, filePath),
  };
}

export function discoverPolicyConfigFile(
  cwd = process.cwd(),
  fileNames: readonly string[] = DEFAULT_POLICY_FILE_NAMES,
): string | undefined {
  return fileNames.map((fileName) => join(cwd, fileName)).find((filePath) => existsSync(filePath));
}
