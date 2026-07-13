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

## Session Lifecycle

Every successfully verified operator credential is checked against an Ananke session store before endpoint authorization. The first accepted request starts the session. Logout revokes it immediately, so an otherwise-valid JWT for that session can no longer access Ananke.

The default in-memory session store is suitable only for local development and tests. OIDC deployments must use the SQLite store (or an equivalent durable implementation) so revocations survive restart:

    import { Gateway, SqliteOperatorSessionStore } from "@ananke/runtime-core";

    const gateway = new Gateway({
      operatorAuth: {
        mode: "oidc",
        oidc: { issuer, audience, jwksUri },
        sessionStore: new SqliteOperatorSessionStore("./ananke-operator-sessions.db"),
      },
    });

When an active OIDC session receives a credential with a new JWT ID and a strictly newer issued-at time, Ananke records a rotation and replaces the current credential ID. An older credential is then refused. This adds defence in depth to the IdP token lifecycle; it does not mint or refresh tokens.

`POST /api/auth/logout` revokes the authenticated Ananke session and writes an `OPERATOR_SESSION_REVOKED` audit event. It does not terminate the upstream IdP browser session. Production deployments must also invoke the IdP end-session flow and ensure the next sign-in receives a new session ID. In local development, restart the gateway after logging out of the bundled fixed development session.

The identity provider remains responsible for login, MFA, group-to-role assignment, token issuance, refresh, and upstream revocation. Use an audience dedicated to Ananke; do not accept general-purpose identity tokens.

## Local Development Mode

Known bundled credentials are disabled by default. They are enabled only by the explicit local-development switch:

```ts
const gateway = new Gateway({
  developmentMode: true,
});
```

This enables `dev-approval-token` for the local dashboard and `dev-execution-token` for local workload calls. If `developmentMode` is omitted or false, both credentials fail closed. Production and shared environments must configure independent operator and execution authenticators or token maps and must never enable this switch.

Execution credentials resolve to an agent principal, tenant, resource scope, and session. The gateway adds the configured policy version; request bodies cannot supply or override identity fields. In-process callers must configure `embeddedExecutionContext` or pass a trusted `executionContext` explicitly.

## Operator Endpoints

| Endpoint | Required permission |
|----------|---------------------|
| `GET /api/auth/me` | Any authenticated operator |
| `POST /api/auth/logout` | Any authenticated operator; revokes the current Ananke session |
| `GET /api/stats` | `stats:read` |
| `GET /api/approvals` | `approvals:read` |
| `POST /api/approvals/:id/approve` | `approvals:decide` |
| `POST /api/approvals/:id/reject` | `approvals:decide` |
| `GET /api/content-approvals` | `approvals:read` |
| `POST /api/content-approvals/:id/approve` | `approvals:decide` |
| `POST /api/content-approvals/:id/reject` | `approvals:decide` |
| `GET /api/audit` | `audit:read` |

Approval audit metadata records the verified operator ID, display name, session ID, authentication method, effective roles, and decision time.

## Remaining Production Work

This slice now establishes signed identity verification, endpoint authorization, durable session storage when configured, immediate local session revocation, rotation tracking, and session lifecycle audit records. A complete production control plane still needs:

- An IdP-specific login/logout integration or a backend-for-frontend using secure, HTTP-only cookies.
- Refresh-token handling outside browser JavaScript.
- Operator provisioning/deprovisioning and reviewed group-to-role mappings.
- Rate limiting, security headers, restricted CORS origins, and CSRF protection if cookie authentication is added.
