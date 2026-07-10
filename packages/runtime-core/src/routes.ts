import { Hono } from 'hono';
import type { Gateway } from './index.js';
import { canonicalJson } from '@ananke/authority-engine';
import { AuditEventType, type OperatorIdentity } from '@ananke/schema';

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

function requireOperator(gateway: Gateway, authorizationHeader?: string): OperatorIdentity | undefined {
  return gateway.authenticateOperator(authorizationHeader);
}

function decisionMetadata(decision: 'approved' | 'rejected', operator: OperatorIdentity): Record<string, unknown> {
  return {
    decision,
    operatorId: operator.operatorId,
    operatorDisplayName: operator.displayName,
    sessionId: operator.sessionId,
    authMethod: operator.authMethod,
    decidedAt: new Date().toISOString(),
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
    }>();
    const result = await gateway.execute(body.toolName, body.arguments, {
      approvalId: body.approvalId,
    });
    return c.json(result);
  });

  // ── Approvals ────────────────────────────────────────────

  router.get('/approvals', (c) => {
    const operator = requireOperator(gateway, c.req.header('authorization'));
    if (!operator) {
      return c.json({ error: 'Missing or invalid approval operator token' }, 401);
    }

    return c.json(gateway.approvals.pending().map((approval) => approvalResponse(gateway, approval)));
  });

  router.post('/approvals/:id/approve', async (c) => {
    const id = c.req.param('id');
    const operator = requireOperator(gateway, c.req.header('authorization'));
    if (!operator) {
      return c.json({ error: 'Missing or invalid approval operator token' }, 401);
    }

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
    const operator = requireOperator(gateway, c.req.header('authorization'));
    if (!operator) {
      return c.json({ error: 'Missing or invalid approval operator token' }, 401);
    }

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

  // ── Audit ────────────────────────────────────────────────

  router.get('/audit', (c) => {
    const operator = requireOperator(gateway, c.req.header('authorization'));
    if (!operator) {
      return c.json({ error: 'Missing or invalid audit operator token' }, 401);
    }

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

  router.get('/stats', (c) => {
    const events = gateway.audit.all();
    const executed = events.filter((e) => e.eventType === 'TOOL_EXECUTED').length;
    const failed = events.filter((e) => e.eventType === 'TOOL_FAILED').length;
    const denied = events.filter((e) => e.eventType === 'POLICY_CHECKED' && e.policyDecision === 'DENY').length;
    const pendingApprovals = gateway.approvals.pending().length;
    return c.json({ executed, failed, denied, pendingApprovals, totalEvents: events.length });
  });

  return router;
}
