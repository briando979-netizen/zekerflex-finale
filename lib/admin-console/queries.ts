import { z } from "zod";
import {
  DisputeStatus,
  ShiftStatus,
  TimesheetStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { defineQuery, type QueryHandler } from "@/lib/admin-console/types";

// ---------------------------------------------------------------------------
// Read-only query registry. Each handler is a fixed, parameterised query -
// there is no code path that runs an LLM-authored SQL string.
// ---------------------------------------------------------------------------

const MATCHABLE: ShiftStatus[] = [
  ShiftStatus.OPEN,
  ShiftStatus.MATCHING,
  ShiftStatus.PARTIALLY_FILLED,
];

function startOfMonth(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

const platformKpis = defineQuery({
  name: "platform_kpis",
  description:
    "Kerncijfers van het platform: aantal gebruikers, flexwerkers, open shifts, in te keuren urenbriefjes, open geschillen, facturen deze maand.",
  params: z.object({}),
  paramsHint: "{} (geen parameters)",
  async run() {
    const [
      users,
      freelancers,
      openShifts,
      pendingTimesheets,
      openDisputes,
      invoicesThisMonth,
    ] = await Promise.all([
      prisma.user.count({ where: { disabledAt: null } }),
      prisma.freelancerProfile.count(),
      prisma.shift.count({ where: { status: { in: MATCHABLE } } }),
      prisma.timesheet.count({
        where: {
          status: { in: [TimesheetStatus.SUBMITTED, TimesheetStatus.DISPUTED] },
        },
      }),
      prisma.dispute.count({
        where: {
          status: { in: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW] },
        },
      }),
      prisma.invoice.count({ where: { createdAt: { gte: startOfMonth() } } }),
    ]);
    return {
      columns: ["metric", "value"],
      rows: [
        { metric: "Actieve gebruikers", value: users },
        { metric: "Flexwerkers (profielen)", value: freelancers },
        { metric: "Open shifts", value: openShifts },
        { metric: "Urenbriefjes te keuren", value: pendingTimesheets },
        { metric: "Open geschillen", value: openDisputes },
        { metric: "Facturen deze maand", value: invoicesThisMonth },
      ],
    };
  },
});

const countFreelancersByStatus = defineQuery({
  name: "count_freelancers_by_status",
  description:
    "Tel flexwerkers per dimensie: 'kyc' (verificatiestatus), 'badge' (niveau BRONZE..PLATINUM), 'blacklist' (op zwarte lijst), 'matchingBlocked' (matching tijdelijk geblokkeerd door Wet DBA).",
  params: z.object({
    dimension: z.enum(["kyc", "badge", "blacklist", "matchingBlocked"]),
  }),
  paramsHint: '{ "dimension": "kyc" | "badge" | "blacklist" | "matchingBlocked" }',
  async run(params) {
    if (params.dimension === "kyc") {
      const grouped = await prisma.user.groupBy({
        by: ["kycStatus"],
        _count: { _all: true },
        where: { freelancerProfile: { isNot: null } },
      });
      return {
        columns: ["kycStatus", "count"],
        rows: grouped.map((g) => ({
          kycStatus: g.kycStatus,
          count: g._count._all,
        })),
      };
    }
    if (params.dimension === "badge") {
      const grouped = await prisma.freelancerProfile.groupBy({
        by: ["badgeLevel"],
        _count: { _all: true },
      });
      return {
        columns: ["badgeLevel", "count"],
        rows: grouped.map((g) => ({
          badgeLevel: g.badgeLevel,
          count: g._count._all,
        })),
      };
    }
    if (params.dimension === "blacklist") {
      const [yes, no] = await Promise.all([
        prisma.freelancerProfile.count({ where: { isBlacklisted: true } }),
        prisma.freelancerProfile.count({ where: { isBlacklisted: false } }),
      ]);
      return {
        columns: ["blacklisted", "count"],
        rows: [
          { blacklisted: "ja", count: yes },
          { blacklisted: "nee", count: no },
        ],
      };
    }
    const blocked = await prisma.freelancerProfile.count({
      where: { matchingBlockedUntil: { gt: new Date() } },
    });
    const total = await prisma.freelancerProfile.count();
    return {
      columns: ["state", "count"],
      rows: [
        { state: "matching geblokkeerd", count: blocked },
        { state: "vrij", count: total - blocked },
      ],
      scalar: blocked,
    };
  },
});

const searchFreelancers = defineQuery({
  name: "search_freelancers",
  description:
    "Zoek flexwerkers op (deel van) naam, e-mailadres of KVK-nummer. Geeft profielstatus terug.",
  params: z.object({
    term: z.string().min(2).max(120),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  paramsHint: '{ "term": string (>=2 tekens), "limit"?: number (1-50, standaard 20) }',
  async run(params) {
    const term = params.term.trim();
    const found = await prisma.freelancerProfile.findMany({
      where: {
        OR: [
          { user: { fullName: { contains: term, mode: "insensitive" } } },
          { user: { email: { contains: term, mode: "insensitive" } } },
          { kvkNumber: { contains: term } },
        ],
      },
      include: { user: { select: { fullName: true, email: true } } },
      take: params.limit,
      orderBy: { createdAt: "desc" },
    });
    return {
      columns: [
        "name",
        "email",
        "kvkNumber",
        "badge",
        "blacklisted",
        "matchingBlockedUntil",
      ],
      rows: found.map((f) => ({
        name: f.user.fullName,
        email: f.user.email,
        kvkNumber: f.kvkNumber,
        badge: f.badgeLevel,
        blacklisted: f.isBlacklisted,
        matchingBlockedUntil: f.matchingBlockedUntil?.toISOString() ?? null,
      })),
      note: `${found.length} resultaat/resultaten`,
    };
  },
});

const complianceOverview = defineQuery({
  name: "compliance_overview",
  description:
    "Wet DBA-nalevingsoverzicht: recente risicobeoordelingen per risiconiveau/actie, plus de flexwerkers waarvoor matching nu geblokkeerd is.",
  params: z.object({
    sinceDays: z.number().int().min(1).max(365).default(30),
  }),
  paramsHint: '{ "sinceDays"?: number (1-365, standaard 30) }',
  async run(params) {
    const since = new Date(Date.now() - params.sinceDays * 24 * 60 * 60 * 1000);
    const [grouped, blocked] = await Promise.all([
      prisma.dbaComplianceRecord.groupBy({
        by: ["riskLevel", "action"],
        _count: { _all: true },
        where: { createdAt: { gte: since } },
      }),
      prisma.freelancerProfile.findMany({
        where: { matchingBlockedUntil: { gt: new Date() } },
        include: { user: { select: { fullName: true, email: true } } },
      }),
    ]);
    return {
      columns: ["riskLevel", "action", "count"],
      rows: grouped.map((g) => ({
        riskLevel: g.riskLevel,
        action: g.action,
        count: g._count._all,
      })),
      note:
        blocked.length === 0
          ? "Geen actieve matching-blokkades."
          : `Geblokkeerd: ${blocked
              .map(
                (b) =>
                  `${b.user.fullName} (tot ${b.matchingBlockedUntil?.toISOString().slice(0, 10)})`,
              )
              .join("; ")}`,
    };
  },
});

const activeShifts = defineQuery({
  name: "active_shifts",
  description:
    "Toon shifts die nog niet (volledig) gevuld zijn, optioneel gefilterd op vestigingsnaam.",
  params: z.object({ locationName: z.string().min(2).max(120).optional() }),
  paramsHint: '{ "locationName"?: string }',
  async run(params) {
    const shifts = await prisma.shift.findMany({
      where: {
        status: { in: MATCHABLE },
        ...(params.locationName
          ? {
              branch: {
                name: { contains: params.locationName, mode: "insensitive" },
              },
            }
          : {}),
      },
      include: {
        branch: { select: { name: true, city: true } },
        _count: { select: { assignments: { where: { cancelledAt: null } } } },
      },
      orderBy: { startsAt: "asc" },
      take: 50,
    });
    return {
      columns: [
        "title",
        "branch",
        "city",
        "startsAt",
        "positions",
        "assigned",
        "status",
      ],
      rows: shifts.map((s) => ({
        title: s.title,
        branch: s.branch.name,
        city: s.branch.city,
        startsAt: s.startsAt.toISOString(),
        positions: s.positions,
        assigned: s._count.assignments,
        status: s.status,
      })),
      note: `${shifts.length} shift(s)`,
    };
  },
});

export const QUERIES: Record<string, QueryHandler> = Object.fromEntries(
  [
    platformKpis,
    countFreelancersByStatus,
    searchFreelancers,
    complianceOverview,
    activeShifts,
  ].map((h) => [h.name, h]),
);
