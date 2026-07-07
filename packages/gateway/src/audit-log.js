/**
 * In-memory Audit Log — records every decision and side effect.
 * Use SqliteAuditLog for persistent storage.
 */
export class AuditLog {
    events = [];
    record(event) {
        const full = {
            ...event,
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
        };
        this.events.push(full);
        return full;
    }
    recordToolCallRequested(toolName, args, serverName) {
        return this.record({
            eventType: 'TOOL_CALL_REQUESTED',
            toolName,
            serverName,
            arguments: args,
        });
    }
    recordPolicyChecked(toolName, decision) {
        return this.record({
            eventType: 'POLICY_CHECKED',
            toolName,
            policyDecision: decision,
        });
    }
    recordApprovalRequested(toolName, approvalHash, args) {
        return this.record({
            eventType: 'APPROVAL_REQUESTED',
            toolName,
            approvalHash,
            arguments: args,
        });
    }
    recordApprovalGranted(toolName, approvalHash) {
        return this.record({
            eventType: 'APPROVAL_GRANTED',
            toolName,
            approvalHash,
        });
    }
    recordApprovalDenied(toolName, approvalHash) {
        return this.record({
            eventType: 'APPROVAL_DENIED',
            toolName,
            approvalHash,
        });
    }
    recordApprovalInvalidated(toolName, approvalHash) {
        return this.record({
            eventType: 'APPROVAL_INVALIDATED',
            toolName,
            approvalHash,
        });
    }
    recordToolExecuted(toolName, outcome, durationMs) {
        return this.record({
            eventType: 'TOOL_EXECUTED',
            toolName,
            outcome,
            durationMs,
        });
    }
    recordToolFailed(toolName, outcome, durationMs) {
        return this.record({
            eventType: 'TOOL_FAILED',
            toolName,
            outcome,
            durationMs,
        });
    }
    recordOutcomeGenerated(toolName, outcome) {
        return this.record({
            eventType: 'OUTCOME_GENERATED',
            toolName,
            outcome,
        });
    }
    query(filter) {
        let results = [...this.events];
        if (filter?.toolName) {
            results = results.filter((e) => e.toolName === filter.toolName);
        }
        if (filter?.eventType) {
            results = results.filter((e) => e.eventType === filter.eventType);
        }
        if (filter?.since) {
            results = results.filter((e) => e.timestamp >= filter.since);
        }
        if (filter?.limit) {
            results = results.slice(-filter.limit);
        }
        return results;
    }
    all() {
        return [...this.events];
    }
    clear() {
        this.events = [];
    }
}
//# sourceMappingURL=audit-log.js.map