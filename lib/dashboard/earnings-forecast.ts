import { prisma } from "@/lib/prisma";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { getTaxSettings } from "@/lib/bank/tax";
import { amsterdamParts, amsterdamStartOfMonth } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Loon-vooruitblik: een eerlijke projectie van de bruto verdiensten uit de
// werkagenda (uren × tarief van niet-geannuleerde diensten), gesplitst in
// "al gewerkt" en "nog gepland" voor deze maand, plus een trend over 6 maanden.
// Voor zzp/flex tonen we daarnaast een belasting-reservering als vuistregel
// (taxPct uit de bank-instellingen — zelfde als het Belasting-potje). Voor
// uitzendkrachten niet: daar wordt loonheffing al aan de bron ingehouden.
// Werkt zonder bankrekening; de reservering zelf loopt via het Belasting-potje.
// ---------------------------------------------------------------------------

export interface TrendPoint {
  ym: string; // "2026-10"
  label: string; // "okt"
  /** maand 0–11, zodat de pagina het label in de app-taal kan zetten */
  month0: number;
  cents: number;
}

export interface EarningsForecast {
  monthLabel: string;
  /** huidige maand (0–11) en jaar, voor een label in de app-taal */
  month0: number;
  year: number;
  workedCents: number; // diensten deze maand die al voorbij zijn
  plannedCents: number; // komende diensten deze maand
  expectedCents: number; // worked + planned
  isPayroll: boolean; // uitzendkracht → geen eigen belastingreservering
  taxPct: number;
  taxReserveCents: number; // vuistregel: taxPct% van expected (alleen zzp/flex)
  trend: TrendPoint[]; // 6 maanden incl. deze, bruto per maand
  upcomingCount: number;
}

const MONTHS_NL = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function shiftCents(startsAt: Date, endsAt: Date, breakMinutes: number, rateCents: number): number {
  const hours = (endsAt.getTime() - startsAt.getTime()) / 3_600_000 - breakMinutes / 60;
  if (!(hours > 0)) return 0;
  return Math.round(hours * rateCents);
}

export async function getEarningsForecast(userId: string, now = new Date()): Promise<EarningsForecast | null> {
  const profile = await prisma.freelancerProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return null;

  // Maanden zoals in Nederland: de server draait in UTC.
  const monthStart = amsterdamStartOfMonth(now);
  const monthEnd = amsterdamStartOfMonth(now, 1);
  const windowStart = amsterdamStartOfMonth(now, -5); // 6 maanden incl. deze
  const ym = (d: Date) => {
    const p = amsterdamParts(d);
    return { key: `${p.year}-${p.month - 1}`, year: p.year, month0: p.month - 1 };
  };
  const months = Array.from({ length: 6 }, (_, i) => ym(amsterdamStartOfMonth(now, i - 5)));

  const [assignments, fiscal, tax] = await Promise.all([
    prisma.shiftAssignment.findMany({
      where: {
        freelancerId: profile.id,
        cancelledAt: null,
        shift: { startsAt: { gte: windowStart, lt: monthEnd }, status: { notIn: ["CANCELLED"] } },
      },
      select: { shift: { select: { startsAt: true, endsAt: true, breakMinutes: true, hourlyRateCents: true } } },
    }),
    getFiscal(userId),
    getTaxSettings(userId),
  ]);

  // trend-buckets voor 6 maanden
  const buckets = new Map<string, number>(months.map((m) => [m.key, 0]));

  let workedCents = 0;
  let plannedCents = 0;
  let upcomingCount = 0;
  for (const a of assignments) {
    const s = a.shift;
    const cents = shiftCents(s.startsAt, s.endsAt, s.breakMinutes, s.hourlyRateCents);
    if (cents <= 0) continue;
    const key = ym(s.startsAt).key;
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + cents);
    if (s.startsAt >= monthStart && s.startsAt < monthEnd) {
      if (s.endsAt <= now) workedCents += cents;
      else {
        plannedCents += cents;
        upcomingCount += 1;
      }
    }
  }

  const trend: TrendPoint[] = months.map((m) => ({ ym: m.key, label: MONTHS_NL[m.month0]!, month0: m.month0, cents: buckets.get(m.key) ?? 0 }));

  const expectedCents = workedCents + plannedCents;
  const isPayroll = invoiceModeFor(fiscal) === "payroll";
  const taxReserveCents = isPayroll ? 0 : Math.round((expectedCents * tax.pct) / 100);

  return {
    monthLabel: `${MONTHS_NL[ym(now).month0]} ${ym(now).year}`,
    month0: ym(now).month0,
    year: ym(now).year,
    workedCents,
    plannedCents,
    expectedCents,
    isPayroll,
    taxPct: tax.pct,
    taxReserveCents,
    trend,
    upcomingCount,
  };
}
