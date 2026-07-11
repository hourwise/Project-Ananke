# Operator Authentication and RBAC

Ananke authenticates dashboard and operator API requests separately from agent tool-execution requests. Operator identity must come from a verified credential, never from an approval request body.

## Roles

| Role | Effective permissions |
|------|-----------------------|
| `viewer` | `stats:read` |
| `approver` | `approvals:read`, `approvals:decide`, `stats:read` |
| `auditor` | `audit:read`, `stats:read` |
| `admin` | All operator permissions |

Authentication failures return `401`. Authenticated operators without the required permission receive `403`. Roles are deny-by-default: an OIDC token without a recognised role is not accepted as an operator identity.

## Production OIDC JWT Mode

Configure the gateway with the identity provider's exact issuer, API audience, and JWKS endpoint:

```ts
const gateway = new Gateway({
  operatorAuth: {
    mode: 'oidc',
    oidc: {
      issuer: 'https://identity.example.com/',
      audience: 'ananke-dashboard',
      jwksUri: 'https://identity.example.com/.well-known/jwks.json',
      roleClaim: 'roles',
      sessionClaim: 'sid',
    },
  },
});
```

Ananke verifies the JWT signature, issuer, audience, and time validity. The token must contain:

- `sub`: stable operator ID.
- `sid` by default, or the configured session claim. `jti` is accepted as a fallback.
- `roles` by default, containing one or more recognised Ananke roles.
- `exp`: token expiry, enforced by JWT verification.

Optional display identity is read from `name`, `preferred_username`, or `email`, in that order. A small clock tolerance of five seconds is allowed by default and can be configured with `allowedClockSkewSeconds`.

The identity provider is responsible for login, MFA, group-to-role assignment, token issuance, rotation, and revocation. Use an audience dedicated to Ananke; do not accept general-purpose identity tokens.

## Local Development Mode

Development mode preserves the bundled local dashboard workflow:

```ts
const gateway = new Gateway({
  operatorAuth: {
    mode: 'development',
    tokens: {
      'replace-this-local-secret': {
        operatorId: 'local-operator',
        displayName: 'Local Operator',
        sessionId: 'local-session',
        roles: ['admin'],
      },
    },
  },
});
```

If `operatorAuth` is omitted, the prototype default token remains `dev-approval-token`. This default is for localhost development only and must never be exposed on a shared or production network.

## Operator Endpoints

| Endpoint | Required permission |
|----------|---------------------|
| `GET /api/auth/me` | Any authenticated operator |
| `GET /api/stats` | `stats:read` |
| `GET /api/approvals` | `approvals:read` |
| `POST /api/approvals/:id/approve` | `approvals:decide` |
| `POST /api/approvals/:id/reject` | `approvals:decide` |
| `GET /api/audit` | `audit:read` |

Approval audit metadata records the verified operator ID, display name, session ID, authentication method, effective roles, and decision time.

## Remaining Production Work

This slice establishes signed identity verification and endpoint authorization. A complete production control plane still needs:

- An IdP-specific login/logout integration or a backend-for-frontend using secure, HTTP-only cookies.
- Refresh-token handling outside browser JavaScript.
- Immediate revocation/session termination rather than expiry-only access-token invalidation.
- Operator provisioning/deprovisioning and reviewed group-to-role mappings.
- Rate limiting, security headers, restricted CORS origins, and CSRF protection if cookie authentication is added.
- Durable session and authentication-event audit records.
