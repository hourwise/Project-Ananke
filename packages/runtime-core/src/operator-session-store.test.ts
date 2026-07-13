import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { Gateway } from './index.js';
import { createGatewayRoutes } from './routes.js';
import {
  InMemoryOperatorSessionStore,
  SqliteOperatorSessionStore,
} from './operator-session-store.js';

const DEV_OPERATOR = {
  operatorId: 'operator-1',
  displayName: 'Operator One',
  sessionId: 'session-1',
  authMethod: 'dev-token' as const,
  roles: ['approver' as const],
  authenticatedAt: '2026-07-12T12:00:00.000Z',
};

describe('operator session lifecycle', () => {
  it('revokes a session immediately and preserves the revocation in SQLite', () => {
    const path = join(tmpdir(), `ananke-sessions-${crypto.randomUUID()}.db`);
    const firstStore = new SqliteOperatorSessionStore(path);

    try {
      expect(firstStore.observe(DEV_OPERATOR)).toMatchObject({
        active: true,
        transition: 'started',
      });
      expect(
        firstStore.revoke(DEV_OPERATOR.sessionId, DEV_OPERATOR.operatorId, 'operator_logout'),
      ).toMatchObject({
        sessionId: DEV_OPERATOR.sessionId,
        revocationReason: 'operator_logout',
      });
      firstStore.close();

      const restartedStore = new SqliteOperatorSessionStore(path);
      try {
        expect(restartedStore.observe(DEV_OPERATOR)).toMatchObject({
          active: false,
          transition: 'revoked',
        });
      } finally {
        restartedStore.close();
      }
    } finally {
      rmSync(path, { force: true });
      rmSync(`${path}-wal`, { force: true });
      rmSync(`${path}-shm`, { force: true });
    }
  });

  it('rotates to a newer JWT credential and rejects the older credential thereafter', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = 'session-test-key';
    publicJwk.alg = 'RS256';
    const now = Math.floor(Date.now() / 1000);
    const gateway = new Gateway({
      autoLoadPolicy: false,
      operatorAuth: {
        mode: 'oidc',
        oidc: {
          issuer: 'https://identity.example.test',
          audience: 'ananke-dashboard',
          jwks: { keys: [publicJwk] },
        },
        sessionStore: new InMemoryOperatorSessionStore(),
      },
    });

    async function token(id: string, issuedAt: number): Promise<string> {
      return new SignJWT({ roles: ['approver'], sid: 'rotating-session' })
        .setProtectedHeader({ alg: 'RS256', kid: 'session-test-key' })
        .setSubject('operator-1')
        .setIssuer('https://identity.example.test')
        .setAudience('ananke-dashboard')
        .setJti(id)
        .setIssuedAt(issuedAt)
        .setExpirationTime(now + 300)
        .sign(privateKey);
    }

    const oldToken = await token('token-old', now - 30);
    const newToken = await token('token-new', now);

    await expect(gateway.authenticateOperator(`Bearer ${oldToken}`)).resolves.toMatchObject({
      sessionId: 'rotating-session',
    });
    await expect(gateway.authenticateOperator(`Bearer ${newToken}`)).resolves.toMatchObject({
      sessionId: 'rotating-session',
    });
    await expect(gateway.authenticateOperator(`Bearer ${oldToken}`)).resolves.toBeUndefined();
    expect(gateway.audit.query({ eventType: 'OPERATOR_SESSION_ROTATED' })).toHaveLength(1);
  });

  it('logs out through the API and denies reuse of the same credential', async () => {
    const gateway = new Gateway({ autoLoadPolicy: false, developmentMode: true });
    const routes = createGatewayRoutes(gateway);
    const headers = { authorization: 'Bearer dev-approval-token' };

    expect((await routes.request('/auth/me', { headers })).status).toBe(200);
    const logout = await routes.request('/auth/logout', { method: 'POST', headers });
    expect(logout.status).toBe(200);
    await expect(logout.json()).resolves.toMatchObject({
      sessionId: 'local-dev-session',
      status: 'revoked',
    });

    expect((await routes.request('/auth/me', { headers })).status).toBe(401);
    expect((await routes.request('/stats', { headers })).status).toBe(401);
    expect(gateway.audit.query({ eventType: 'OPERATOR_SESSION_STARTED' })).toHaveLength(1);
    expect(gateway.audit.query({ eventType: 'OPERATOR_SESSION_REVOKED' })).toHaveLength(1);
  });
});
