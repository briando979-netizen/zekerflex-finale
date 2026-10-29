import { kvGet, kvSet } from "@/lib/storage/kv";
import { DEFAULT_CAPS, type PaymentCaps, type PaymentIntent } from "./intents";

// KV-opslag voor de betaalmotor (geen DB-migratie nodig; het is een kleine,
// mensgestuurde wachtrij). Caps + kill-switch staan ook in KV zodat je ze
// runtime kunt aanpassen.
const INTENTS_KEY = "agent-pay:intents";
const CAPS_KEY = "agent-pay:caps";
const MAX = 500;

export async function getCaps(): Promise<PaymentCaps> {
  try {
    const v = await kvGet<PaymentCaps>(CAPS_KEY);
    if (v && typeof v === "object") return { ...DEFAULT_CAPS, ...v };
  } catch {
    /* KV weg → veilige defaults (extern uit, geen killswitch) */
  }
  return DEFAULT_CAPS;
}

export async function setCaps(caps: PaymentCaps): Promise<void> {
  await kvSet(CAPS_KEY, caps);
}

export async function listIntents(): Promise<PaymentIntent[]> {
  try {
    const v = await kvGet<PaymentIntent[]>(INTENTS_KEY);
    if (Array.isArray(v)) return v;
  } catch {
    /* leeg */
  }
  return [];
}

export async function saveIntent(intent: PaymentIntent): Promise<void> {
  const all = await listIntents();
  const idx = all.findIndex((i) => i.id === intent.id);
  if (idx >= 0) all[idx] = intent;
  else all.unshift(intent);
  await kvSet(INTENTS_KEY, all.slice(0, MAX));
}

export async function getIntent(id: string): Promise<PaymentIntent | null> {
  return (await listIntents()).find((i) => i.id === id) ?? null;
}

/** Wat vandaag al daadwerkelijk is uitgevoerd (voor het dagplafond). */
export function spentTodayCents(intents: PaymentIntent[], now = new Date()): number {
  const day = now.toISOString().slice(0, 10);
  return intents
    .filter((i) => i.status === "EXECUTED" && (i.decidedAt ?? i.createdAt).slice(0, 10) === day)
    .reduce((n, i) => n + i.amountCents, 0);
}
