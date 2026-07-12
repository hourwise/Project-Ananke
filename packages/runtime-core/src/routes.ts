import { Hono } from 'hono';
import type { Gateway } from './index.js';
import { canonicalJson } from '@ananke/authority-engine';
import {
  AuditEventType,
  type ContentAccessRequest,
  type ContentApprovalReceipt,
  type OperatorIdentity,
} from '@ananke/schema';
import {
  hasOperatorPermission,
  permissionsForOperator,
  type OperatorPermission,
} from './auth.js';

const DEFAULT_AUDIT_QUERY_LIMIT = 100;
const MAX_AUDIT_QUERY_LIMIT = 500;

function approvalResponse(gateway: Gateway, approval: NonNullable<ReturnType<Gateway['approvals']['get']>>) {
  const tool = gateway.registry.get(approval.toolName);
  return {
    ...approval,
    riskClass: tool?.riskClass ?? 'UNKNOWN',
    canonicalPayload: canonicalJson(approval.arguments),
  };
}

async function requireOperator(
  gateway: Gateway,
  authorizationHeader?: string,
): Promise<OperatorIdentity | undefined> {
  return gateway.authenticateOperator(authorizationHeader);
}

async function authorizeOperator(
  gateway: Gateway,
  authorizationHeader: string | undefined,
  permission: OperatorPermission,
): Promise<
  | { operator: OperatorIdentity }
  | { status: 401 | 403; error: string }
> {
  const operator = await requireOperator(gateway, authorizationHeader);
  if (!operator) {
    return { status: 401, error: 'Missing, invalid, or expired operator credential' };
  }
  if (!hasOperatorPermission(operator, permission)) {
    return { status: 403, error: `Operator lacks required permission: ${permission}` };
  }
  return { operator };
}

function decisionMetadata(decision: 'approved' | 'rejected', operator: OperatorIdentity): Record<string, unknown> {
  return {
    decision,
    operatorId: operator.operatorId,
    operatorDisplayName: operator.displayName,
    sessionId: operator.sessionId,
    authMethod: operator.authMethod,
    operatorRoles: operator.roles,
    decidedAt: new Date().toISOString(),
  };
}

function contentApprovalMetadata(
  decision: 'approved' | 'rejected',
  receipt: ContentApprovalReceipt,
  operator: OperatorIdentity,
): Record<string, unknown> {
  return {
    decision,
    contentApprovalReceiptId: receipt.id,
    operatorId: operator.operatorId,
    operatorDisplayName: operator.displayName,
    sessionId: operator.sessionId,
    authMethod: operator.authMethod,
    operatorRoles: operator.roles,
    decidedAt: new Date().toISOString(),
    toolName: receipt.toolName,
    bindingHash: receipt.binding.bindingHash,
    contentHash: receipt.binding.contentHash,
    observationId: receipt.binding.observationId,
    requestedExposure: receipt.binding.requestedExposure,
    destination: receipt.binding.destination,
    purpose: receipt.binding.purpose,
    policyVersion: receipt.binding.policyVersion,
    selection: receipt.binding.selection,
  };
}

