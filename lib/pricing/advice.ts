import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { shiftCategory } from "@/lib/shifts/category";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Tarief-advies & vraagvoorspelling.
//
// Schat op basis van de EIGEN historie (laatste 180 dagen) hoe groot de kans is
// dat een klus met de gekozen parameters (tijd, dag, soort werk, tarief) op
// tijd vol raakt, en adviseert een tarief dat die kans naar een doel tilt.
// Transparant en eerlijk: een schatting met redenen, geen belofte. Volledig
// heuristisch op bestaande data — geen extern model nodig; de AI wordt alleen
// gebruikt om de uitleg in één zin te formuleren (optioneel).
// ---------------------------------------------------------------------------

export interface MarketStats {
  /** mediaan uurtarief (cents) per categorie-key van vervulde klussen */
  medianByCategory: Record<string, number>;
  /** basis-vervullingsgraad per categorie (0..1) */
  fillByCategory: Record<string, number>;
  overallMedian: number;
  overallFill: number;
  sample: number;
  computedAt: string;
}

const STATS_KEY = "pricing:market-stats";
const STATS_TTL_MS = 6 * 60 * 60 * 1000;
const DAY = 86_400_000;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}

export async function marketStats(force = false): Promise<MarketStats> {
  if (!force) {
    const cached = await kvGet<MarketStats>(STATS_KEY).catch(() => null);
    if (cached && Date.now() - new Date(cached.computedAt).getTime() < STATS_TTL_MS) return cached;
  }
  const since = new Date(Date.now() - 180 * DAY);
  const shifts = await prisma.shift.findMany({
    where: { startsAt: { gte: since, lt: new Date() } },
    select: { title: true, hourlyRateCents: true, positions: true, requiredSkill: { select: { name: true } }, assignments: { where: { cancelledAt: null }, select: { id: true } } },
    take: 10_000,
  });

  const rateByCat: Record<string, number[]> = {};
  const fillByCat: Record<string, { filled: number; total: number }> = {};
  const allRates: number[] = [];
  let allFilled = 0;
  for (const s of shifts) {
    const cat = shiftCategory(s.title, s.requiredSkill?.name ?? null).key;
    const filled = s.assignments.length >= s.positions;
    (rateByCat[cat] ??= []).push(s.hourlyRateCents);
    const f = (fillByCat[cat] ??= { filled: 0, total: 0 });
    f.total += 1;
    if (filled) {
      f.filled += 1;
      allFilled += 1;
    }
    allRates.push(s.hourlyRateCents);
  }

  const medianByCategory: Record<string, number> = {};
  const fillByCategory: Record<string, number> = {};
  for (const [k, v] of Object.entries(rateByCat)) medianByCategory[k] = median(v);
  for (const [k, v] of Object.entries(fillByCat)) fillByCategory[k] = v.total ? v.filled / v.total : 0;

  const stats: MarketStats = {
    medianByCategory,
    fillByCategory,
    overallMedian: median(allRates),
    overallFill: shifts.length ? allFilled / shifts.length : 0,
    sample: shifts.length,
    computedAt: new Date().toISOString(),
  };
  await kvSet(STATS_KEY, stats).catch(() => undefined);
  return stats;
}

export interface ForecastInput {
  title: string;
  skill?: string | null | undefined;
  startsAt: string | Date;
  rateCents: number;
  viaUitzend?: boolean | undefined;
}

export interface Forecast {
  marketRateCents: number;
  fillChance: number; // 0..1
  suggestedRateCents: number;
  suggestedFillChance: number;
  reasons: string[];
  sample: number;
}

/** Difficulty multiplier on fill: evenings/nights/weekends are harder to fill. */
function difficulty(d: Date): { factor: number; label: string | null } {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Europe/Amsterdam" }).format(d));
  const wd = d.getUTCDay(); // 0 Sun .. 6 Sat
  const weekend = wd === 0 || wd === 6;
  const evening = h >= 18 || h < 6;
  if (weekend && evening) return { factor: -0.22, label: "weekendavond is lastiger te vullen" };
  if (weekend) return { factor: -0.12, label: "weekend is lastiger te vullen" };
  if (evening) return { factor: -0.14, label: "avond/nacht is lastiger te vullen" };
  return { factor: 0, label: null };
}

/** Logistic map from (rate vs market, difficulty) to a 0..1 fill chance. */
function chance(rateCents: number, marketCents: number, diffFactor: number, baseFill: number): number {
  const rel = marketCents > 0 ? (rateCents - marketCents) / marketCents : 0; // +0.1 = 10% above market
  const base = Math.log(Math.max(0.02, Math.min(0.98, baseFill)) / (1 - Math.max(0.02, Math.min(0.98, baseFill))));
  const z = base + 6 * rel + 4 * diffFactor; // rate elasticity + difficulty
  return Math.max(0.02, Math.min(0.99, 1 / (1 + Math.exp(-z))));
}

export async function fillForecast(input: ForecastInput): Promise<Forecast> {
  const stats = await marketStats();
  const cat = shiftCategory(input.title, input.skill ?? null).key;
  const marketRateCents = stats.medianByCategory[cat] || stats.overallMedian || env.MIN_SHIFT_RATE_CENTS;
  const baseFill = stats.fillByCategory[cat] ?? stats.overallFill ?? 0.6;
  const d = new Date(input.startsAt);
  const diff = difficulty(d);

  const fillChance = chance(input.rateCents, marketRateCents, diff.factor, baseFill);

  // smallest rate (rounded to €0,25) that reaches the 85% target
  const target = 0.85;
  let suggested = input.rateCents;
  if (fillChance < target) {
    for (let r = Math.max(input.rateCents, marketRateCents); r <= marketRateCents * 1.6 + 100; r += 25) {
      if (chance(r, marketRateCents, diff.factor, baseFill) >= target) {
        suggested = r;
        break;
      }
      suggested = r;
    }
  }
  const suggestedFillChance = chance(suggested, marketRateCents, diff.factor, baseFill);

  const reasons: string[] = [];
  const relPct = Math.round(((input.rateCents - marketRateCents) / (marketRateCents || 1)) * 100);
  reasons.push(`Mediaan voor dit soort werk: € ${(marketRateCents / 100).toFixed(2).replace(".", ",")}/uur (jouw tarief ${relPct >= 0 ? "+" : ""}${relPct}%).`);
  if (diff.label) reasons.push(diff.label[0]!.toUpperCase() + diff.label.slice(1) + ".");
  if (suggested > input.rateCents) {
    reasons.push(`Met € ${(suggested / 100).toFixed(2).replace(".", ",")}/uur stijgt de kans naar ${Math.round(suggestedFillChance * 100)}%.`);
  }

  return {
    marketRateCents,
    fillChance: Math.round(fillChance * 100) / 100,
    suggestedRateCents: suggested,
    suggestedFillChance: Math.round(suggestedFillChance * 100) / 100,
    reasons,
    sample: stats.sample,
  };
}
