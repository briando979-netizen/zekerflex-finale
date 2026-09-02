import { createSchema } from "graphql-yoga";
import { GraphQLError } from "graphql";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPrincipal, hasRole, type Principal } from "@/lib/auth";
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
  type Viewer {
    userId: ID!
    email: String!
    fullName: String!
    roles: [String!]!
    emailVerified: Boolean!
  }

  type Shift {
    id: ID!
    title: String!
    status: String!
    startsAt: String!
    endsAt: String!
    hourlyRateCents: Int!
    positions: Int!
    branchName: String
    tenantName: String
  }

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
    me: Viewer
    shifts(status: String, take: Int = 25): [Shift!]!
    shift(id: ID!): Shift
    platformKpis: [Kpi!]!
    payrollRuns: [PayrollRunSummary!]!
    payrollRun(isoWeek: String!): PayrollRun
    myPayslips: [Payslip!]!
  }

  type Mutation {
    """Rebuild the (draft) weekly payroll run for an ISO week, e.g. "2026-W35". Admin only, filesystem only."""
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
      if (!isManager) where.status = "OPEN"; // freelancers only see open work
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
      requireRoles(ctx);
      const r = await prisma.shift.findUnique({
        where: { id: args.id },
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
      requireRoles(ctx, "HQ_ADMIN", "PLATFORM_ADMIN");
      return getKpis();
    },

    payrollRuns: async (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      requireRoles(ctx, "HQ_ADMIN", "PLATFORM_ADMIN");
      return listRuns();
    },

    payrollRun: async (_p: unknown, args: { isoWeek: string }, ctx: GraphQLContext) => {
      requireRoles(ctx, "HQ_ADMIN", "PLATFORM_ADMIN");
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
