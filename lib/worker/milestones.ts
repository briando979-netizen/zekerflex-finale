import { prisma } from "@/lib/prisma";
import { getFiscal, invoiceModeFor, type WorkerKind } from "@/lib/fiscal/store";
import { getUitzendStatus } from "@/lib/payroll/uitzend-status";
import { amsterdamParts, amsterdamToUtc } from "@/lib/time/amsterdam";
import { env } from "@/lib/env";
import { vulIn } from "@/lib/i18n/vul-in";
import { MILESTONE_NL, type MilestoneTeksten } from "@/lib/worker/milestone-teksten";

// ---------------------------------------------------------------------------
// "Je administratie, zonder gedoe": mijlpalen, drempels en deadlines die een
// zzp'er/flexwerker/uitzendkracht anders zelf moet onthouden — berekend uit de
// ECHTE data (goedgekeurde uren, self-billing-facturen, ABU-status). Per item:
// waar je staat, wat het betekent, en of je er beter of slechter van wordt.
// Alle fiscale bedragen zijn vuistregels/indicaties — geen belastingadvies.
// ---------------------------------------------------------------------------

// Kerndrempels (NL). Indicatieve bedragen staan als constante zodat ze later
// eenvoudig bijgesteld kunnen worden.
const URENCRITERIUM_HOURS = 1225;
const KOR_LIMIT_CENTS = 2_000_000; // € 20.000 omzetgrens kleineondernemersregeling
const ZELFSTANDIGENAFTREK_CENTS = 120_000; // ± € 1.200 (2026, indicatief)

export type MilestoneStatus = "ok" | "soon" | "action" | "info";

export interface Milestone {
  id: string;
  icon: string;
  title: string;
  status: MilestoneStatus;
  headline: string;
  detail: string;
  progress?: { value: number; max: number; unit: string; label: string };
  deadline?: string; // ISO
  impact?: string;
}

export interface WorkerMilestones {
  workerKind: WorkerKind | null;
  fiscalComplete: boolean;
  generatedAt: string;
  milestones: Milestone[];
}

// Bedragen en datums in de taal van de werker (t.intl); de tijdzone blijft Amsterdam.
const formaat = (t: MilestoneTeksten) => ({
  euro: (cents: number) => `€ ${Math.round(cents / 100).toLocaleString(t.intl)}`,
  datum: (d: Date) => d.toLocaleDateString(t.intl, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }),
});

/** Onder zoveel uur zegt de verdeling nog niets — zelfde grens als REVENUE_SHARE_MIN_HOURS in lib/compliance/dba.ts. */
const SPREAD_MIN_HOURS = 60;

export interface ClientWork {
  tenantId: string;
  name: string;
  minutes: number;
  grossCents: number;
}

/**
 * Wet DBA: hoe sterk hangt je ZekerFlex-omzet af van één opdrachtgever? Zelfde
 * grens als de DBA-bewaking van het platform (env.DBA_MAX_CLIENT_REVENUE_SHARE),
 * zodat je het seintje krijgt vóórdat de matching bij die opdrachtgever beperkt.
 */
export function spreadMilestone(work: ClientWork[], maxShare: number, t: MilestoneTeksten = MILESTONE_NL): Milestone {
  const x = t.spreiding;
  const base = { id: "spreiding", icon: "⚖️", title: x.titel };
  const totalMinutes = work.reduce((s, w) => s + w.minutes, 0);
  const totalCents = work.reduce((s, w) => s + w.grossCents, 0);
  if (totalMinutes / 60 < SPREAD_MIN_HOURS || totalCents <= 0) {
    return {
      ...base,
      status: "info",
      headline: x.teWeinig,
      detail: vulIn(x.teWeinigDetail, { uren: SPREAD_MIN_HOURS }),
    };
  }
  const top = [...work].sort((a, b) => b.grossCents - a.grossCents)[0]!;
  const share = top.grossCents / totalCents;
  const pct = Math.round(share * 100);
  const maxPct = Math.round(maxShare * 100);
  const status: MilestoneStatus = share >= maxShare ? "action" : share >= maxShare - 0.15 ? "soon" : "ok";
  const clients = work.filter((w) => w.grossCents > 0).length;
  return {
    ...base,
    status,
    headline: vulIn(x.kop, { pct, naam: top.name }),
    detail:
      status === "action"
        ? vulIn(x.actie, { pct, naam: top.name })
        : status === "soon"
          ? vulIn(x.binnenkort, { pct, naam: top.name, max: maxPct })
          : vulIn(clients === 1 ? x.verdeeldEen : x.verdeeldMeer, { n: clients, pct }),
    progress: { value: pct, max: 100, unit: "%", label: vulIn(x.voortgang, { max: maxPct }) },
    impact: x.impact,
  };
}

