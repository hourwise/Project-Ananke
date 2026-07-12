import { createHash } from 'node:crypto';
import { canonicalJson, hashCanonicalCall } from '@ananke/authority-engine';
import type {
  ContentAccessRequest,
  ContentExposureLevel,
  ContentRiskFlag,
  ContentSourceTrust,
  ContentSurfaceObservation,
  ToolMetadata,
} from '@ananke/schema';

export interface ContentSurfaces {
  DERIVED_ONLY?: unknown;
  SANITIZED_METADATA?: unknown;
  SELECTED_CONTENT?: unknown;
  FULL_CONTENT?: unknown;
}

export interface ContentPreflightInput {
  toolName: string;
  tool: ToolMetadata;
  arguments: Record<string, unknown>;
  data: unknown;
  request: ContentAccessRequest;
}

export interface ContentPreflightResult {
  observation: ContentSurfaceObservation;
  surfaces: ContentSurfaces;
}

/**
 * An adapter owns scanning and safe rendering. It may inspect raw tool output,
 * but only the surface selected by gateway policy can leave the runtime.
 */
export interface ContentPreflightAdapter {
  preflight(input: ContentPreflightInput): Promise<ContentPreflightResult>;
}

export interface JsonContentPreflightAdapterConfig {
  sourceTrust?: ContentSourceTrust;
  sourceId?: string | ((input: ContentPreflightInput) => string);
  mediaType?: string;
  scannerName?: string;
  scannerVersion?: string;
  maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 1024 * 1024;

/**
 * A narrow local adapter for strict JSON output. It produces safe derived and
 * metadata surfaces and applies lightweight advisory findings. Production
 * deployments should replace it with a source-aware scanner adapter.
 */
export class JsonContentPreflightAdapter implements ContentPreflightAdapter {
  private readonly config: Required<Omit<JsonContentPreflightAdapterConfig, 'sourceId'>> & {
    sourceId?: JsonContentPreflightAdapterConfig['sourceId'];
  };

  constructor(config: JsonContentPreflightAdapterConfig = {}) {
    this.config = {
      sourceTrust: config.sourceTrust ?? 'UNKNOWN',
      sourceId: config.sourceId,
      mediaType: config.mediaType ?? 'application/json',
      scannerName: config.scannerName ?? 'ananke-json-heuristic',
      scannerVersion: config.scannerVersion ?? '1',
      maxBytes: config.maxBytes ?? DEFAULT_MAX_BYTES,
    };
  }

  async preflight(input: ContentPreflightInput): Promise<ContentPreflightResult> {
    const canonical = canonicalJson(input.data);
    const byteLength = Buffer.byteLength(canonical, 'utf8');
    const flags = inspectJsonContent(input.data, byteLength, this.config.maxBytes);
    const sourceId = typeof this.config.sourceId === 'function'
      ? this.config.sourceId(input)
      : this.config.sourceId ?? ('tool:' + input.toolName);
    const contentHash = createHash('sha256').update(canonical).digest('hex');

    const observation: ContentSurfaceObservation = {
      observationId: hashCanonicalCall({
        sourceId,
        contentHash,
        scanner: {
          name: this.config.scannerName,
          version: this.config.scannerVersion,
        },
        flags,
      }),
      contentHash,
      source: {
        sourceId,
        trust: this.config.sourceTrust,
        mediaType: this.config.mediaType,
        byteLength,
      },
      scanner: {
        name: this.config.scannerName,
        version: this.config.scannerVersion,
      },
      scanStatus: 'COMPLETE',
      flags,
      observedAt: new Date().toISOString(),
    };

    return {
      observation,
      surfaces: {
        DERIVED_ONLY: {
          contentHash: observation.contentHash,
          mediaType: observation.source.mediaType,
          byteLength,
          scanStatus: observation.scanStatus,
          riskFlags: flags,
        },
        SANITIZED_METADATA: {
          contentHash: observation.contentHash,
          mediaType: observation.source.mediaType,
          byteLength,
          topLevelType: topLevelType(input.data),
          topLevelFieldCount: topLevelFieldCount(input.data),
          riskFlagCount: flags.length,
        },
        SELECTED_CONTENT: selectedJsonContent(input.data, input.request),
        FULL_CONTENT: input.data,
      },
    };
  }
}

export function contentSurfaceFor(
  surfaces: ContentSurfaces,
  exposure: ContentExposureLevel,
): unknown | undefined {
  switch (exposure) {
    case 'NONE':
      return undefined;
    case 'DERIVED_ONLY':
      return surfaces.DERIVED_ONLY;
    case 'SANITIZED_METADATA':
      return surfaces.SANITIZED_METADATA;
    case 'SELECTED_CONTENT':
      return surfaces.SELECTED_CONTENT;
    case 'FULL_CONTENT':
      return surfaces.FULL_CONTENT;
  }
}

function inspectJsonContent(data: unknown, byteLength: number, maxBytes: number): ContentRiskFlag[] {
  const flags = new Set<ContentRiskFlag>();
  if (byteLength > maxBytes) flags.add('OVERSIZED_PAYLOAD');

  const text = collectText(data).join('\n');
  if (/(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]/i.test(text)) {
    flags.add('SECRET_LIKE_CONTENT');
  }
  if (/\bignore\s+(?:all\s+)?(?:previous|prior)\s+instructions\b|\bsystem\s+prompt\b/i.test(text)) {
    flags.add('INSTRUCTION_LIKE_CONTENT');
  }
  if (/<script\b|#!\/|(?:powershell|cmd\.exe|bash)\s/i.test(text)) {
    flags.add('EMBEDDED_SCRIPT');
  }

  return [...flags].sort();
}

function collectText(value: unknown, texts: string[] = []): string[] {
  if (typeof value === 'string') {
    texts.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectText(item, texts);
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) collectText(child, texts);
  }
  return texts;
}

function topLevelType(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function topLevelFieldCount(value: unknown): number | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value).length
    : undefined;
}

function selectedJsonContent(
  data: unknown,
  request: ContentAccessRequest,
): unknown | undefined {
  const selection = request.selection;
  if (!selection) return undefined;

  const selected: { fields?: Record<string, unknown>; ranges?: string[] } = {};
  if (selection.fields && data && typeof data === 'object' && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    const fields = Object.fromEntries(
      selection.fields
        .filter((field) => Object.hasOwn(record, field))
        .map((field) => [field, record[field]]),
    );
    if (Object.keys(fields).length > 0) selected.fields = fields;
  }
  if (selection.ranges && typeof data === 'string') {
    selected.ranges = selection.ranges.map((range) => data.slice(range.start, range.end));
  }

  return Object.keys(selected).length > 0 ? selected : undefined;
}
