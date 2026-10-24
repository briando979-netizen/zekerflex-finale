import { prisma } from "@/lib/prisma";
import { getFiscal, invoiceModeFor, type WorkerKind } from "@/lib/fiscal/store";
import { getUitzendStatus } from "@/lib/payroll/uitzend-status";

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

const euro = (cents: number) => `€ ${Math.round(cents / 100).toLocaleString("nl-NL")}`;
const dateNl = (d: Date) => d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
const QUARTER_RANGE = ["jan–mrt", "apr–jun", "jul–sep", "okt–dec"];

/** Laatste dag van de maand ná het kwartaaleinde = btw-aangiftedeadline. */
function btwDeadline(year: number, quarter: number): Date {
  return new Date(year, quarter * 3 + 1, 0);
}

export async function getWorkerMilestones(userId: string, now = new Date()): Promise<WorkerMilestones | null> {
  const profile = await prisma.freelancerProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return null;

  const fiscal = await getFiscal(userId);
  const isPayroll = invoiceModeFor(fiscal) === "payroll";
  const year = now.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  const milestones: Milestone[] = [];

  if (isPayroll) {
    // Uitzendkracht: ABU-fase, StiPP-pensioen, loonheffing — read-only status.
    const st = await getUitzendStatus(userId);
    if (st) {
      milestones.push({
        id: "abu",
        icon: "📈",
        title: "Je ABU-fase",
        status: st.nextContractReady ? "action" : "info",
        headline: st.phaseLabel.split(" — ")[0] ?? st.phase,
        detail: `${st.phaseLabel}. Je hebt ${st.weeksWorked} ${st.weeksWorked === 1 ? "week" : "weken"} en ${st.hoursWorked} uur gewerkt via ZekerFlex.`,
        impact:
          st.phase === "A"
            ? "In fase A kun je per opdracht stoppen. Hoe meer weken je werkt, hoe meer zekerheid je opbouwt: na 52 weken ga je naar fase B met tijdelijke contracten."
            : st.phase === "B"
              ? "In fase B krijg je tijdelijke contracten — meer zekerheid dan fase A. Na fase B volgt fase C: een vast contract."
              : "Fase C: je hebt recht op een contract voor onbepaalde tijd. Maximale zekerheid.",
        ...(st.nextContractReady ? {} : { progress: { value: st.currentContractHours, max: st.nextContractAtHours, unit: "u", label: "naar je volgende contractblok" } }),
      });
      milestones.push({
        id: "stipp",
        icon: "🏦",
        title: "StiPP-pensioen",
        status: st.stipp === "geen" ? "info" : "ok",
        headline: st.stippLabel.split(" —")[0] ?? st.stipp,
        detail:
          st.stipp === "geen"
            ? `Pensioenopbouw start automatisch in week 9. Nog ${st.weeksToStippBasis} ${st.weeksToStippBasis === 1 ? "week" : "weken"} te gaan.`
            : st.stipp === "basis"
              ? `Je bouwt pensioen op in de basisregeling. Na week 78 ga je naar de plusregeling (werkgeversbijdrage) — nog ${st.weeksToStippPlus} weken.`
              : "Je zit in de plusregeling: volledige opbouw met werkgeversbijdrage.",
        impact: "Je hoeft hier niets voor te doen — ZekerFlex regelt de aanmelding en afdracht via StiPP automatisch.",
      });
    }
    milestones.push({
      id: "loonheffing",
      icon: "🧾",
      title: "Belasting",
      status: "ok",
      headline: "Automatisch geregeld",
      detail: "Als uitzendkracht wordt de loonheffing al op je loon ingehouden en door ZekerFlex afgedragen. Je hoeft zelf geen btw- of inkomstenbelastingaangifte voor dit werk te doen.",
    });
    return { workerKind: fiscal.workerKind, fiscalComplete: Boolean(fiscal.workerKind), generatedAt: now.toISOString(), milestones };
  }

  // zzp / flexwerker: uren, facturen en btw uit de echte data van dit jaar.
  const [timesheets, invoices] = await Promise.all([
    prisma.timesheet.findMany({
      where: { freelancerId: profile.id, status: { in: ["APPROVED", "PAID"] }, scheduledStart: { gte: yearStart, lt: yearEnd } },
      select: { billableMinutes: true },
    }),
    prisma.invoice.findMany({
      where: { issuerFreelancerId: profile.id, type: "SELF_BILL_FREELANCER", status: { in: ["ISSUED", "PAID"] }, createdAt: { gte: yearStart, lt: yearEnd } },
      select: { subtotalCents: true, vatCents: true, createdAt: true },
    }),
  ]);

  const hoursThisYear = Math.round((timesheets.reduce((s, t) => s + t.billableMinutes, 0) / 60) * 10) / 10;
  const omzetCents = invoices.reduce((s, i) => s + i.subtotalCents, 0);
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  const quarterVatCents = invoices
    .filter((i) => Math.floor(i.createdAt.getMonth() / 3) + 1 === quarter)
    .reduce((s, i) => s + i.vatCents, 0);

  // 1) Urencriterium 1225u → zelfstandigenaftrek
  const fractionElapsed = Math.max(0.02, (now.getTime() - yearStart.getTime()) / (yearEnd.getTime() - yearStart.getTime()));
  const projected = Math.round(hoursThisYear / fractionElapsed);
  const reached = hoursThisYear >= URENCRITERIUM_HOURS;
  milestones.push({
    id: "urencriterium",
    icon: "⏱️",
    title: "Urencriterium (1.225 uur)",
    status: reached ? "ok" : projected >= URENCRITERIUM_HOURS ? "info" : "action",
    headline: `${hoursThisYear} / ${URENCRITERIUM_HOURS} uur`,
    detail: reached
      ? "Je hebt de 1.225 uur dit jaar gehaald."
      : `Op dit tempo kom je rond ${projected.toLocaleString("nl-NL")} uur uit dit jaar${projected >= URENCRITERIUM_HOURS ? " — je ligt op schema." : " — dat is nog onder de grens."}`,
    progress: { value: Math.min(hoursThisYear, URENCRITERIUM_HOURS), max: URENCRITERIUM_HOURS, unit: "u", label: "gewerkt dit jaar (goedgekeurd)" },
    impact: reached
      ? `Je komt in aanmerking voor de zelfstandigenaftrek (± ${euro(ZELFSTANDIGENAFTREK_CENTS)} aftrek, indicatief) plus de MKB-winstvrijstelling — samen al snel enkele honderden euro's minder belasting.`
      : `Haal je de 1.225 uur, dan krijg je recht op de zelfstandigenaftrek (± ${euro(ZELFSTANDIGENAFTREK_CENTS)} aftrek, indicatief) en de MKB-winstvrijstelling. Alleen ZekerFlex-uren tellen hier mee; uren bij andere opdrachtgevers komen daar nog bij.`,
  });

  // 2) KOR-omzetgrens € 20.000
  const korPct = Math.min(100, Math.round((omzetCents / KOR_LIMIT_CENTS) * 100));
  if (fiscal.korApplies) {
    const near = omzetCents >= KOR_LIMIT_CENTS * 0.85;
    const over = omzetCents >= KOR_LIMIT_CENTS;
    milestones.push({
      id: "kor",
      icon: "📊",
      title: "KOR-omzetgrens (€ 20.000)",
      status: over ? "action" : near ? "soon" : "ok",
      headline: `${euro(omzetCents)} / ${euro(KOR_LIMIT_CENTS)}`,
      detail: over
        ? "Je zit boven de KOR-grens van dit jaar. Je valt uit de kleineondernemersregeling en moet btw gaan rekenen en aangifte doen — meld je af bij de Belastingdienst."
        : near
          ? "Je nadert de KOR-grens. Kom je erboven, dan verval je uit de regeling en ga je btw rekenen."
          : "Je blijft ruim onder de KOR-grens — je hoeft geen btw te rekenen of aan te geven.",
      progress: { value: Math.min(omzetCents, KOR_LIMIT_CENTS), max: KOR_LIMIT_CENTS, unit: "", label: "omzet dit jaar (ZekerFlex)" },
      impact:
        "Boven de grens reken je 21% btw. Je zakelijke klanten kunnen die btw aftrekken, dus voor hén verandert er netto weinig — maar jij moet voortaan btw-aangifte doen (en mag je eigen zakelijke btw aftrekken).",
    });
  } else if (fiscal.vatValid) {
    // btw-plichtig: toon btw-aangifte van het lopende kwartaal + deadline
    const dl = btwDeadline(year, quarter);
    const daysLeft = Math.ceil((dl.getTime() - now.getTime()) / 86_400_000);
    milestones.push({
      id: "btw",
      icon: "🧾",
      title: `Btw-aangifte Q${quarter}`,
      status: daysLeft <= 14 ? "action" : daysLeft <= 30 ? "soon" : "info",
      headline: quarterVatCents > 0 ? `± ${euro(quarterVatCents)} te betalen` : "Nog geen btw dit kwartaal",
      detail: `Je btw over Q${quarter} (${QUARTER_RANGE[quarter - 1]}) geef je aan bij de Belastingdienst vóór ${dateNl(dl)}${daysLeft >= 0 ? ` — nog ${daysLeft} ${daysLeft === 1 ? "dag" : "dagen"}.` : "."} Bedrag geschat uit je self-billing-facturen.`,
      deadline: dl.toISOString(),
      impact: "Zet dit bedrag opzij in je Belasting-potje zodat je niet voor verrassingen komt te staan. ZekerFlex berekent de btw per factuur al voor je.",
    });
  }

  return {
    workerKind: fiscal.workerKind,
    fiscalComplete: Boolean(fiscal.workerKind),
    generatedAt: now.toISOString(),
    milestones,
  };
}
