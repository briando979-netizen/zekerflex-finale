import { createSchema } from "graphql-yoga";
import { GraphQLError } from "graphql";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPrincipal, hasRole, type Principal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getKpis } from "@/lib/admin/kpis";
import { buildWeeklyRun } from "@/lib/payroll/engine";
import { getRun, listRuns, payslipsForUser } from "@/lib/payroll/store";

// ---------------------------------------------------------------------------
// ZekerFlex GraphQL API ("graphify"). Read-mostly, role-gated, reuses the same
// domain libraries as the REST endpoints. The single mutation (buildPayrollRun)
// is filesystem-only — it never writes to Postgres.
// ---------------------------------------------------------------------------

export interface GraphQLContext {
  principal: Principal | null;
}

export async function buildContext(): Promise<GraphQLContext> {
  return { principal: await getPrincipal() };
}

function requireRoles(ctx: GraphQLContext, ...roles: UserRole[]): Principal {
  if (!ctx.principal) {
    throw new GraphQLError("Authentication required", {
      extensions: { code: "UNAUTHENTICATED", http: { status: 401 } },
    });
  }
  if (roles.length && !hasRole(ctx.principal, ...roles)) {
    throw new GraphQLError(`Requires one of: ${roles.join(", ")}`, {
      extensions: { code: "FORBIDDEN", http: { status: 403 } },
    });
  }
  return ctx.principal;
}

const typeDefs = /* GraphQL */ `
  """The authenticated caller. Null for an unauthenticated request."""
  type Viewer {
    userId: ID!
    email: String!
    fullName: String!
    "The caller's role grants, e.g. FREELANCER, LOCAL_MANAGER, PLATFORM_ADMIN."
    roles: [String!]!
    emailVerified: Boolean!
  }

  """A posted work shift. Freelancers only ever see OPEN shifts; managers see their own organization's."""
  type Shift {
    id: ID!
    title: String!
    "OPEN | MATCHING | PARTIALLY_FILLED | COMPLETED | CANCELLED | DRAFT"
    status: String!
    startsAt: String!
    endsAt: String!
    hourlyRateCents: Int!
    positions: Int!
    branchName: String
    tenantName: String
  }

  """A platform KPI time series, as shown on the admin dashboard. PLATFORM_ADMIN only."""
  type Kpi {
    key: String!
    label: String!
    total: Float!
    deltaPct: Float
    series: [Float!]!
  }

  type PayrollTotals {
    workers: Int!
    payrollWorkers: Int!
    invoiceWorkers: Int!
    grossCents: Int!
    payoutCents: Int!
    fiscalIncomplete: Int!
  }

  type PayrollLine {
    workerName: String!
    workerKind: String
    totalHours: Float!
    headlineCents: Int!
    headlineLabel: String!
    fiscalComplete: Boolean!
    phase: String
  }

  """A single weekly payroll run, identified by ISO week (e.g. "2026-W35"). PLATFORM_ADMIN only."""
  type PayrollRun {
    isoWeek: String!
    weekLabel: String!
    status: String!
    createdAt: String!
    totals: PayrollTotals!
    payslips: [PayrollLine!]!
  }

  type PayrollRunSummary {
    isoWeek: String!
    weekLabel: String!
    status: String!
    workers: Int!
    payoutCents: Int!
    fiscalIncomplete: Int!
  }

  """One freelancer's own payslip for a given ISO week. Returned only for the authenticated freelancer."""
  type Payslip {
    isoWeek: String!
    weekLabel: String!
    kind: String!
    workerKind: String
    totalHours: Float!
    headlineCents: Int!
    headlineLabel: String!
    baseCents: Int!
  }

  type Query {
    "The authenticated caller, or null when unauthenticated."
    me: Viewer
    "Shifts visible to the caller: OPEN only for freelancers, scoped to the caller's organization for managers."
    shifts(status: String, take: Int = 25): [Shift!]!
    "A single shift by id, subject to the same visibility rule as shifts(). Returns null if not visible."
    shift(id: ID!): Shift
    "Platform-wide KPI series. Requires PLATFORM_ADMIN."
    platformKpis: [Kpi!]!
    "Summaries of past weekly payroll runs. Requires PLATFORM_ADMIN."
    payrollRuns: [PayrollRunSummary!]!
    "A single payroll run's full detail by ISO week. Requires PLATFORM_ADMIN."
    payrollRun(isoWeek: String!): PayrollRun
    "The authenticated freelancer's own payslip history. Requires the FREELANCER role."
    myPayslips: [Payslip!]!
  }

  type Mutation {
    """Rebuild the (draft) weekly payroll run for an ISO week, e.g. "2026-W35". Requires PLATFORM_ADMIN. Filesystem-only — never writes to Postgres."""
    buildPayrollRun(isoWeek: String!): PayrollRun!
  }
`;

const MANAGER: UserRole[] = ["LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN", "DISPUTE_MANAGER"];

