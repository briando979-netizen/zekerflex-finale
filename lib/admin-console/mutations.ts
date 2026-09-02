import { z } from "zod";
import { Prisma, ShiftStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { defineMutation, type MutationHandler } from "@/lib/admin-console/types";

// ---------------------------------------------------------------------------
// Data-changing operations. Each declares a `dryRun` (blast radius, no writes)
// and an `execute` (only ever called by the confirm endpoint, after the
// operator has seen the impact and an advisory token has been minted+verified).
// ---------------------------------------------------------------------------

const MATCHABLE: ShiftStatus[] = [
  ShiftStatus.OPEN,
  ShiftStatus.MATCHING,
  ShiftStatus.PARTIALLY_FILLED,
];

function fridayAfternoonWarning(): string[] {
  const now = new Date();
  return now.getDay() === 5 && now.getHours() >= 12
    ? [
        "Het is vrijdagmiddag. Accounts die na het weekend terugkeren moeten " +
          "handmatig worden geheractiveerd - overweeg dit maandagochtend te doen.",
      ]
    : [];
}

// --- deactivate_inactive_freelancers --------------------------------------

function inactiveFreelancerWhere(inactiveDays: number): Prisma.UserWhereInput {
  const cutoff = new Date(Date.now() - inactiveDays * 86_400_000);
  return {
    disabledAt: null,
    freelancerProfile: {
      is: {
        assignments: {
          none: { cancelledAt: null, shift: { startsAt: { gte: new Date() } } },
        },
      },
    },
    OR: [
      { lastLoginAt: { lt: cutoff } },
      { AND: [{ lastLoginAt: null }, { createdAt: { lt: cutoff } }] },
    ],
  };
}

const deactivateInactiveFreelancers = defineMutation({
  name: "deactivate_inactive_freelancers",
  description:
    "Deactiveer flexwerker-accounts die minstens N dagen niet zijn ingelogd en geen komende shift hebben. Standaard 120 dagen.",
  params: z.object({
    inactiveDays: z.number().int().min(30).max(1095).default(120),
  }),
  paramsHint: '{ "inactiveDays"?: number (30-1095, standaard 120) }',
  risk: "high",
  async dryRun(params) {
    const where = inactiveFreelancerWhere(params.inactiveDays);
    const [affectedCount, sample] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: { email: true, fullName: true, lastLoginAt: true },
        take: 10,
        orderBy: { lastLoginAt: "asc" },
      }),
    ]);
    const warnings = [
      "Gedeactiveerde accounts kunnen niet meer inloggen tot handmatige heractivatie.",
      ...fridayAfternoonWarning(),
    ];
    if (affectedCount > 50) {
      warnings.push(
        `Grote batch (${affectedCount}). Overweeg een hogere drempel of gefaseerd uitvoeren.`,
      );
    }
    return {
      affectedCount,
      sample: sample.map((s) => ({
        naam: s.fullName,
        email: s.email,
        laatsteLogin: s.lastLoginAt?.toISOString().slice(0, 10) ?? "nooit",
      })),
      warnings,
      reversible: true,
      summary: `${affectedCount} inactieve flexwerker-account(s) worden gedeactiveerd (drempel ${params.inactiveDays} dagen).`,
    };
  },
  async execute(params) {
    const res = await prisma.user.updateMany({
      where: inactiveFreelancerWhere(params.inactiveDays),
      data: { disabledAt: new Date() },
    });
    return {
      affectedCount: res.count,
      detail: `${res.count} account(s) gedeactiveerd.`,
    };
  },
});

// --- cancel_past_due_open_shifts ----------------------------------------

function staleShiftWhere(): Prisma.ShiftWhereInput {
  return { status: { in: MATCHABLE }, startsAt: { lt: new Date() } };
}

const cancelPastDueOpenShifts = defineMutation({
  name: "cancel_past_due_open_shifts",
  description:
    "Annuleer shifts waarvan de starttijd al is verstreken maar die nog OPEN / MATCHING / gedeeltelijk gevuld zijn.",
  params: z.object({}),
  paramsHint: "{} (geen parameters)",
  risk: "medium",
  async dryRun() {
    const where = staleShiftWhere();
    const [affectedCount, sample] = await Promise.all([
      prisma.shift.count({ where }),
      prisma.shift.findMany({
        where,
        select: {
          title: true,
          startsAt: true,
          branch: { select: { name: true } },
        },
        take: 10,
        orderBy: { startsAt: "asc" },
      }),
    ]);
    return {
      affectedCount,
      sample: sample.map((s) => ({
        titel: s.title,
        vestiging: s.branch.name,
        startte: s.startsAt.toISOString(),
      })),
      warnings:
        affectedCount === 0
          ? []
          : [
              "Lopende matching-golven voor deze shifts stoppen bij de volgende worker-tick.",
            ],
      reversible: false,
      summary: `${affectedCount} verlopen open shift(s) worden op CANCELLED gezet.`,
    };
  },
  async execute() {
    const res = await prisma.shift.updateMany({
      where: staleShiftWhere(),
      data: { status: ShiftStatus.CANCELLED },
    });
    return {
      affectedCount: res.count,
      detail: `${res.count} shift(s) geannuleerd.`,
    };
  },
});

// --- block_freelancer_matching ----------------------------------------

const blockFreelancerMatching = defineMutation({
  name: "block_freelancer_matching",
  description:
    "Blokkeer tijdelijk de matching voor een flexwerker (op e-mailadres) voor een aantal dagen, met reden.",
  params: z.object({
    freelancerEmail: z.string().email(),
    days: z.number().int().min(1).max(90).default(14),
    reason: z.string().min(3).max(300),
  }),
  paramsHint:
    '{ "freelancerEmail": string, "days"?: number (1-90, standaard 14), "reason": string }',
  risk: "medium",
  async dryRun(params) {
    const email = params.freelancerEmail.toLowerCase().trim();
    const profile = await prisma.freelancerProfile.findFirst({
      where: { user: { email } },
      include: { user: { select: { fullName: true } } },
    });
    if (!profile) {
      return {
        affectedCount: 0,
        sample: [],
        warnings: [`Geen flexwerker gevonden met e-mail ${email}.`],
        reversible: true,
        summary: "Geen match - er wordt niets gewijzigd.",
      };
    }
    const until = new Date(Date.now() + params.days * 86_400_000);
    return {
      affectedCount: 1,
      sample: [
        {
          naam: profile.user.fullName,
          email,
          huidigeBlokkade:
            profile.matchingBlockedUntil?.toISOString().slice(0, 10) ?? "geen",
          nieuweBlokkadeTot: until.toISOString().slice(0, 10),
        },
      ],
      warnings: [],
      reversible: true,
      summary: `Matching voor ${profile.user.fullName} wordt geblokkeerd tot ${until
        .toISOString()
        .slice(0, 10)}.`,
    };
  },
  async execute(params) {
    const email = params.freelancerEmail.toLowerCase().trim();
    const until = new Date(Date.now() + params.days * 86_400_000);
    const res = await prisma.freelancerProfile.updateMany({
      where: { user: { email } },
      data: { matchingBlockedUntil: until },
    });
    return {
      affectedCount: res.count,
      detail:
        res.count === 0
          ? "Geen flexwerker gevonden."
          : `Matching geblokkeerd tot ${until.toISOString().slice(0, 10)}.`,
    };
  },
});

export const MUTATIONS: Record<string, MutationHandler> = Object.fromEntries(
  [
    deactivateInactiveFreelancers,
    cancelPastDueOpenShifts,
    blockFreelancerMatching,
  ].map((h) => [h.name, h]),
);