export function createGatewayRoutes(gateway: Gateway): Hono {
  const router = new Hono();

  // ── Tools ────────────────────────────────────────────────

  router.get('/tools', (c) => {
    return c.json(gateway.registry.list());
  });

  router.get('/tools/:name', (c) => {
    const name = c.req.param('name');
    const tool = gateway.registry.get(name);
    if (!tool) return c.json({ error: 'Tool not found' }, 404);
    return c.json(tool);
  });

  // ── Execute ──────────────────────────────────────────────

  router.post('/execute', async (c) => {
    const body = await c.req.json<{
      toolName: string;
      arguments: Record<string, unknown>;
      approvalId?: string;
      contentAccess?: ContentAccessRequest;
      contentApprovalId?: string;
    }>();
    const result = await gateway.execute(body.toolName, body.arguments, {
      approvalId: body.approvalId,
      contentAccess: body.contentAccess,
      contentApprovalId: body.contentApprovalId,
    });
    return c.json(result);
  });

  // ── Approvals ────────────────────────────────────────────

  router.get('/auth/me', async (c) => {
    const operator = await requireOperator(gateway, c.req.header('authorization'));
    if (!operator) {
      return c.json({ error: 'Missing, invalid, or expired operator credential' }, 401);
    }

    return c.json({ ...operator, permissions: permissionsForOperator(operator) });
  });

  router.post('/auth/logout', async (c) => {
    const operator = await requireOperator(gateway, c.req.header('authorization'));
    if (!operator) {
      return c.json({ error: 'Missing, invalid, expired, or revoked operator credential' }, 401);
    }

    const session = gateway.revokeOperatorSession(operator);
    if (!session) {
      return c.json({ error: 'Operator session is no longer active' }, 409);
    }
    return c.json({
      sessionId: session.sessionId,
      status: 'revoked',
      revokedAt: session.revokedAt,
    });
  });

  router.get('/approvals', async (c) => {
    const authorization = await authorizeOperator(
      gateway,
      c.req.header('authorization'),
      'approvals:read',
    );
    if (!('operator' in authorization)) return c.json({ error: authorization.error }, authorization.status);

    return c.json(gateway.approvals.pending().map((approval) => approvalResponse(gateway, approval)));
  });

  router.post('/approvals/:id/approve', async (c) => {
    const id = c.req.param('id');
    const authorization = await authorizeOperator(
      gateway,
      c.req.header('authorization'),
      'approvals:decide',
    );
    if (!('operator' in authorization)) return c.json({ error: authorization.error }, authorization.status);
    const { operator } = authorization;

    const grant = gateway.approvals.approve(id, operator);

    if (!grant) {
      return c.json({ error: 'Approval not found or no longer approvable' }, 404);
    }

    gateway.audit.recordApprovalGranted(
      grant.toolName,
      grant.canonicalHash,
      decisionMetadata('approved', operator),
    );
    return c.json(approvalResponse(gateway, grant));
  });

  router.post('/approvals/:id/reject', async (c) => {
    const id = c.req.param('id');
    const authorization = await authorizeOperator(
      gateway,
      c.req.header('authorization'),
      'approvals:decide',
    );
    if (!('operator' in authorization)) return c.json({ error: authorization.error }, authorization.status);
    const { operator } = authorization;

    const grant = gateway.approvals.reject(id, operator);

    if (!grant) {
      return c.json({ error: 'Approval not found or no longer rejectable' }, 404);
    }

    gateway.audit.recordApprovalDenied(
      grant.toolName,
      grant.canonicalHash,
      decisionMetadata('rejected', operator),
    );
    return c.json(approvalResponse(gateway, grant));
  });

  router.get('/content-approvals', async (c) => {
    const authorization = await authorizeOperator(
      gateway,
      c.req.header('authorization'),
      'approvals:read',
    );
    if (!('operator' in authorization)) return c.json({ error: authorization.error }, authorization.status);

    return c.json(gateway.pendingContentApprovals());
  });

  router.post('/content-approvals/:id/approve', async (c) => {
    const authorization = await authorizeOperator(
      gateway,
      c.req.header('authorization'),
      'approvals:decide',
    );
    if (!('operator' in authorization)) return c.json({ error: authorization.error }, authorization.status);

    const receipt = gateway.approveContentApproval(c.req.param('id'), authorization.operator);
    if (!receipt) {
      return c.json({ error: 'Content approval not found or no longer approvable' }, 404);
    }
    gateway.audit.recordContentApprovalEvent(
      'CONTENT_APPROVAL_GRANTED',
      receipt.toolName,
      receipt.binding.bindingHash,
      contentApprovalMetadata('approved', receipt, authorization.operator),
    );
    return c.json(receipt);
  });

  router.post('/content-approvals/:id/reject', async (c) => {
    const authorization = await authorizeOperator(
      gateway,
      c.req.header('authorization'),
      'approvals:decide',
    );
    if (!('operator' in authorization)) return c.json({ error: authorization.error }, authorization.status);

    const receipt = gateway.rejectContentApproval(c.req.param('id'), authorization.operator);
    if (!receipt) {
      return c.json({ error: 'Content approval not found or no longer rejectable' }, 404);
    }
    gateway.audit.recordContentApprovalEvent(
      'CONTENT_APPROVAL_DENIED',
      receipt.toolName,
      receipt.binding.bindingHash,
      contentApprovalMetadata('rejected', receipt, authorization.operator),
    );
    return c.json(receipt);
  });

  // ── Audit ────────────────────────────────────────────────

  router.get('/audit', async (c) => {
    const authorization = await authorizeOperator(
      gateway,
      c.req.header('authorization'),
      'audit:read',
    );
    if (!('operator' in authorization)) return c.json({ error: authorization.error }, authorization.status);

    const toolName = c.req.query('toolName');
    const requestedEventType = c.req.query('eventType');
    const eventType = requestedEventType ? AuditEventType.safeParse(requestedEventType) : undefined;
    if (eventType && !eventType.success) {
      return c.json({ error: 'Invalid eventType filter' }, 400);
    }

    const since = c.req.query('since');
    if (since && Number.isNaN(Date.parse(since))) {
      return c.json({ error: 'Invalid since filter; use an ISO 8601 timestamp' }, 400);
    }

    const requestedLimit = c.req.query('limit');
    let limit = DEFAULT_AUDIT_QUERY_LIMIT;
    if (requestedLimit) {
      if (!/^\d+$/.test(requestedLimit)) {
        return c.json({ error: 'Invalid limit; use a positive integer' }, 400);
      }
      limit = Number(requestedLimit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_AUDIT_QUERY_LIMIT) {
        return c.json({ error: 'Invalid limit; use an integer between 1 and 500' }, 400);
      }
    }

    return c.json(gateway.audit.query({ toolName, eventType: eventType?.data, since, limit }));
  });

  // ── Health / Stats ───────────────────────────────────────

  router.get('/stats', async (c) => {
    const authorization = await authorizeOperator(
      gateway,
      c.req.header('authorization'),
      'stats:read',
    );
    if (!('operator' in authorization)) return c.json({ error: authorization.error }, authorization.status);

    const events = gateway.audit.all();
    const executed = events.filter((e) => e.eventType === 'TOOL_EXECUTED').length;
    const failed = events.filter((e) => e.eventType === 'TOOL_FAILED').length;
    const denied = events.filter((e) => e.eventType === 'POLICY_CHECKED' && e.policyDecision === 'DENY').length;
    const pendingApprovals = gateway.approvals.pending().length;
    return c.json({ executed, failed, denied, pendingApprovals, totalEvents: events.length });
  });

  return router;
}
