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
| `vitest` 2 → 5 | 2.1.9 | v3–v5 unbundled `vite` (needs it as a direct dep) + workspace→projects; re-verify all 45 test files. Clears the current dev-only `vite`/`esbuild` advisories. |

## Intentional pins

- **`next-auth` = `5.0.0-beta.32`** — v5 is required for the Edge-verifiable
  session tokens the middleware reads. A move to "latest" is a *downgrade* to
  v4. Ignored in `dependabot.yml`. Watch for the v5 stable release.

## When starting a deferred major

1. Branch off `main`.
2. Bump just that package (+ its lockstep siblings).
3. `npm run typecheck && npm test && npm run test:e2e`, then a real
   `next build` on Linux/Docker.
4. Update this table.
