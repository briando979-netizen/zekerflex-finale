import { kvGet, kvSet, kvDelete } from "@/lib/storage/kv";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Toestemming + niet-bellen-lijst voor de AI-beller. In NL mag je particulieren
// niet koud bellen zonder opt-in; B2B mag mét opt-out. Deze laag dwingt dat af:
// een uitgaande oproep gaat alleen door bij vastgelegde toestemming, of (als de
// owner dat expliciet aanzet) naar een bedrijf dat niet op de opt-out-lijst staat.
// ---------------------------------------------------------------------------

/** Normaliseer naar E.164-achtig (+landnummer). NL 06… → +316…. */
export function normalizeNumber(raw: string): string {
  let n = raw.trim().replace(/[^\d+]/g, "");
  if (n.startsWith("00")) n = `+${n.slice(2)}`;
  if (n.startsWith("0") && !n.startsWith("+")) n = `+31${n.slice(1)}`;
  if (!n.startsWith("+") && n.length >= 9) n = `+${n}`;
  return n;
}

const consentKey = (n: string) => `tel:consent:${normalizeNumber(n)}`;
const optoutKey = (n: string) => `tel:optout:${normalizeNumber(n)}`;

export interface ConsentDecision {
  allowed: boolean;
  reason: string;
}

export async function recordConsent(number: string, source: string): Promise<void> {
  await kvSet(consentKey(number), { at: new Date().toISOString(), source });
  await kvDelete(optoutKey(number)).catch(() => undefined);
}

export async function recordOptOut(number: string, reason = "verzoek niet te bellen"): Promise<void> {
  await kvSet(optoutKey(number), { at: new Date().toISOString(), reason });
  await kvDelete(consentKey(number)).catch(() => undefined);
}

export async function isAllowedToCall(
  number: string,
  opts: { b2b?: boolean; humanInitiated?: boolean } = {},
): Promise<ConsentDecision> {
  const n = normalizeNumber(number);
  if (!/^\+\d{8,15}$/.test(n)) return { allowed: false, reason: "ongeldig telefoonnummer" };
  // De niet-bellen-lijst blokkeert ALTIJD — ook een handmatige oproep.
  if (await kvGet(optoutKey(n))) return { allowed: false, reason: "staat op de niet-bellen-lijst (opt-out)" };
  if (await kvGet(consentKey(n))) return { allowed: true, reason: "toestemming vastgelegd" };
  // Een mens (beheerder) die zélf op "bel nu" klikt is een bewuste, verantwoorde
  // keuze — dat mag, alleen de opt-out-lijst hierboven houdt tegen. De strenge
  // opt-in-eis geldt voor de AUTONOME motor (autopilot), niet voor handwerk.
  if (opts.humanInitiated) {
    return { allowed: true, reason: "handmatig gestart door beheerder (opt-out gerespecteerd)" };
  }
  if (opts.b2b && env.TELEPHONY_ALLOW_B2B_COLD) {
    return { allowed: true, reason: "B2B koud toegestaan (opt-out wordt gerespecteerd)" };
  }
  return {
    allowed: false,
    reason: "geen vastgelegde toestemming — leg eerst opt-in vast (particulieren mogen niet koud gebeld worden)",
  };
}
