import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Door de eigenaar instelbare tarieven voor het Financiën-overzicht. Bewust
// configureerbaar i.p.v. hardcoded: btw/belasting/kosten zijn indicatief en
// moeten door de boekhouder bevestigd worden. Postgres-backed (KeyValueStore).
// ---------------------------------------------------------------------------

export interface FinanceSettings {
  /** geschatte Stripe-/betaalkosten als fractie van de bruto doorstroom (bijv. 0.015 = 1,5%) */
  stripeFeePct: number;
  /** aftrekbare voorbelasting als fractie van je kosten (bijv. 0.21) */
  vatInputPct: number;
  /** vaste maandlasten in centen (hosting, tools, abonnementen, …) */
  operationalMonthlyCents: number;
  /** reservering voor inkomsten-/vennootschapsbelasting als fractie van de winst */
  taxReservePct: number;
  /** override voor de uitzendopslag-fractie; null = het platform-tarief (env) */
  uitzendMarkupRate: number | null;
}

export const DEFAULT_FINANCE: FinanceSettings = {
  stripeFeePct: 0.015,
  vatInputPct: 0.21,
  operationalMonthlyCents: 0,
  taxReservePct: 0.2,
  uitzendMarkupRate: null,
};

const KEY = "admin:finance-settings";

export async function getFinanceSettings(): Promise<FinanceSettings> {
  const raw = await kvGet<Partial<FinanceSettings>>(KEY).catch(() => null);
  return { ...DEFAULT_FINANCE, ...(raw ?? {}) };
}

export async function setFinanceSettings(patch: Partial<FinanceSettings>): Promise<FinanceSettings> {
  const next = { ...(await getFinanceSettings()), ...patch };
  // sane bounds
  next.stripeFeePct = clamp(next.stripeFeePct, 0, 0.2);
  next.vatInputPct = clamp(next.vatInputPct, 0, 1);
  next.taxReservePct = clamp(next.taxReservePct, 0, 0.6);
  next.operationalMonthlyCents = Math.max(0, Math.round(next.operationalMonthlyCents));
  if (next.uitzendMarkupRate !== null) next.uitzendMarkupRate = clamp(next.uitzendMarkupRate, 0, 2);
  await kvSet(KEY, next);
  return next;
}

function clamp(n: number, lo: number, hi: number): number {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}
