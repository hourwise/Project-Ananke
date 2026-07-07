import { Hono } from 'hono';
export function createGatewayRoutes(gateway) {
    const router = new Hono();
    // ── Tools ────────────────────────────────────────────────
    router.get('/tools', (c) => {
        return c.json(gateway.registry.list());
    });
    router.get('/tools/:name', (c) => {
        const name = c.req.param('name');
        const tool = gateway.registry.get(name);
        if (!tool)
            return c.json({ error: 'Tool not found' }, 404);
        return c.json(tool);
    });
    // ── Execute ──────────────────────────────────────────────
    router.post('/execute', async (c) => {
        const body = await c.req.json();
        const result = await gateway.execute(body.toolName, body.arguments, {
            approvalId: body.approvalId,
        });
        return c.json(result);
    });
    // ── Approvals ────────────────────────────────────────────
    router.get('/approvals', (c) => {
        return c.json(gateway.approvals.pending());
    });
    // ── Audit ────────────────────────────────────────────────
    router.get('/audit', (c) => {
        const toolName = c.req.query('toolName');
        const eventType = c.req.query('eventType');
        const since = c.req.query('since');
        const limit = c.req.query('limit') ? parseInt(c.req.query('limit')) : undefined;
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
//# sourceMappingURL=routes.js.map