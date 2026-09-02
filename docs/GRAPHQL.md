# GraphQL API

Endpoint: `POST /api/graphql` — same origin, same session cookie as the REST API.
GraphiQL is served on `GET /api/graphql` **outside production only** (the
production CSP blocks its CDN assets).

Auth: the resolver context resolves the signed-in `Principal`. Unauthenticated
queries get `me: null`; role-gated fields throw `UNAUTHENTICATED` / `FORBIDDEN`.

## Schema

```graphql
type Query {
  me: Viewer
  shifts(status: String, take: Int = 25): [Shift!]!   # freelancers see OPEN only
  shift(id: ID!): Shift
  platformKpis: [Kpi!]!                                # HQ_ADMIN | PLATFORM_ADMIN
  payrollRuns: [PayrollRunSummary!]!                   # HQ_ADMIN | PLATFORM_ADMIN
  payrollRun(isoWeek: String!): PayrollRun             # HQ_ADMIN | PLATFORM_ADMIN
  myPayslips: [Payslip!]!                              # FREELANCER
}

type Mutation {
  buildPayrollRun(isoWeek: String!): PayrollRun!       # PLATFORM_ADMIN, filesystem only
}
```

## Examples

```bash
# Public — nothing sensitive
curl -s localhost:3000/api/graphql -H 'content-type: application/json' \
  -d '{"query":"{ me { userId roles } }"}'

# Authenticated (send the session cookie)
curl -s localhost:3000/api/graphql -H 'content-type: application/json' \
  -b 'zekerflex.session=<token>' \
  -d '{"query":"query($w:String!){ payrollRun(isoWeek:$w){ weekLabel totals { workers payoutCents } payslips { workerName headlineCents } } }","variables":{"w":"2026-W35"}}'

# Rebuild a draft run
curl -s localhost:3000/api/graphql -H 'content-type: application/json' \
  -b 'zf_session=<admin-token>' \
  -d '{"query":"mutation($w:String!){ buildPayrollRun(isoWeek:$w){ status totals { payoutCents } } }","variables":{"w":"2026-W35"}}'
```

Implementation: [`lib/graphql/schema.ts`](../lib/graphql/schema.ts),
route [`app/api/graphql/route.ts`](../app/api/graphql/route.ts).
