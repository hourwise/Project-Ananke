import Database from 'better-sqlite3';
import type { OperatorIdentity, OperatorRole as OperatorRoleType } from '@ananke/schema';
import type { AuthenticatedOperator } from './auth.js';

export type OperatorSessionTransition = 'started' | 'resumed' | 'rotated' | 'revoked' | 'rejected';

export interface OperatorSession {
  sessionId: string;
  operatorId: string;
  displayName?: string;
  authMethod: OperatorIdentity['authMethod'];
  roles: OperatorRoleType[];
  credentialId?: string;
  credentialIssuedAt?: string;
  credentialExpiresAt?: string;
  createdAt: string;
  lastAuthenticatedAt: string;
  revokedAt?: string;
  revocationReason?: string;
}

export interface OperatorSessionObservation {
  active: boolean;
  transition: OperatorSessionTransition;
  session?: OperatorSession;
}

export interface OperatorSessionStore {
  observe(operator: AuthenticatedOperator): OperatorSessionObservation;
  revoke(sessionId: string, operatorId: string, reason: string): OperatorSession | undefined;
  get(sessionId: string): OperatorSession | undefined;
}

function now(): string {
  return new Date().toISOString();
}

function cloneSession(session: OperatorSession): OperatorSession {
  return { ...session, roles: [...session.roles] };
}

function sessionFromOperator(operator: AuthenticatedOperator, timestamp: string): OperatorSession {
  return {
    sessionId: operator.sessionId,
    operatorId: operator.operatorId,
    displayName: operator.displayName,
    authMethod: operator.authMethod,
    roles: [...operator.roles],
    credentialId: operator.credentialId,
    credentialIssuedAt: operator.credentialIssuedAt,
    credentialExpiresAt: operator.credentialExpiresAt,
    createdAt: timestamp,
    lastAuthenticatedAt: timestamp,
  };
}

function credentialTransition(
  session: OperatorSession,
  operator: AuthenticatedOperator,
): Extract<OperatorSessionTransition, 'resumed' | 'rotated' | 'rejected'> {
  if (session.authMethod !== operator.authMethod || session.operatorId !== operator.operatorId) {
    return 'rejected';
  }

  if (!operator.credentialId) {
    // Once JWT rotation is being tracked, accepting an untracked credential
    // would let an older token bypass the current-credential check.
    return session.authMethod === 'oidc-jwt' && session.credentialId ? 'rejected' : 'resumed';
  }

  if (!session.credentialId || session.credentialId === operator.credentialId) {
    return session.credentialId === operator.credentialId ? 'resumed' : 'rotated';
  }

  if (
    !session.credentialIssuedAt
    || !operator.credentialIssuedAt
    || operator.credentialIssuedAt <= session.credentialIssuedAt
  ) {
    return 'rejected';
  }

  return 'rotated';
}

function refreshedSession(
  previous: OperatorSession,
  operator: AuthenticatedOperator,
  timestamp: string,
  transition: Extract<OperatorSessionTransition, 'resumed' | 'rotated'>,
): OperatorSession {
  return {
    ...previous,
    displayName: operator.displayName,
    roles: [...operator.roles],
    lastAuthenticatedAt: timestamp,
    ...(transition === 'rotated'
      ? {
        credentialId: operator.credentialId,
        credentialIssuedAt: operator.credentialIssuedAt,
        credentialExpiresAt: operator.credentialExpiresAt,
      }
      : {}),
  };
}

export class InMemoryOperatorSessionStore implements OperatorSessionStore {
  private sessions = new Map<string, OperatorSession>();

  observe(operator: AuthenticatedOperator): OperatorSessionObservation {
    const timestamp = now();
    const existing = this.sessions.get(operator.sessionId);
    if (!existing) {
      const session = sessionFromOperator(operator, timestamp);
      this.sessions.set(session.sessionId, session);
      return { active: true, transition: 'started', session: cloneSession(session) };
    }

    if (existing.revokedAt) {
      return { active: false, transition: 'revoked', session: cloneSession(existing) };
    }

    const transition = credentialTransition(existing, operator);
    if (transition === 'rejected') {
      return { active: false, transition, session: cloneSession(existing) };
    }

    const session = refreshedSession(existing, operator, timestamp, transition);
    this.sessions.set(session.sessionId, session);
    return { active: true, transition, session: cloneSession(session) };
  }

  revoke(sessionId: string, operatorId: string, reason: string): OperatorSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session || session.operatorId !== operatorId || session.revokedAt) return undefined;

    const revoked = { ...session, revokedAt: now(), revocationReason: reason };
    this.sessions.set(sessionId, revoked);
    return cloneSession(revoked);
  }

  get(sessionId: string): OperatorSession | undefined {
    const session = this.sessions.get(sessionId);
    return session ? cloneSession(session) : undefined;
  }
}

