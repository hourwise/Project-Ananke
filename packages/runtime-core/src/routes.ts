import { Hono } from 'hono';
import type { Gateway } from './index.js';
import { canonicalJson } from '@ananke/authority-engine';

function approvalResponse(gateway: Gateway, approval: NonNullable<ReturnType<Gateway['approvals']['get']>>) {
  const tool = gateway.registry.get(approval.toolName);
  return {
    ...approval,
    riskClass: tool?.riskClass ?? 'UNKNOWN',
    canonicalPayload: canonicalJson(approval.arguments),
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
    return c.json(gateway.approvals.pending().map((approval) => approvalResponse(gateway, approval)));
  });

  router.post('/approvals/:id/approve', async (c) => {
    const id = c.req.param('id');
    const body: { approvedBy?: string } = await c.req.json<{ approvedBy?: string }>().catch(() => ({}));
    const grant = gateway.approvals.approve(id, body.approvedBy ?? 'dashboard');

    if (!grant) {
      return c.json({ error: 'Approval not found or no longer approvable' }, 404);
    }

    gateway.audit.recordApprovalGranted(grant.toolName, grant.canonicalHash);
    return c.json(approvalResponse(gateway, grant));
  });

  router.post('/approvals/:id/reject', async (c) => {
    const id = c.req.param('id');
    const body: { rejectedBy?: string } = await c.req.json<{ rejectedBy?: string }>().catch(() => ({}));
    const grant = gateway.approvals.reject(id, body.rejectedBy ?? 'dashboard');

    if (!grant) {
      return c.json({ error: 'Approval not found or no longer rejectable' }, 404);
    }

    gateway.audit.recordApprovalDenied(grant.toolName, grant.canonicalHash);
    return c.json(approvalResponse(gateway, grant));
  });

  // ── Audit ────────────────────────────────────────────────

  router.get('/audit', (c) => {
    const toolName = c.req.query('toolName');
    const eventType = c.req.query('eventType') as
      | 'TOOL_CALL_REQUESTED'
      | 'POLICY_CHECKED'
      | 'APPROVAL_REQUESTED'
      | 'APPROVAL_GRANTED'
      | 'APPROVAL_DENIED'
      | 'APPROVAL_INVALIDATED'
      | 'TOOL_EXECUTED'
      | 'TOOL_FAILED'
      | 'OUTCOME_GENERATED'
      | undefined;
    const since = c.req.query('since');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;

    return c.json(gateway.audit.query({ toolName, eventType, since, limit }));
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
