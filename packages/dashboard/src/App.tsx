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
  outcome?: { state: string; reasonCode?: string };
  durationMs?: number;
}

interface Approval {
  id: string;
  toolName: string;
  canonicalHash: string;
  arguments: Record<string, unknown>;
  approvedAt: string;
}

const API = 'http://localhost:3000/api';

function App() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [tab, setTab] = useState<'audit' | 'approvals'>('audit');

  useEffect(() => {
    fetch(`${API}/stats`).then((r) => r.json()).then(setStats);
    fetch(`${API}/audit?limit=50`).then((r) => r.json()).then(setAudit);
    fetch(`${API}/approvals`).then((r) => r.json()).then(setApprovals);
    const interval = setInterval(() => {
      fetch(`${API}/stats`).then((r) => r.json()).then(setStats);
      fetch(`${API}/audit?limit=50`).then((r) => r.json()).then(setAudit);
      fetch(`${API}/approvals`).then((r) => r.json()).then(setApprovals);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  function statusColor(state: string): string {
    switch (state) {
      case 'COMPLETED': return '#22c55e';
      case 'FAILED': return '#ef4444';
      case 'DENIED': return '#f59e0b';
      default: return '#6b7280';
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <h1>🔮 Ananke — Outcome Gateway Dashboard</h1>

      {stats && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          {[
            ['Executed', stats.executed, '#22c55e'],
            ['Failed', stats.failed, '#ef4444'],
            ['Denied', stats.denied, '#f59e0b'],
            ['Pending Approvals', stats.pendingApprovals, '#3b82f6'],
          ].map(([label, value, color]) => (
            <div key={label as string} style={{
              flex: 1, background: '#1e1e2e', borderRadius: 12, padding: 16,
              borderLeft: `4px solid ${color}`,
            }}>
              <div style={{ fontSize: 13, color: '#a0a0b0' }}>{label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{value as number}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab('audit')}
          style={tabBtn(tab === 'audit')}>Audit Log</button>
        <button onClick={() => setTab('approvals')}
          style={tabBtn(tab === 'approvals')}>Approval Queue</button>
      </div>

      {tab === 'audit' && (
        <div>
          {audit.map((e) => (
            <div key={e.id} style={rowStyle}>
              <span style={{ color: statusColor(e.outcome?.state ?? ''), fontWeight: 600 }}>
                {e.eventType}
              </span>
              <span style={{ color: '#c0c0d0' }}>{e.toolName}</span>
              <span style={{ color: '#808090', fontSize: 12 }}>
                {new Date(e.timestamp).toLocaleTimeString()}
              </span>
              {e.outcome && (
                <span style={{ fontSize: 12, color: '#9090a0' }}>
                  {e.outcome.state} {e.outcome.reasonCode ? `(${e.outcome.reasonCode})` : ''}
                </span>
              )}
              {e.durationMs != null && (
                <span style={{ fontSize: 12, color: '#808090' }}>{e.durationMs}ms</span>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'approvals' && (
        <div>
          {approvals.length === 0 && <p style={{ color: '#808090' }}>No pending approvals.</p>}
          {approvals.map((a) => (
            <div key={a.id} style={rowStyle}>
              <span style={{ fontWeight: 600, color: '#f59e0b' }}>⏳ Pending</span>
              <span style={{ color: '#c0c0d0' }}>{a.toolName}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#808090' }}>
                {a.canonicalHash.slice(0, 16)}...
              </span>
              <pre style={{ fontSize: 11, color: '#9090a0', margin: 0 }}>
                {JSON.stringify(a.arguments, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  background: active ? '#3b82f6' : '#2a2a3a',
  color: '#fff',
  fontWeight: active ? 600 : 400,
});

const rowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  alignItems: 'center',
  padding: '10px 14px',
  background: '#1e1e2e',
  borderRadius: 8,
  marginBottom: 6,
  fontSize: 14,
};

export default App;
