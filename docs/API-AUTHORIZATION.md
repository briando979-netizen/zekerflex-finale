# API authorization policy and audit

## Secure-by-default boundary

Every `/api/*` request is authenticated by `middleware.ts`. The only exceptions
are the explicit patterns in `PUBLIC_API_PATTERNS`. Routes in that allowlist are
public business endpoints, health probes, or transports which verify a separate
secret/signature (`webhooks` and `internal`). Adding a new route therefore does
not accidentally publish it. Middleware is defense-in-depth only: protected
handlers must still call the Node-side authorization helpers, which reload the
user, disabled state, memberships, roles, and branch scopes from Prisma on every
request.

## Endpoint families

| Family | Authentication | Authorization and tenant source |
|---|---|---|
| `/api/admin/*` | Session + handler check | `PLATFORM_ADMIN`; database grant |
| `/api/invoices/*` | Session | invoice owner/recipient tenant loaded from DB |
| `/api/timesheets/*` | Session | manager role; timesheet → shift → branch tenant loaded from DB |
| `/api/shifts/*` | Session | manager role; shift branch and tenant loaded from DB |
| `/api/kyc/*` | Session | current user only |
| `/api/uploads/*` | Session | `PLATFORM_ADMIN`; private download |
| `/api/graphql` | Session | authorization and tenant scope in each resolver |
| `/api/me/*` | Session | current `principal.userId`; client user IDs are not trusted |
| `/api/orgs/*` | Session | memberships reloaded from DB; branch checks where applicable |
| `/api/werkgever/claims/*` | Session | employer organization scope loaded from DB |
| `/api/webhooks/*` | Signed transport | signature, timestamp/replay and event idempotency in handler |
| `/api/internal/*` | Internal secret | constant-time internal-secret validation in handler |

## Review checklist for every mutation

1. Parse bounded input with Zod and reject unknown/invalid identifiers.
2. Authenticate in the handler; never rely solely on middleware.
3. Load the target resource and derive its organization/branch server-side.
4. Apply `assertOrganizationAccess` / `assertBranchAccess` to that derived scope.
5. Enforce status preconditions and put multi-write financial changes in a
   transaction with an idempotency key.
6. Record a structured, immutable audit event with actor, target and request ID.

Client-supplied `organizationId`, `branchId`, monetary totals, roles, or user IDs
are selectors at most; they are never evidence of authorization or financial
truth.
