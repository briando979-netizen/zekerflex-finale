import { z } from "zod";
import { Prisma, ShiftStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { defineMutation, type MutationHandler } from "@/lib/admin-console/types";
import { amsterdamParts } from "@/lib/time/amsterdam";
import { teWissenWhere } from "@/lib/analytics/label-opschoning";

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
  const now = amsterdamParts(new Date()); // Dutch clock: the server runs in UTC
  return now.weekday === 5 && now.hour >= 12
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

// Alleen klussen waar niemand (meer) op staat. Een klus met een actieve inschrijving (cancelledAt null) is gewoon
// uitgevoerd of loopt nog: die hoort niet op CANCELLED (14 nov: ook PARTIALLY_FILLED met werkers erop viel hieronder).
// Zulke klussen rondt de nachtelijke taak na afloop af (lib/shifts/verlopen.ts); hier worden ze alleen geteld.
// "Verlopen" = de eindtijd is voorbij, niet de starttijd: een klus van acht uur die een uur geleden begon, kan nog
// steeds iemand krijgen en wordt niet midden in de dienst geannuleerd.
function staleShiftWhere(): Prisma.ShiftWhereInput {
  return { status: { in: MATCHABLE }, endsAt: { lt: new Date() }, assignments: { none: { cancelledAt: null } } };
}

function staleMetIemandWhere(): Prisma.ShiftWhereInput {
  return { status: { in: MATCHABLE }, endsAt: { lt: new Date() }, assignments: { some: { cancelledAt: null } } };
}

function blijvenStaanTekst(n: number): string {
  return `${n} verlopen klus(sen) met iemand erop blijven staan: die zijn uitgevoerd of nog bezig en horen niet op geannuleerd.`;
}

const cancelPastDueOpenShifts = defineMutation({
  name: "cancel_past_due_open_shifts",
  description:
    "Annuleer klussen waarvan de eindtijd al is verstreken, die nog OPEN / MATCHING / gedeeltelijk gevuld zijn en waar niemand op staat. Klussen met een actieve inschrijving blijven staan; een klus die nog loopt ook.",
  params: z.object({}),
  paramsHint: "{} (geen parameters)",
  risk: "medium",
  async dryRun() {
    const where = staleShiftWhere();
    const [affectedCount, sample, blijvenStaan] = await Promise.all([
      prisma.shift.count({ where }),
      prisma.shift.findMany({
        where,
        select: {
          title: true,
          startsAt: true,
          endsAt: true,
          branch: { select: { name: true } },
        },
        take: 10,
        orderBy: { endsAt: "asc" },
      }),
      prisma.shift.count({ where: staleMetIemandWhere() }),
    ]);
    const warnings: string[] = [];
    if (affectedCount > 0) warnings.push("Lopende matching-golven voor deze klussen stoppen bij de volgende worker-tick.");
    if (blijvenStaan > 0) warnings.push(blijvenStaanTekst(blijvenStaan));
    return {
      affectedCount,
      sample: sample.map((s) => ({
        titel: s.title,
        vestiging: s.branch.name,
        startte: s.startsAt.toISOString(),
        eindigde: s.endsAt.toISOString(),
      })),
      warnings,
      reversible: false,
      summary: `${affectedCount} verlopen open klus(sen) zonder iemand erop worden op CANCELLED gezet; ${blijvenStaan} met iemand erop blijven staan.`,
    };
  },
  async execute() {
    const [res, blijvenStaan] = await Promise.all([
      prisma.shift.updateMany({
        where: staleShiftWhere(),
        data: { status: ShiftStatus.CANCELLED },
      }),
      prisma.shift.count({ where: staleMetIemandWhere() }),
    ]);
    return {
      affectedCount: res.count,
      detail: `${res.count} klus(sen) geannuleerd.${blijvenStaan > 0 ? ` ${blijvenStaanTekst(blijvenStaan)}` : ""}`,
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

// --- clear_chat_click_labels --------------------------------------------

// Kliklabels met namen of berichttekst (14 nov). Vóór de regel in bewaarLabel (lib/analytics/label-privacy.ts) bewaarde de
// beacon op berichten- en chatschermen de hele gespreksrij als label ("BVJan de Vries14:06Jij: …"; gemeten 1357 rijen,
// sep–14 nov). Deze actie zet zulke labels op NULL met precies die definitie (lib/analytics/label-opschoning.ts); de klik
// zelf (pad, soort, tijd) blijft staan. Optioneel ook de oude gespreksrijen buiten die paden (een klus- of agendakaart met
// het laatste bericht). In de telling en het voorbeeld staat nooit de labeltekst, alleen pad, soort, dag en lengte; het
// auditlogboek van de bevestiging (lib/admin-console/index.ts) krijgt alleen aantallen.
const clearChatClickLabels = defineMutation({
  name: "clear_chat_click_labels",
  description:
    "Wis kliklabels met namen of berichttekst: zet het label op leeg voor klikken op berichten- en chatschermen die niet in codevorm zijn (de regel van bewaarLabel sinds 14 nov). Met ookOudeChatrijen ook de oude gespreksrij-labels buiten die schermen (initialen + naam + tijd, of 'Jij: …'). De klik zelf blijft staan.",
  params: z.object({ ookOudeChatrijen: z.boolean().default(false) }),
  paramsHint: '{ "ookOudeChatrijen"?: boolean (standaard false) }',
  risk: "medium",
  async dryRun(params) {
    const where = teWissenWhere(params.ookOudeChatrijen);
    const [telling, sample] = await Promise.all([
      prisma.$queryRaw<Array<{ n: number }>>(Prisma.sql`SELECT count(*)::int AS n FROM "AnalyticsEvent" WHERE ${where}`),
      prisma.$queryRaw<Array<{ pad: string; soort: string; wanneer: Date; tekens: number }>>(
        Prisma.sql`SELECT left(split_part(path, '?', 1), 80) AS pad, "type"::text AS soort, "createdAt" AS wanneer, length(label) AS tekens FROM "AnalyticsEvent" WHERE ${where} ORDER BY "createdAt" DESC LIMIT 10`,
      ),
    ]);
    const affectedCount = telling[0]?.n ?? 0;
    const warnings = ["Het label is daarna weg en komt niet terug; de klik zelf (pad, soort, tijd) blijft staan en telt gewoon mee in de bezoekcijfers."];
    if (!params.ookOudeChatrijen) warnings.push("Oude gespreksrij-labels buiten de berichten- en chatschermen blijven staan; wis die mee met ookOudeChatrijen: true.");
    return {
      affectedCount,
      sample: sample.map((s) => ({ pad: s.pad, soort: s.soort, dag: s.wanneer.toISOString().slice(0, 10), tekens: s.tekens })),
      warnings,
      reversible: false,
      summary: `${affectedCount} kliklabel(s) met namen of berichttekst worden leeggemaakt${params.ookOudeChatrijen ? " (ook de oude gespreksrijen buiten de chat)" : ""}; de klikken zelf blijven staan.`,
    };
  },
  async execute(params) {
    const n = await prisma.$executeRaw(Prisma.sql`UPDATE "AnalyticsEvent" SET label = NULL WHERE ${teWissenWhere(params.ookOudeChatrijen)}`);
    return { affectedCount: n, detail: `${n} kliklabel(s) leeggemaakt.` };
  },
});

export const MUTATIONS: Record<string, MutationHandler> = Object.fromEntries(
  [
    deactivateInactiveFreelancers,
    cancelPastDueOpenShifts,
    blockFreelancerMatching,
    clearChatClickLabels,
  ].map((h) => [h.name, h]),
);
