import { timingSafeEqual } from 'node:crypto';
import {
  createLocalJWKSet,
  createRemoteJWKSet,
  jwtVerify,
  type JSONWebKeySet,
  type JWTPayload,
} from 'jose';
import {
  OperatorRole,
  type ExecutionIdentity,
  type OperatorIdentity,
  type OperatorRole as OperatorRoleType,
} from '@ananke/schema';

export type OperatorPermission =
  'approvals:read' | 'approvals:decide' | 'audit:read' | 'stats:read';

const ROLE_PERMISSIONS: Record<OperatorRoleType, ReadonlySet<OperatorPermission>> = {
  viewer: new Set(['stats:read']),
  approver: new Set(['approvals:read', 'approvals:decide', 'stats:read']),
  auditor: new Set(['audit:read', 'stats:read']),
  admin: new Set(['approvals:read', 'approvals:decide', 'audit:read', 'stats:read']),
};

export interface OperatorProfile {
  operatorId: string;
  displayName?: string;
  sessionId?: string;
  roles?: OperatorRoleType[];
}

/**
 * Verified operator identity with non-enumerable credential metadata for the
 * session lifecycle. The metadata is deliberately not included in API output.
 */
export interface AuthenticatedOperator extends OperatorIdentity {
  credentialId?: string;
  credentialIssuedAt?: string;
  credentialExpiresAt?: string;
}

export interface OperatorAuthenticator {
  authenticate(authorizationHeader?: string): Promise<AuthenticatedOperator | undefined>;
}

export interface ExecutionProfile {
  agentPrincipalId: string;
  tenantId: string;
  resourceScope: string;
  sessionId?: string;
}

export interface ExecutionAuthenticator {
  authenticate(authorizationHeader?: string): Promise<ExecutionIdentity | undefined>;
}

export interface OidcAuthConfig {
  issuer: string;
  audience: string | string[];
  jwksUri?: string;
  jwks?: JSONWebKeySet;
  roleClaim?: string;
  sessionClaim?: string;
  allowedClockSkewSeconds?: number;
}

function bearerToken(authorizationHeader?: string): string | undefined {
  const match = authorizationHeader?.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1];
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function timestampToIso(timestamp: number | undefined): string | undefined {
  return timestamp === undefined ? undefined : new Date(timestamp * 1000).toISOString();
}

function withCredentialMetadata(
  identity: OperatorIdentity,
  credential?: {
    id?: string;
    issuedAt?: string;
    expiresAt?: string;
  },
): AuthenticatedOperator {
  if (credential?.id) {
    Object.defineProperties(identity, {
      credentialId: { value: credential.id, enumerable: false },
      credentialIssuedAt: { value: credential.issuedAt, enumerable: false },
      credentialExpiresAt: { value: credential.expiresAt, enumerable: false },
    });
  }
  return identity as AuthenticatedOperator;
}

export class DevelopmentTokenAuthenticator implements OperatorAuthenticator {
  constructor(private readonly tokens: Readonly<Record<string, OperatorProfile>>) {}

  async authenticate(authorizationHeader?: string): Promise<AuthenticatedOperator | undefined> {
    const token = bearerToken(authorizationHeader);
    if (!token) return undefined;

    const entry = Object.entries(this.tokens).find(([candidate]) =>
      constantTimeEqual(candidate, token),
    );
    if (!entry) return undefined;

    const profile = entry[1];
    const roles = (profile.roles ?? ['admin']).filter(
      (role) => OperatorRole.safeParse(role).success,
    );
    if (roles.length === 0) return undefined;

    return {
      operatorId: profile.operatorId,
      displayName: profile.displayName,
      sessionId: profile.sessionId ?? crypto.randomUUID(),
      authMethod: 'dev-token',
      roles,
      authenticatedAt: new Date().toISOString(),
    };
  }
}

export class DevelopmentExecutionTokenAuthenticator implements ExecutionAuthenticator {
  constructor(private readonly tokens: Readonly<Record<string, ExecutionProfile>>) {}

  async authenticate(authorizationHeader?: string): Promise<ExecutionIdentity | undefined> {
    const token = bearerToken(authorizationHeader);
    if (!token) return undefined;

    const entry = Object.entries(this.tokens).find(([candidate]) =>
      constantTimeEqual(candidate, token),
    );
    if (!entry) return undefined;

    const profile = entry[1];
    return {
      agentPrincipalId: profile.agentPrincipalId,
      tenantId: profile.tenantId,
      resourceScope: profile.resourceScope,
      sessionId: profile.sessionId ?? crypto.randomUUID(),
      authMethod: 'dev-token',
      authenticatedAt: new Date().toISOString(),
    };
  }
}

export class DenyAllOperatorAuthenticator implements OperatorAuthenticator {
  async authenticate(): Promise<undefined> {
    return undefined;
  }
}

export class DenyAllExecutionAuthenticator implements ExecutionAuthenticator {
  async authenticate(): Promise<undefined> {
    return undefined;
  }
}

function stringClaim(payload: JWTPayload, name: string): string | undefined {
  const value = payload[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function roleClaims(payload: JWTPayload, claimName: string): OperatorRoleType[] {
  const value = payload[claimName];
  const claims = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\s,]+/)
      : [];
  return [
    ...new Set(
      claims.flatMap((claim) => {
        const parsed = OperatorRole.safeParse(claim);
        return parsed.success ? [parsed.data] : [];
      }),
    ),
  ];
}

export class OidcJwtAuthenticator implements OperatorAuthenticator {
  private readonly jwks:
    ReturnType<typeof createRemoteJWKSet> | ReturnType<typeof createLocalJWKSet>;

  constructor(private readonly config: OidcAuthConfig) {
    if (config.jwks) {
      this.jwks = createLocalJWKSet(config.jwks);
    } else if (config.jwksUri) {
      this.jwks = createRemoteJWKSet(new URL(config.jwksUri));
    } else {
      throw new Error('OIDC authentication requires jwksUri or jwks');
    }
  }

  async authenticate(authorizationHeader?: string): Promise<AuthenticatedOperator | undefined> {
    const token = bearerToken(authorizationHeader);
    if (!token) return undefined;

    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        clockTolerance: this.config.allowedClockSkewSeconds ?? 5,
      });
      if (!payload.sub) return undefined;

      const roles = roleClaims(payload, this.config.roleClaim ?? 'roles');
      const sessionId = stringClaim(payload, this.config.sessionClaim ?? 'sid') ?? payload.jti;
      if (roles.length === 0 || !sessionId) return undefined;

      return withCredentialMetadata(
        {
          operatorId: payload.sub,
          displayName:
            stringClaim(payload, 'name') ??
            stringClaim(payload, 'preferred_username') ??
            stringClaim(payload, 'email'),
          sessionId,
          authMethod: 'oidc-jwt',
          roles,
          authenticatedAt: new Date().toISOString(),
        },
        {
          id: payload.jti,
          issuedAt: timestampToIso(payload.iat),
          expiresAt: timestampToIso(payload.exp),
        },
      );
    } catch {
      return undefined;
    }
  }
}

export function hasOperatorPermission(
  operator: OperatorIdentity,
  permission: OperatorPermission,
): boolean {
  return operator.roles.some((role) => ROLE_PERMISSIONS[role].has(permission));
}

export function permissionsForOperator(operator: OperatorIdentity): OperatorPermission[] {
  return [...new Set(operator.roles.flatMap((role) => [...ROLE_PERMISSIONS[role]]))];
}
