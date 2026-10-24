import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Regels voor Stripe Issuing-kaarten: globale standaard + per-kaart override.
// Bepaalt wat het autorisatie-webhook goedkeurt of weigert. Postgres-backed KV.
// ---------------------------------------------------------------------------

export interface IssuingRules {
  perTxLimitCents: number; // max per transactie
  dailyBudgetCents: number; // max per dag per kaart
  weeklyBudgetCents: number; // max per week per kaart
  blockedMccs: string[]; // geblokkeerde categorieën (merchant category codes)
  allowedCountries: string[]; // toegestane landen (ISO-2); leeg = alle
  aiCheck: boolean; // extra AI-risicocheck aanzetten
}

export const DEFAULT_RULES: IssuingRules = {
  perTxLimitCents: 50_000, // € 500
  dailyBudgetCents: 100_000, // € 1.000
  weeklyBudgetCents: 300_000, // € 3.000
  blockedMccs: [],
  allowedCountries: [],
  aiCheck: false,
};

const GLOBAL_KEY = "issuing:rules";
const cardKey = (cardId: string) => `issuing:rules:card:${cardId}`;

export async function getGlobalRules(): Promise<IssuingRules> {
  return { ...DEFAULT_RULES, ...((await kvGet<Partial<IssuingRules>>(GLOBAL_KEY).catch(() => null)) ?? {}) };
}

export async function setGlobalRules(patch: Partial<IssuingRules>): Promise<IssuingRules> {
  const next = { ...(await getGlobalRules()), ...patch };
  await kvSet(GLOBAL_KEY, next);
  return next;
}

/** Effectieve regels voor één kaart = globale regels met de kaart-override erover. */
export async function getCardRules(cardId: string): Promise<IssuingRules> {
  const global = await getGlobalRules();
  const override = (await kvGet<Partial<IssuingRules>>(cardKey(cardId)).catch(() => null)) ?? {};
  return { ...global, ...override };
}

export async function setCardRules(cardId: string, patch: Partial<IssuingRules>): Promise<void> {
  const current = (await kvGet<Partial<IssuingRules>>(cardKey(cardId)).catch(() => null)) ?? {};
  await kvSet(cardKey(cardId), { ...current, ...patch });
}
