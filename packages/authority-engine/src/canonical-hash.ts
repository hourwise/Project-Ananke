import { createHash } from 'node:crypto';

/**
 * Canonical JSON serialization:
 * - Sorts all object keys alphabetically.
 * - Accepts only JSON-shaped values with no JavaScript-only semantics.
 * - Rejects values that JSON.stringify would coerce, omit, or otherwise
 *   serialize differently from the value passed to a tool executor.
 */
export function canonicalJson(value: unknown): string {
  return serialize(value, '$', new WeakSet<object>());
}

function invalidValue(path: string, detail: string): never {
  throw new TypeError(`Approval payload must contain only JSON data: ${detail} at ${path}`);
}

function serialize(value: unknown, path: string, seen: WeakSet<object>): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value) || Object.is(value, -0)) {
        invalidValue(path, 'numbers must be finite and cannot be negative zero');
      }
      return JSON.stringify(value);
    case 'undefined':
    case 'bigint':
    case 'function':
    case 'symbol':
      invalidValue(path, `unsupported ${typeof value} value`);
    case 'object':
      return Array.isArray(value)
        ? serializeArray(value, path, seen)
        : serializeObject(value, path, seen);
  }

  return invalidValue(path, 'unsupported value');
}

function serializeArray(value: unknown[], path: string, seen: WeakSet<object>): string {
  if (seen.has(value)) invalidValue(path, 'cyclic or shared object references are not supported');
  seen.add(value);

  if (Object.getOwnPropertySymbols(value).length > 0) {
    invalidValue(path, 'symbol properties are not supported');
  }

  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === 'length') continue;
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= value.length || String(index) !== key) {
      invalidValue(path, 'arrays cannot have custom properties');
    }
  }

  const items: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) invalidValue(`${path}[${index}]`, 'sparse arrays are not supported');
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor)) {
      invalidValue(`${path}[${index}]`, 'accessor properties are not supported');
    }
    items.push(serialize(descriptor.value, `${path}[${index}]`, seen));
  }

  return `[${items.join(',')}]`;
}

function serializeObject(value: object, path: string, seen: WeakSet<object>): string {
  if (seen.has(value)) invalidValue(path, 'cyclic or shared object references are not supported');
  seen.add(value);

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    invalidValue(path, 'only plain objects are supported');
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    invalidValue(path, 'symbol properties are not supported');
  }

  const keys = Object.keys(value).sort();
  if (Object.getOwnPropertyNames(value).length !== keys.length) {
    invalidValue(path, 'non-enumerable properties are not supported');
  }

  const properties = keys.map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) {
      invalidValue(`${path}.${key}`, 'accessor properties are not supported');
    }
    return `${JSON.stringify(key)}:${serialize(descriptor.value, `${path}.${key}`, seen)}`;
  });

  return `{${properties.join(',')}}`;
}

/**
 * Produces a SHA-256 hash of the canonical JSON representation.
 */
export function hashCanonicalCall(args: Record<string, unknown>): string {
  const canonical = canonicalJson(args);
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Verifies that two sets of arguments produce the same canonical hash.
 */
export function verifyApprovalBinding(
  approvedArgs: Record<string, unknown>,
  proposedArgs: Record<string, unknown>,
): boolean {
  return hashCanonicalCall(approvedArgs) === hashCanonicalCall(proposedArgs);
}
