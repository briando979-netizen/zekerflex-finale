# Dependency maintenance

## Weekly cadence

Dependabot opens grouped PRs every Monday (`.github/dependabot.yml`). Aim to
clear them within the week:

| PR group | Action |
|---|---|
| `npm-prod` / `npm-dev` (minor + patch) | Check the diff, run `npm run typecheck && npm test && npm run test:e2e`, merge. |
| `npm-prod-major` / `npm-dev-major` | Do **not** merge on sight. Skim what's inside; anything non-trivial gets its own ticket + branch (see the deferred list below). Close the rest of the PR or let it re-open next week. |
| `github-actions` / `docker` / `terraform` | Read the changelog, merge if it's a patch/minor. |

`npm audit --omit=dev` must stay at **0**. Dev-only advisories are lower
priority but shouldn't be ignored indefinitely.

> CI is currently disabled (account billing lock), so the merge gate is manual:
> run the three commands locally before merging. Re-enable
> `.github/workflows/*` once billing is restored and this becomes automatic.

## Consciously deferred majors

These need a real migration, not a version bump. Each is its own piece of work.

| Package | Current | Blocker / cost |
|---|---|---|
| `react` / `react-dom` 18 → 19 | 18.3.1 | Server Components / `useActionState` / ref-as-prop changes; pairs with Next 16. |
| `next` 15 → 16 | 15.5.25 | Another async-API + caching pass on top of the 15 migration. |
| `@prisma/client` / `prisma` 5 → 7 | 5.22.0 | Query-engine + client API changes; every `$transaction` / raw query to re-check. |
| `zod` 3 → 4 | 3.25.76 | Error-format + `.parse` behaviour changes across ~all route schemas. |
| `tailwindcss` 3 → 4 | 3.4.19 | New Oxide engine + config-in-CSS; whole design system re-tests. |
| `typescript` 5 → 7 | 5.9.3 | New checker; expect fresh diagnostics. |
| `eslint` 8 → 9/10 | 8.57.1 | Flat config migration; `eslint-config-next` must move in lockstep. |
| `date-fns` 3 → 4 | 3.6.0 | ESM/tree-shaking + timezone API changes. |
| `zustand` 4 → 5 | 4.5.7 | `create` signature + middleware types. |
| `jose` 5 → 6 | 5.10.0 | Node-version floor + a few API renames in the session codec. |
| `ioredis` 5 → 6 | 5.11.1 | Connection/option changes; the daemon + rate-limit + dispatcher all use it. |
| `node` (Docker base) 20 → 26 | 20-bookworm-slim | Bump in step with the runtime the VPS/K8s actually runs. |
| `hashicorp/aws` (terraform) 5 → 6 | 5.x | Provider v6 renames/removes attributes; needs a `terraform plan` review against live state. |

Done: `vitest` 2 → 5 (+ `vite` 8 as a direct devDep, `@types/node` 22, config
renamed to `vitest.config.mts`) — cleared the dev-only `vite`/`esbuild`/`vitest`
advisories, so `npm audit` (incl. dev) is now **0**.

## Intentional pins

### `next-auth` = `5.0.0-beta.32` (exact, no caret)

v5 is required for the Edge-verifiable session tokens the middleware reads
([lib/auth/session.ts](../lib/auth/session.ts) mints plain jose HS256 JWTs;
next-auth is wired to them via its `jwt.encode`/`jwt.decode` hooks). npm's
`latest` tag is **v4.24.15** — moving there is a *downgrade* that breaks Edge
verification. There is no stable v5 and no RC; `beta.32` (published 2026-07-20)
is the newest pre-release.

This is a conscious, contained pin, not a TODO:

- **Exact version**, no `^` — a new `beta.33` will not install itself. Bumping
  is a deliberate act.
- Ignored in [`.github/dependabot.yml`](../.github/dependabot.yml) so it never
  shows up as weekly noise.
- The surface we depend on is under test:
  [`tests/auth-signin.test.ts`](../tests/auth-signin.test.ts) exercises the
  credentials `authorize`, the `jwt.encode`/`decode` token contract, the
  `jwt`/`session` role propagation and the Google `signIn` gate. The E2E suite
  covers login / logout / wrong-password end to end.
- next-auth is reduced to a thin shell here — `handlers`, `signIn`, `signOut`
  (4 call sites). The middleware and every route use our own
  `decodeSession` / `getPrincipal`, not `auth()`. If the beta ever becomes a
  liability, replacing it is ~150 lines (credentials + a Google OAuth2
  authorization-code flow on top of the session codec we already own).

**When a stable v5 (or v5 RC) ships:**

1. Branch off `main`. Bump `next-auth` to the exact stable version.
2. Read the v5 beta→stable migration notes — particularly anything about
   `jwt.encode`/`jwt.decode`, the `Credentials` provider return shape, and the
   `signIn`/`session` callback signatures.
3. `npm run typecheck && npm test && npm run test:e2e`. `tests/auth-signin.test.ts`
   is the canary — it fails loudly if a hook contract changed.
4. Real `next build` on Linux/Docker, then a manual login + Google login + logout.
5. Drop the `next-auth` ignore from `dependabot.yml` if the line is stable again.

## When starting a deferred major

1. Branch off `main`.
2. Bump just that package (+ its lockstep siblings).
3. `npm run typecheck && npm test && npm run test:e2e`, then a real
   `next build` on Linux/Docker.
4. Update this table.
