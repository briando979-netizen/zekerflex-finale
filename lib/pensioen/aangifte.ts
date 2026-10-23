import { env } from "@/lib/env";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { getRun, listRuns, type PayslipRecord } from "@/lib/payroll/store";
import { parseIsoWeekId, isoWeekRange } from "@/lib/payroll/week";
import { getFiscal } from "@/lib/fiscal/store";

// ---------------------------------------------------------------------------
// StiPP-pensioenaangifte (UPA) voor de uitzendtak.
//
// Uitzendbureaus moeten per aangiftetijdvak (hier: kalendermaand) de
// pensioengegevens van hun uitzendkrachten aan de pensioenuitvoerder (StiPP)
// leveren: pensioengevend loon, uren, regeling (basis/plus) en de premies.
// Die cijfers zijn al per week berekend in de loonstroken (lib/payroll) — deze
// module aggregeert ze per tijdvak tot één aangifte, markeert ontbrekende
// gegevens (BSN!) en levert de dataset aan via lib/pensioen/delivery.ts.
//
// De premies worden NIET hier opnieuw berekend; ze komen rechtstreeks uit de
// vastgestelde loonstroken, zodat aangifte en loonstrook altijd kloppen.
// De ruwe BSN wordt bewust niet bewaard (alleen hash + laatste 4), dus de
// aangifte draagt "BSN op dossier (….)"; de ruwe BSN wordt pas bij de echte
// aansluiting/transmissie met de uitvoerder gekoppeld.
// ---------------------------------------------------------------------------

export type AangifteStatus = "concept" | "geleverd" | "mislukt";

export interface PensioenAangifteLine {
  userId: string;
  freelancerId: string;
  naam: string;
  email: string | null;
  bsnOpDossier: boolean;
  bsnLaatste4: string | null;
  geboortedatum: string | null;
  regeling: "basis" | "plus";
  fase: "A" | "B" | "C";
  wekenGewerkt: number;
  uren: number;
  pensioengevendLoonCents: number;
  werknemerPremieCents: number;
  werkgeverPremieCents: number;
  totaalPremieCents: number;
  compleet: boolean;
  ontbreekt: string[];
}

export interface PensioenAangifte {
  period: string; // "2026-10"
  label: string; // "oktober 2026"
  uitvoerder: "StiPP";
  aansluitnummer: string | null;
  status: AangifteStatus;
  gegenereerdOp: string;
  geleverdOp: string | null;
  leveringDetail: string | null;
  bronWeken: string[];
  lines: PensioenAangifteLine[];
  totals: {
    werknemers: number;
    incompleet: number;
    uren: number;
    pensioengevendLoonCents: number;
    werknemerPremieCents: number;
    werkgeverPremieCents: number;
    totaalPremieCents: number;
  };
}

const MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

