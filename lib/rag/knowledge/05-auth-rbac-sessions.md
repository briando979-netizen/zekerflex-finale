# Auth, sessies & RBAC

## Sessietoken

De sessiecookie is een **HS256-JWT (jose)**, geen server-side sessiestore.
`lib/auth/session.ts`:

- `encodeSession(input, maxAge)` / `decodeSession(token)` — issuer `zekerflex`,
  audience `zekerflex.app`, `SESSION_MAX_AGE_SECONDS` = 8u.
- Cookie: `zekerflex.session` (dev) / `__Secure-zekerflex.session` (prod),
  `httpOnly`, `sameSite: lax`.
- Leest `process.env.AUTH_SECRET` direct (min 32 tekens) zodat de Edge-bundle
  klein blijft.

NextAuth v5 (`lib/auth/nextauth.ts`) mint exact deze tokens via zijn
`jwt.encode`/`jwt.decode`-hooks, zodat de **Edge middleware** ze kan verifiëren
zonder Prisma of Node-crypto.

## Providers

- **Credentials** (e-mail + bcrypt tegen `user.passwordHash`).
- **Google OAuth** — alleen geregistreerd als `GOOGLE_CLIENT_ID` +
  `GOOGLE_CLIENT_SECRET` gezet zijn. De `signIn`-callback laat een Google-login
  alléén toe als het geverifieerde e-mailadres al bij een bestaande, actieve
  `User` hoort (geen auto-provisioning); de token wordt gebonden aan die DB-id.

## Brute-force

`lib/auth/login-throttle.ts` — per lower-cased e-mail een Redis-teller
(`zf:login:fail:*`). 5 mislukte pogingen binnen 15 min → 15 min lockout
(`zf:login:lock:*`) die óók tegen het juiste wachtwoord standhoudt. Elke
poging/lockout/succes gaat naar de audit-trail (`AUTH`/`SECURITY`).

## Middleware (Edge)

`middleware.ts` + `lib/auth/rbac.ts#ROUTE_RULES` (eerste match wint):

| pad | rollen | deny |
| --- | --- | --- |
| `/admin/disputes` | DISPUTE_MANAGER, HQ_ADMIN, PLATFORM_ADMIN | redirect |
| `/admin/(jarvis\|analytics)` | PLATFORM_ADMIN | redirect |
| `/admin` | HQ_ADMIN, PLATFORM_ADMIN | redirect |
| `/api/admin` | PLATFORM_ADMIN | 401/403 JSON |
| `/api/timesheets/approve`, `/api/shifts/*/match` | LOCAL_MANAGER, HQ_ADMIN, PLATFORM_ADMIN | 401/403 JSON |

De middleware verifieert alleen het token; route-handlers her-valideren met
`lib/auth.ts`.

## Node-side principal

`lib/auth.ts#getPrincipal()` leest de cookie via `next/headers`, decodeert, en
**herhydrateert de grants vers uit de database** (`user.memberships` +
`scopedBranches`). Een rolwijziging is dus direct effectief.

Helpers: `requirePrincipal`, `hasRole(p, ...roles)`, `requireRole`,
`assertOrganizationAccess(p, orgId)`, `assertBranchAccess(p, branchId, tenantId)`
(PLATFORM_ADMIN altijd; HQ_ADMIN elke vestiging van de org; LOCAL_MANAGER
ongescoped of gescoped op die vestiging).

## Rollen

`FREELANCER`, `LOCAL_MANAGER`, `HQ_ADMIN`, `DISPUTE_MANAGER`, `PLATFORM_ADMIN`.
Publiek vocabulaire: Tenant = "organisatie", Branch = "vestiging".

## Data-onaantastbaarheid

De seed reset nooit een gevulde database, dus `admin@zekerflex.nl` /
`Zeker!2026` (en elk ander wachtwoord) blijft ongewijzigd. Sessies verlopen na
8u — dat is een beveiligingskeuze, geen "purge".