const SESSION_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS operator_sessions (',
  '  session_id TEXT PRIMARY KEY,',
  '  operator_id TEXT NOT NULL,',
  '  display_name TEXT,',
  '  auth_method TEXT NOT NULL,',
  '  roles TEXT NOT NULL,',
  '  credential_id TEXT,',
  '  credential_issued_at TEXT,',
  '  credential_expires_at TEXT,',
  '  created_at TEXT NOT NULL,',
  '  last_authenticated_at TEXT NOT NULL,',
  '  revoked_at TEXT,',
  '  revocation_reason TEXT',
  ');',
  'CREATE INDEX IF NOT EXISTS idx_operator_sessions_operator ON operator_sessions(operator_id);',
  'CREATE INDEX IF NOT EXISTS idx_operator_sessions_status ON operator_sessions(revoked_at);',
].join('\n');

interface OperatorSessionRow {
  session_id: string;
  operator_id: string;
  display_name: string | null;
  auth_method: OperatorIdentity['authMethod'];
  roles: string;
  credential_id: string | null;
  credential_issued_at: string | null;
  credential_expires_at: string | null;
  created_at: string;
  last_authenticated_at: string;
  revoked_at: string | null;
  revocation_reason: string | null;
}

function rowToSession(row: OperatorSessionRow): OperatorSession {
  return {
    sessionId: row.session_id,
    operatorId: row.operator_id,
    displayName: row.display_name ?? undefined,
    authMethod: row.auth_method,
    roles: JSON.parse(row.roles) as OperatorRoleType[],
    credentialId: row.credential_id ?? undefined,
    credentialIssuedAt: row.credential_issued_at ?? undefined,
    credentialExpiresAt: row.credential_expires_at ?? undefined,
    createdAt: row.created_at,
    lastAuthenticatedAt: row.last_authenticated_at,
    revokedAt: row.revoked_at ?? undefined,
    revocationReason: row.revocation_reason ?? undefined,
  };
}

/**
 * SQLite-backed operator sessions. Use this store in OIDC deployments so
 * logout and revocation survive gateway restart.
 */
export class SqliteOperatorSessionStore implements OperatorSessionStore {
  private readonly db: Database.Database;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SESSION_SCHEMA);
  }

  observe(operator: AuthenticatedOperator): OperatorSessionObservation {
    this.assertOpen();
    const timestamp = now();
    const row = this.db.prepare(
      'SELECT * FROM operator_sessions WHERE session_id = ?',
    ).get(operator.sessionId) as OperatorSessionRow | undefined;

    if (!row) {
      const session = sessionFromOperator(operator, timestamp);
      this.write(session);
      return { active: true, transition: 'started', session };
    }

    const existing = rowToSession(row);
    if (existing.revokedAt) {
      return { active: false, transition: 'revoked', session: existing };
    }

    const transition = credentialTransition(existing, operator);
    if (transition === 'rejected') {
      return { active: false, transition, session: existing };
    }

    const session = refreshedSession(existing, operator, timestamp, transition);
    this.write(session);
    return { active: true, transition, session };
  }

  revoke(sessionId: string, operatorId: string, reason: string): OperatorSession | undefined {
    this.assertOpen();
    const timestamp = now();
    const changed = this.db.prepare([
      'UPDATE operator_sessions',
      'SET revoked_at = ?, revocation_reason = ?',
      'WHERE session_id = ? AND operator_id = ? AND revoked_at IS NULL',
    ].join('\n')).run(timestamp, reason, sessionId, operatorId);
    return changed.changes === 1 ? this.get(sessionId) : undefined;
  }

  get(sessionId: string): OperatorSession | undefined {
    this.assertOpen();
    const row = this.db.prepare(
      'SELECT * FROM operator_sessions WHERE session_id = ?',
    ).get(sessionId) as OperatorSessionRow | undefined;
    return row ? rowToSession(row) : undefined;
  }

  close(): void {
    this.closed = true;
    this.db.close();
  }

  private write(session: OperatorSession): void {
    this.db.prepare([
      'INSERT INTO operator_sessions (',
      '  session_id, operator_id, display_name, auth_method, roles,',
      '  credential_id, credential_issued_at, credential_expires_at,',
      '  created_at, last_authenticated_at, revoked_at, revocation_reason',
      ') VALUES (',
      '  @sessionId, @operatorId, @displayName, @authMethod, @roles,',
      '  @credentialId, @credentialIssuedAt, @credentialExpiresAt,',
      '  @createdAt, @lastAuthenticatedAt, @revokedAt, @revocationReason',
      ')',
      'ON CONFLICT(session_id) DO UPDATE SET',
      '  display_name = excluded.display_name,',
      '  roles = excluded.roles,',
      '  credential_id = excluded.credential_id,',
      '  credential_issued_at = excluded.credential_issued_at,',
      '  credential_expires_at = excluded.credential_expires_at,',
      '  last_authenticated_at = excluded.last_authenticated_at',
    ].join('\n')).run({
      ...session,
      displayName: session.displayName ?? null,
      roles: JSON.stringify(session.roles),
      credentialId: session.credentialId ?? null,
      credentialIssuedAt: session.credentialIssuedAt ?? null,
      credentialExpiresAt: session.credentialExpiresAt ?? null,
      revokedAt: session.revokedAt ?? null,
      revocationReason: session.revocationReason ?? null,
    });
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('SqliteOperatorSessionStore is closed');
  }
}
