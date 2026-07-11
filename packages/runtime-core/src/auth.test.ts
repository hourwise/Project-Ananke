import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  DevelopmentTokenAuthenticator,
  OidcJwtAuthenticator,
  hasOperatorPermission,
} from './auth.js';

describe('DevelopmentTokenAuthenticator', () => {
  it('authenticates configured local operators and rejects unknown tokens', async () => {
    const authenticator = new DevelopmentTokenAuthenticator({
      secret: {
        operatorId: 'local-operator',
        sessionId: 'local-session',
        roles: ['approver'],
      },
    });

    await expect(authenticator.authenticate('Bearer secret')).resolves.toMatchObject({
      operatorId: 'local-operator',
      sessionId: 'local-session',
      authMethod: 'dev-token',
      roles: ['approver'],
    });
    await expect(authenticator.authenticate('Bearer wrong')).resolves.toBeUndefined();
    await expect(authenticator.authenticate()).resolves.toBeUndefined();
  });
});

describe('OidcJwtAuthenticator', () => {
  async function fixture() {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = 'test-key';
    publicJwk.alg = 'RS256';
    const authenticator = new OidcJwtAuthenticator({
      issuer: 'https://identity.example.test',
      audience: 'ananke-dashboard',
      jwks: { keys: [publicJwk] },
    });
    return { authenticator, privateKey };
  }

  it('verifies signature, issuer, audience, expiry, session, and roles', async () => {
    const { authenticator, privateKey } = await fixture();
    const token = await new SignJWT({
      name: 'Production Approver',
      roles: ['approver'],
      sid: 'oidc-session',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setSubject('operator-123')
      .setIssuer('https://identity.example.test')
      .setAudience('ananke-dashboard')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    await expect(authenticator.authenticate(`Bearer ${token}`)).resolves.toMatchObject({
      operatorId: 'operator-123',
      displayName: 'Production Approver',
      sessionId: 'oidc-session',
      authMethod: 'oidc-jwt',
      roles: ['approver'],
    });
  });

  it('rejects tokens with the wrong audience or without an operator session', async () => {
    const { authenticator, privateKey } = await fixture();
    const wrongAudience = await new SignJWT({ roles: ['admin'], sid: 'session' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setSubject('operator-123')
      .setIssuer('https://identity.example.test')
      .setAudience('another-service')
      .setExpirationTime('5m')
      .sign(privateKey);
    const missingSession = await new SignJWT({ roles: ['admin'] })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setSubject('operator-123')
      .setIssuer('https://identity.example.test')
      .setAudience('ananke-dashboard')
      .setExpirationTime('5m')
      .sign(privateKey);

    await expect(authenticator.authenticate(`Bearer ${wrongAudience}`)).resolves.toBeUndefined();
    await expect(authenticator.authenticate(`Bearer ${missingSession}`)).resolves.toBeUndefined();
  });
});

describe('operator permissions', () => {
  it('keeps approval and audit authority separate unless the operator is an admin', () => {
    const base = {
      operatorId: 'operator',
      sessionId: 'session',
      authMethod: 'oidc-jwt' as const,
      authenticatedAt: new Date().toISOString(),
    };

    expect(hasOperatorPermission({ ...base, roles: ['approver'] }, 'approvals:decide')).toBe(true);
    expect(hasOperatorPermission({ ...base, roles: ['approver'] }, 'audit:read')).toBe(false);
    expect(hasOperatorPermission({ ...base, roles: ['auditor'] }, 'audit:read')).toBe(true);
    expect(hasOperatorPermission({ ...base, roles: ['admin'] }, 'approvals:decide')).toBe(true);
    expect(hasOperatorPermission({ ...base, roles: ['admin'] }, 'audit:read')).toBe(true);
  });
});
