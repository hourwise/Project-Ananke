import React, { useEffect, useState } from 'react';

interface Stats {
  executed: number;
  failed: number;
  denied: number;
  pendingApprovals: number;
  totalEvents: number;
}

interface AuditEvent {
  id: string;
  timestamp: string;
  eventType: string;
  toolName: string;
  policyDecision?: string;
  approvalHash?: string;
  outcome?: { state: string; reasonCode?: string };
  durationMs?: number;
}

interface Approval {
  id: string;
  toolName: string;
  riskClass: string;
  canonicalHash: string;
  canonicalPayload: string;
  arguments: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
}

const API = 'http://localhost:3000/api';
const DEV_OPERATOR_TOKEN = localStorage.getItem('ananke.operatorToken') ?? 'dev-approval-token';
const OPERATOR_SESSION_LABEL = 'local-dev-session';

function authHeaders(): HeadersInit {
  return {
    authorization: `Bearer ${DEV_OPERATOR_TOKEN}`,
  };
}

function App() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [tab, setTab] = useState<'audit' | 'approvals'>('audit');
  const [message, setMessage] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    const [statsRes, auditRes, approvalsRes] = await Promise.all([
      fetch(`${API}/stats`, { headers: authHeaders() }),
      fetch(`${API}/audit?limit=50`, { headers: authHeaders() }),
      fetch(`${API}/approvals`, { headers: authHeaders() }),
    ]);
    setStats(await statsRes.json());
    setAudit(await auditRes.json());
    setApprovals(await approvalsRes.json());
  }

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 3000);
    return () => clearInterval(interval);
  }, []);

  async function decideApproval(id: string, decision: 'approve' | 'reject'): Promise<void> {
    setMessage(null);

    const response = await fetch(`${API}/approvals/${id}/${decision}`, {
      method: 'POST',
      headers: authHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      setMessage(`${decision} failed: ${error.error ?? response.statusText}`);
      return;
    }

    setMessage(`Approval ${decision === 'approve' ? 'approved' : 'rejected'} by authenticated operator`);
    await refresh();
  }

  function statusColor(state: string): string {
    switch (state) {
      case 'COMPLETED': return '#22c55e';
      case 'FAILED': return '#ef4444';
      case 'DENIED': return '#f59e0b';
      case 'WAITING_FOR_APPROVAL': return '#38bdf8';
      case 'APPROVAL_INVALIDATED': return '#fb7185';
      default: return '#94a3b8';
    }
  }

  return (
    <div style={pageStyle}>
      <header style={{ marginBottom: 24 }}>
        <p style={{ margin: 0, color: '#38bdf8', fontWeight: 700, letterSpacing: 1 }}>
          ANANKE GOVERNANCE RUNTIME
        </p>
        <h1 style={{ margin: '6px 0', fontSize: 36 }}>Approval Control Plane</h1>
        <p style={{ margin: 0, color: '#a7b0c0' }}>
          The human approves readable content. The hash enforces that the approved content is exactly what executes.
        </p>
      </header>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
          {[
            ['Executed', stats.executed, '#22c55e'],
            ['Failed', stats.failed, '#ef4444'],
            ['Denied', stats.denied, '#f59e0b'],
            ['Pending Approvals', stats.pendingApprovals, '#38bdf8'],
          ].map(([label, value, color]) => (
            <div key={label as string} style={{ ...cardStyle, borderTop: `3px solid ${color}` }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#f8fafc' }}>{value as number}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab('approvals')} style={tabBtn(tab === 'approvals')}>
          Approval Queue
        </button>
        <button onClick={() => setTab('audit')} style={tabBtn(tab === 'audit')}>
          Audit Log
        </button>
      </div>

      {message && <div style={messageStyle}>{message}</div>}

      {tab === 'approvals' && (
        <div>
          {approvals.length === 0 && <p style={{ color: '#94a3b8' }}>No pending approvals.</p>}
          {approvals.map((approval) => (
            <section key={approval.id} style={approvalCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: '#38bdf8', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>
                    {approval.status} approval
                  </div>
                  <h2 style={{ margin: '4px 0', color: '#f8fafc' }}>{approval.toolName}</h2>
                  <div style={{ color: '#cbd5e1' }}>Risk class: <strong>{approval.riskClass}</strong></div>
                  <div style={{ color: '#94a3b8', fontSize: 13 }}>
                    Requested: {new Date(approval.requestedAt).toLocaleString()}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 13 }}>
                    Approving session: {OPERATOR_SESSION_LABEL}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 13 }}>
                    Identity source: authenticated dev token
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <button style={approveBtn} onClick={() => void decideApproval(approval.id, 'approve')}>
                    Approve
                  </button>
                  <button style={rejectBtn} onClick={() => void decideApproval(approval.id, 'reject')}>
                    Reject
                  </button>
                </div>
              </div>

              <div style={fieldGridStyle}>
                <PayloadBlock title="Human-readable arguments" value={JSON.stringify(approval.arguments, null, 2)} />
                <PayloadBlock title="Canonical payload preview" value={approval.canonicalPayload} />
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={labelStyle}>Hash</div>
                <code style={hashStyle}>{approval.canonicalHash}</code>
              </div>
            </section>
          ))}
        </div>
      )}

      {tab === 'audit' && (
        <div>
          {audit.map((event) => (
            <div key={event.id} style={rowStyle}>
              <span style={{ color: statusColor(event.outcome?.state ?? event.policyDecision ?? ''), fontWeight: 700 }}>
                {event.eventType}
              </span>
              <span style={{ color: '#cbd5e1' }}>{event.toolName}</span>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
              {event.outcome && (
                <span style={{ fontSize: 12, color: '#a7b0c0' }}>
                  {event.outcome.state} {event.outcome.reasonCode ? `(${event.outcome.reasonCode})` : ''}
                </span>
              )}
              {event.policyDecision && <span style={{ fontSize: 12, color: '#a7b0c0' }}>{event.policyDecision}</span>}
              {event.durationMs != null && <span style={{ fontSize: 12, color: '#94a3b8' }}>{event.durationMs}ms</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PayloadBlock({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <div style={labelStyle}>{title}</div>
      <pre style={preStyle}>{value}</pre>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  fontFamily: 'Georgia, "Times New Roman", serif',
  maxWidth: 1120,
  margin: '0 auto',
  padding: 24,
  minHeight: '100vh',
  color: '#e2e8f0',
  background: 'radial-gradient(circle at top left, #1e3a5f 0, transparent 32%), #0f172a',
};

const cardStyle: React.CSSProperties = {
  background: 'rgba(15, 23, 42, 0.84)',
  border: '1px solid rgba(148, 163, 184, 0.22)',
  borderRadius: 14,
  padding: 16,
};

const approvalCardStyle: React.CSSProperties = {
  ...cardStyle,
  marginBottom: 18,
  boxShadow: '0 18px 60px rgba(0, 0, 0, 0.28)',
};

const fieldGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 14,
  marginTop: 16,
};

const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: '10px 16px',
  borderRadius: 999,
  border: '1px solid rgba(148, 163, 184, 0.26)',
  cursor: 'pointer',
  background: active ? '#f8fafc' : 'rgba(15, 23, 42, 0.8)',
  color: active ? '#0f172a' : '#f8fafc',
  fontWeight: 700,
});

const approveBtn: React.CSSProperties = {
  ...tabBtn(true),
  background: '#22c55e',
  color: '#052e16',
};

const rejectBtn: React.CSSProperties = {
  ...tabBtn(true),
  background: '#fb7185',
  color: '#450a0a',
};

const labelStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 0.7,
  marginBottom: 6,
  textTransform: 'uppercase',
};

const preStyle: React.CSSProperties = {
  margin: 0,
  padding: 12,
  overflowX: 'auto',
  borderRadius: 10,
  background: '#020617',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  color: '#dbeafe',
  fontSize: 12,
};

const hashStyle: React.CSSProperties = {
  display: 'block',
  overflowX: 'auto',
  padding: 10,
  borderRadius: 10,
  background: '#020617',
  color: '#bae6fd',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  alignItems: 'center',
  padding: '10px 14px',
  background: 'rgba(15, 23, 42, 0.84)',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  borderRadius: 10,
  marginBottom: 6,
  fontSize: 14,
};

const messageStyle: React.CSSProperties = {
  marginBottom: 16,
  padding: 12,
  borderRadius: 10,
  background: '#0f766e',
  color: '#ecfeff',
};

export default App;