const resolvers = {
  Query: {
    me: (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      if (!ctx.principal) return null;
      return {
        userId: ctx.principal.userId,
        email: ctx.principal.email,
        fullName: ctx.principal.fullName,
        roles: [...new Set(ctx.principal.grants.map((g) => g.role))],
        emailVerified: Boolean(ctx.principal.emailVerifiedAt),
      };
    },

    shifts: async (_p: unknown, args: { status?: string; take?: number }, ctx: GraphQLContext) => {
      const p = requireRoles(ctx);
      const take = Math.min(Math.max(args.take ?? 25, 1), 100);
      const isManager = hasRole(p, ...MANAGER);
      const where: Record<string, unknown> = {};
      if (args.status) where.status = args.status;
      if (!isManager) {
        where.status = "OPEN"; // freelancers only see open work
      } else if (!hasRole(p, "PLATFORM_ADMIN")) {
        // A manager only sees shifts at the organizations/branches they're
        // actually granted — same scoping the REST employer dashboard uses.
        // Previously this resolver checked role only, so any manager could
        // list every tenant's shifts over GraphQL regardless of membership.
        const scope = await resolveEmployerScope(p);
        where.branch = scope.branchIds
          ? { id: { in: scope.branchIds } }
          : { tenantId: { in: scope.tenantIds } };
      }
      const rows = await prisma.shift.findMany({
        where,
        take,
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          title: true,
          status: true,
          startsAt: true,
          endsAt: true,
          hourlyRateCents: true,
          positions: true,
          branch: { select: { name: true, tenant: { select: { name: true } } } },
        },
      });
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        startsAt: r.startsAt.toISOString(),
        endsAt: r.endsAt.toISOString(),
        hourlyRateCents: r.hourlyRateCents,
        positions: r.positions,
        branchName: r.branch?.name ?? null,
        tenantName: r.branch?.tenant?.name ?? null,
      }));
    },

    shift: async (_p: unknown, args: { id: string }, ctx: GraphQLContext) => {
      const p = requireRoles(ctx);
      const isManager = hasRole(p, ...MANAGER);
      const where: Record<string, unknown> = { id: args.id };
      if (!isManager) {
        where.status = "OPEN"; // same visibility rule as the list query
      } else if (!hasRole(p, "PLATFORM_ADMIN")) {
        const scope = await resolveEmployerScope(p);
        where.branch = scope.branchIds
          ? { id: { in: scope.branchIds } }
          : { tenantId: { in: scope.tenantIds } };
      }
      // findFirst (not findUnique) so the scope above applies as part of the
      // query — a shift outside the caller's visibility comes back as null,
      // same as "doesn't exist", rather than a separate leak-prone check
      // after an unscoped fetch.
      const r = await prisma.shift.findFirst({
        where,
        select: {
          id: true,
          title: true,
          status: true,
          startsAt: true,
          endsAt: true,
          hourlyRateCents: true,
          positions: true,
          branch: { select: { name: true, tenant: { select: { name: true } } } },
        },
      });
      if (!r) return null;
      return {
        id: r.id,
        title: r.title,
        status: r.status,
        startsAt: r.startsAt.toISOString(),
        endsAt: r.endsAt.toISOString(),
        hourlyRateCents: r.hourlyRateCents,
        positions: r.positions,
        branchName: r.branch?.name ?? null,
        tenantName: r.branch?.tenant?.name ?? null,
      };
    },

    platformKpis: async (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      requireRoles(ctx, "PLATFORM_ADMIN");
      return getKpis();
    },

    payrollRuns: async (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      requireRoles(ctx, "PLATFORM_ADMIN");
      return listRuns();
    },

    payrollRun: async (_p: unknown, args: { isoWeek: string }, ctx: GraphQLContext) => {
      requireRoles(ctx, "PLATFORM_ADMIN");
      const run = await getRun(args.isoWeek);
      return run ? serialiseRun(run) : null;
    },

    myPayslips: async (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      const p = requireRoles(ctx, "FREELANCER");
      const slips = await payslipsForUser(p.userId);
      return slips.map((s) => {
        const b = s.computed.breakdown;
        return {
          isoWeek: s.isoWeek,
          weekLabel: s.weekLabel,
          kind: b.kind,
          workerKind: s.workerKind,
          totalHours: s.computed.totalHours,
          headlineCents: s.computed.headlineCents,
          headlineLabel: s.computed.headlineLabel,
          baseCents: b.kind === "payroll" ? b.grossCents : b.servicesCents,
        };
      });
    },
  },

  Mutation: {
    buildPayrollRun: async (_p: unknown, args: { isoWeek: string }, ctx: GraphQLContext) => {
      const p = requireRoles(ctx, "PLATFORM_ADMIN");
      const { run } = await buildWeeklyRun(args.isoWeek, p.userId);
      return serialiseRun(run);
    },
  },
};

function serialiseRun(run: Awaited<ReturnType<typeof getRun>>) {
  if (!run) return null;
  return {
    isoWeek: run.isoWeek,
    weekLabel: run.weekLabel,
    status: run.status,
    createdAt: run.createdAt,
    totals: run.totals,
    payslips: run.payslips.map((s) => ({
      workerName: s.workerName,
      workerKind: s.workerKind,
      totalHours: s.computed.totalHours,
      headlineCents: s.computed.headlineCents,
      headlineLabel: s.computed.headlineLabel,
      fiscalComplete: s.fiscalComplete,
      phase: s.computed.breakdown.kind === "payroll" ? s.computed.breakdown.phase : null,
    })),
  };
}

export const schema = createSchema<GraphQLContext>({ typeDefs, resolvers });