/** Jaar en kwartaal zoals in Nederland (de server draait in UTC). */
export function amsterdamYearQuarter(d: Date): { year: number; quarter: number } {
  const p = amsterdamParts(d);
  return { year: p.year, quarter: Math.floor((p.month - 1) / 3) + 1 };
}

/** Laatste dag van de maand ná het kwartaaleinde = btw-aangiftedeadline, eind van die dag in Nederland. */
export function btwDeadline(year: number, quarter: number): Date {
  const last = new Date(Date.UTC(year, quarter * 3 + 1, 0)); // dag 0 = laatste dag van de maand ervoor
  return amsterdamToUtc(last.getUTCFullYear(), last.getUTCMonth() + 1, last.getUTCDate(), 23, 59, 59);
}

export async function getWorkerMilestones(userId: string, now = new Date(), t: MilestoneTeksten = MILESTONE_NL): Promise<WorkerMilestones | null> {
  const { euro, datum } = formaat(t);
  const profile = await prisma.freelancerProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return null;

  const fiscal = await getFiscal(userId);
  const isPayroll = invoiceModeFor(fiscal) === "payroll";
  const { year, quarter } = amsterdamYearQuarter(now);
  const yearStart = amsterdamToUtc(year, 1, 1);
  const yearEnd = amsterdamToUtc(year + 1, 1, 1);
  const milestones: Milestone[] = [];

  if (isPayroll) {
    // Uitzendkracht: ABU-fase, StiPP-pensioen, loonheffing — read-only status.
    const st = await getUitzendStatus(userId);
    if (st) {
      milestones.push({
        id: "abu",
        icon: "📈",
        title: t.abu.titel,
        status: st.nextContractReady ? "action" : "info",
        headline: t.abu.fase[st.phase] ?? st.phase,
        detail: vulIn(st.weeksWorked === 1 ? t.abu.detailEen : t.abu.detailMeer, { fase: t.abu.faseVolledig[st.phase] ?? st.phase, weken: st.weeksWorked, uren: st.hoursWorked }),
        impact: st.phase === "A" ? t.abu.impactA : st.phase === "B" ? t.abu.impactB : t.abu.impactC,
        ...(st.nextContractReady ? {} : { progress: { value: st.currentContractHours, max: st.nextContractAtHours, unit: "u", label: t.abu.voortgang } }),
      });
      milestones.push({
        id: "stipp",
        icon: "🏦",
        title: t.stipp.titel,
        status: st.stipp === "geen" ? "info" : "ok",
        headline: t.stipp.kop[st.stipp] ?? st.stipp,
        detail:
          st.stipp === "geen"
            ? vulIn(st.weeksToStippBasis === 1 ? t.stipp.geenEen : t.stipp.geenMeer, { n: st.weeksToStippBasis })
            : st.stipp === "basis"
              ? vulIn(t.stipp.basis, { n: st.weeksToStippPlus })
              : t.stipp.plus,
        impact: t.stipp.impact,
      });
    }
    milestones.push({
      id: "loonheffing",
      icon: "🧾",
      title: t.belasting.titel,
      status: "ok",
      headline: t.belasting.kop,
      detail: t.belasting.detail,
    });
    return { workerKind: fiscal.workerKind, fiscalComplete: Boolean(fiscal.workerKind), generatedAt: now.toISOString(), milestones };
  }

  // zzp / flexwerker: uren, facturen en btw uit de echte data van dit jaar.
  const [timesheets, lastYear, invoices] = await Promise.all([
    prisma.timesheet.findMany({
      where: { freelancerId: profile.id, status: { in: ["APPROVED", "PAID"] }, scheduledStart: { gte: yearStart, lt: yearEnd } },
      select: { billableMinutes: true },
    }),
    // Voor de spreiding: de afgelopen 12 maanden, zoals de DBA-bewaking (ROLLING_WINDOW_DAYS).
    prisma.timesheet.findMany({
      where: { freelancerId: profile.id, status: { in: ["APPROVED", "PAID"] }, scheduledStart: { gte: new Date(now.getTime() - 365 * 864e5), lte: now } },
      select: { billableMinutes: true, hourlyRateCents: true, branch: { select: { tenantId: true, tenant: { select: { name: true } } } } },
    }),
    prisma.invoice.findMany({
      where: { issuerFreelancerId: profile.id, type: "SELF_BILL_FREELANCER", status: { in: ["ISSUED", "PAID"] }, createdAt: { gte: yearStart, lt: yearEnd } },
      select: { subtotalCents: true, vatCents: true, createdAt: true },
    }),
  ]);

  const hoursThisYear = Math.round((timesheets.reduce((s, t) => s + t.billableMinutes, 0) / 60) * 10) / 10;
  const omzetCents = invoices.reduce((s, i) => s + i.subtotalCents, 0);
  const quarterVatCents = invoices
    .filter((i) => amsterdamYearQuarter(i.createdAt).quarter === quarter)
    .reduce((s, i) => s + i.vatCents, 0);

  // 1) Urencriterium 1225u → zelfstandigenaftrek
  const fractionElapsed = Math.max(0.02, (now.getTime() - yearStart.getTime()) / (yearEnd.getTime() - yearStart.getTime()));
  const projected = Math.round(hoursThisYear / fractionElapsed);
  const reached = hoursThisYear >= URENCRITERIUM_HOURS;
  milestones.push({
    id: "urencriterium",
    icon: "⏱️",
    title: t.uren.titel,
    status: reached ? "ok" : projected >= URENCRITERIUM_HOURS ? "info" : "action",
    headline: vulIn(t.uren.kop, { uren: hoursThisYear, max: URENCRITERIUM_HOURS }),
    detail: reached ? t.uren.gehaald : vulIn(projected >= URENCRITERIUM_HOURS ? t.uren.opSchema : t.uren.onder, { uren: projected.toLocaleString(t.intl) }),
    progress: { value: Math.min(hoursThisYear, URENCRITERIUM_HOURS), max: URENCRITERIUM_HOURS, unit: "u", label: t.uren.voortgang },
    impact: vulIn(reached ? t.uren.impactGehaald : t.uren.impactNiet, { bedrag: euro(ZELFSTANDIGENAFTREK_CENTS) }),
  });

  // 1b) Spreiding over opdrachtgevers (Wet DBA)
  const perClient = new Map<string, ClientWork>();
  for (const t of lastYear) {
    const w = perClient.get(t.branch.tenantId) ?? { tenantId: t.branch.tenantId, name: t.branch.tenant.name, minutes: 0, grossCents: 0 };
    w.minutes += t.billableMinutes;
    w.grossCents += Math.round((t.billableMinutes / 60) * t.hourlyRateCents);
    perClient.set(t.branch.tenantId, w);
  }
  milestones.push(spreadMilestone([...perClient.values()], env.DBA_MAX_CLIENT_REVENUE_SHARE, t));

  // 2) KOR-omzetgrens € 20.000
  const korPct = Math.min(100, Math.round((omzetCents / KOR_LIMIT_CENTS) * 100));
  if (fiscal.korApplies) {
    const near = omzetCents >= KOR_LIMIT_CENTS * 0.85;
    const over = omzetCents >= KOR_LIMIT_CENTS;
    milestones.push({
      id: "kor",
      icon: "📊",
      title: t.kor.titel,
      status: over ? "action" : near ? "soon" : "ok",
      headline: vulIn(t.kor.kop, { omzet: euro(omzetCents), grens: euro(KOR_LIMIT_CENTS) }),
      detail: over ? t.kor.over : near ? t.kor.bijna : t.kor.ruim,
      progress: { value: Math.min(omzetCents, KOR_LIMIT_CENTS), max: KOR_LIMIT_CENTS, unit: "", label: t.kor.voortgang },
      impact: t.kor.impact,
    });
  } else if (fiscal.vatValid) {
    // btw-plichtig: toon btw-aangifte van het lopende kwartaal + deadline
    const dl = btwDeadline(year, quarter);
    const daysLeft = Math.ceil((dl.getTime() - now.getTime()) / 86_400_000);
    milestones.push({
      id: "btw",
      icon: "🧾",
      title: vulIn(t.btw.titel, { q: quarter }),
      status: daysLeft <= 14 ? "action" : daysLeft <= 30 ? "soon" : "info",
      headline: quarterVatCents > 0 ? vulIn(t.btw.kopBedrag, { bedrag: euro(quarterVatCents) }) : t.btw.kopGeen,
      detail: vulIn(daysLeft < 0 ? t.btw.detailVoorbij : daysLeft === 1 ? t.btw.detailEen : t.btw.detailMeer, { q: quarter, range: t.kwartalen[quarter - 1] ?? "", datum: datum(dl), n: daysLeft }),
      deadline: dl.toISOString(),
      impact: t.btw.impact,
    });
  }

  return {
    workerKind: fiscal.workerKind,
    fiscalComplete: Boolean(fiscal.workerKind),
    generatedAt: now.toISOString(),
    milestones,
  };
}
