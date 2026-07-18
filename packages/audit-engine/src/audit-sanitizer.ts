import { createHash } from 'node:crypto';
import type { AuditEvent } from '@ananke/schema';

const REDACTED = '[REDACTED]';
const SENSITIVE_METADATA_KEY =
  /^(?:content|data|error|raw|payload|body|prompt|selection|purpose|destination)$/i;
const SECRET_METADATA_KEY =
  /secret|token|password|authorization|cookie|credential|private.?key|display.?name|email/i;
const PRINCIPAL_METADATA_KEY = /^(?:operatorId|sessionId|agentPrincipalId|authenticatedPrincipalId|actingPrincipalId|representedPrincipalId|tenantId|sourceId)$/i;
const SAFE_STRING_METADATA_KEY =
  /^(?:decision|authMethod|status|action|reasonCode|requestedExposure|grantedExposure|sourceTrust|mediaType|scanStatus|policyVersion|bindingHash|contentHash|approvalHash|observationId|contentApprovalReceiptId|requestedAt|expiresAt|approvedAt|rejectedAt|createdAt|lastAuthenticatedAt|revokedAt|decidedAt|revocationReason|invalidationReason|toolName|runtime|runtimeInstanceId|requestId|correlationId|causationId|actionId|approvalId|auditId|verifiedGrantId|roles|operatorRoles|flags|name|version)$/i;

function pseudonym(value: unknown): string {
  return `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
}

function sanitizeMetadataValue(value: unknown, key?: string): unknown {
  if (key && (SENSITIVE_METADATA_KEY.test(key) || SECRET_METADATA_KEY.test(key))) {
    return REDACTED;
  }
  if (key && PRINCIPAL_METADATA_KEY.test(key)) {
    return pseudonym(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadataValue(item, key));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([nestedKey, nestedValue]) => [
        nestedKey,
        sanitizeMetadataValue(nestedValue, nestedKey),
      ]),
    );
  }
  if (typeof value === 'string' && (!key || !SAFE_STRING_METADATA_KEY.test(key))) {
    return REDACTED;
  }
  return value;
}

/**
 * The sole ingress boundary for every audit backend. Raw arguments, returned
 * values, error strings, and likely credential/PII metadata never cross it.
 */
export function sanitizeAuditEvent(event: AuditEvent): AuditEvent {
  return {
    ...event,
    arguments: event.arguments
      ? { _redacted: true, fieldCount: Object.keys(event.arguments).length }
      : undefined,
    outcome: event.outcome
      ? {
          ...event.outcome,
          data: undefined,
          error: undefined,
          nextAction: undefined,
        }
      : undefined,
    metadata: event.metadata
      ? (sanitizeMetadataValue(event.metadata) as Record<string, unknown>)
      : undefined,
  };
}