export function monthLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1] ?? "?"} ${y ?? ""}`.trim();
}

/** The aangifte-tijdvak (calendar month) a payroll week belongs to — by the week's midpoint. */
export function monthOfWeek(isoWeek: string): string | null {
  const w = parseIsoWeekId(isoWeek);
  if (!w) return null;
  const { start } = isoWeekRange(w);
  const mid = new Date(start.getTime() + 3.5 * 24 * 3600 * 1000);
  return `${mid.getUTCFullYear()}-${String(mid.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The previous calendar month relative to `now`, as "YYYY-MM". */
export function previousMonth(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const key = (period: string) => `pensioen-aangifte:${period}`;
const INDEX = "pensioen-aangifte:index";

/** Build (or rebuild) the StiPP aangifte for a month from the finalised payroll runs in it. */
export async function buildPensioenAangifte(period: string): Promise<PensioenAangifte> {
  const summaries = await listRuns(120);
  const weeksInMonth = summaries.filter((s) => s.status === "finalised" && monthOfWeek(s.isoWeek) === period).map((s) => s.isoWeek);

  // userId -> aggregate across the month
  const agg = new Map<
    string,
    { slip: PayslipRecord; uren: number; loon: number; pw: number; pg: number; weken: number; regeling: "basis" | "plus" }
  >();

  for (const isoWeek of weeksInMonth) {
    const run = await getRun(isoWeek);
    if (!run) continue;
    for (const slip of run.payslips) {
      const bd = slip.computed.breakdown;
      if (slip.workerKind !== "uitzendkracht" || bd.kind !== "payroll" || bd.pensionRegeling === "geen") continue;
      const cur = agg.get(slip.userId);
      const uren = slip.computed.totalHours;
      if (!cur) {
        agg.set(slip.userId, {
          slip,
          uren,
          loon: bd.grossCents,
          pw: bd.pensionEmployeeCents,
          pg: bd.pensionEmployerCents,
          weken: slip.weeksWorked,
          regeling: bd.pensionRegeling,
        });
      } else {
        cur.uren += uren;
        cur.loon += bd.grossCents;
        cur.pw += bd.pensionEmployeeCents;
        cur.pg += bd.pensionEmployerCents;
        // the regeling/phase at the end of the period wins (plus > basis)
        if (slip.weeksWorked >= cur.weken) {
          cur.weken = slip.weeksWorked;
          cur.regeling = bd.pensionRegeling;
          cur.slip = slip;
        }
      }
    }
  }

  const lines: PensioenAangifteLine[] = [];
  for (const a of agg.values()) {
    const fiscal = await getFiscal(a.slip.userId).catch(() => null);
    const ontbreekt: string[] = [];
    if (!fiscal?.bsnHash) ontbreekt.push("BSN");
    if (!fiscal?.birthDate) ontbreekt.push("geboortedatum");
    if (!a.slip.fiscalComplete) ontbreekt.push("fiscale gegevens");
    const bd = a.slip.computed.breakdown;
    lines.push({
      userId: a.slip.userId,
      freelancerId: a.slip.freelancerId,
      naam: a.slip.workerName,
      email: a.slip.workerEmail,
      bsnOpDossier: Boolean(fiscal?.bsnHash),
      bsnLaatste4: fiscal?.bsnLast4 ?? null,
      geboortedatum: fiscal?.birthDate ?? null,
      regeling: a.regeling,
      fase: bd.kind === "payroll" ? bd.phase : "A",
      wekenGewerkt: a.weken,
      uren: Math.round(a.uren * 100) / 100,
      pensioengevendLoonCents: a.loon,
      werknemerPremieCents: a.pw,
      werkgeverPremieCents: a.pg,
      totaalPremieCents: a.pw + a.pg,
      compleet: ontbreekt.length === 0,
      ontbreekt,
    });
  }
  lines.sort((x, y) => x.naam.localeCompare(y.naam));

  const totals = lines.reduce(
    (t, l) => ({
      werknemers: t.werknemers + 1,
      incompleet: t.incompleet + (l.compleet ? 0 : 1),
      uren: Math.round((t.uren + l.uren) * 100) / 100,
      pensioengevendLoonCents: t.pensioengevendLoonCents + l.pensioengevendLoonCents,
      werknemerPremieCents: t.werknemerPremieCents + l.werknemerPremieCents,
      werkgeverPremieCents: t.werkgeverPremieCents + l.werkgeverPremieCents,
      totaalPremieCents: t.totaalPremieCents + l.totaalPremieCents,
    }),
    { werknemers: 0, incompleet: 0, uren: 0, pensioengevendLoonCents: 0, werknemerPremieCents: 0, werkgeverPremieCents: 0, totaalPremieCents: 0 },
  );

  // keep the delivery status of a previously generated aangifte for this period
  const prev = await getPensioenAangifte(period);
  return {
    period,
    label: monthLabel(period),
    uitvoerder: "StiPP",
    aansluitnummer: env.STIPP_AANSLUITNUMMER ?? null,
    status: prev?.status === "geleverd" ? "geleverd" : "concept",
    gegenereerdOp: new Date().toISOString(),
    geleverdOp: prev?.geleverdOp ?? null,
    leveringDetail: prev?.leveringDetail ?? null,
    bronWeken: weeksInMonth,
    lines,
    totals,
  };
}

export async function savePensioenAangifte(a: PensioenAangifte): Promise<void> {
  await kvSet(key(a.period), a);
  const idx = new Set((await kvGet<string[]>(INDEX).catch(() => null)) ?? []);
  idx.add(a.period);
  await kvSet(INDEX, [...idx].sort().reverse());
}

export async function getPensioenAangifte(period: string): Promise<PensioenAangifte | null> {
  return kvGet<PensioenAangifte>(key(period)).catch(() => null);
}

export async function listPensioenPeriods(): Promise<string[]> {
  return (await kvGet<string[]>(INDEX).catch(() => null)) ?? [];
}
