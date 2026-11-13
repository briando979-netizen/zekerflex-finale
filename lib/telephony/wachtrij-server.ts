import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { placeTwilioCall, twilioConfigured } from "@/lib/telephony/twilio";
import { zonderNummers } from "@/lib/telephony/log-nummer";

// ---------------------------------------------------------------------------
// De telefoon van de medewerker laten overgaan voor de beller die vooraan in de wachtrij staat (13 nov 2026). Er is één
// doorschakelnummer (TELEPHONY_FORWARD_NUMBER), dus hooguit één oproep tegelijk: de stand staat in de KV (niet per
// gebruiker, dus geen AVG-voorvoegsel). Gaat hij al over, of spreekt hij een beller, dan niet nog eens.
// ---------------------------------------------------------------------------

const SLEUTEL = "telefoon:medewerker";
/** Zo lang telt "gaat over" (Twilio laat ±30 s overgaan); daarna mag het opnieuw. */
export const BELT_MS = 45_000;
/** Zo lang telt "in gesprek" hooguit, als het einde van het gesprek nooit binnenkomt. */
export const BEZET_MS = 30 * 60_000;

interface Stand {
  at: number;
  bezet?: boolean;
}

/** Gaat de telefoon van de medewerker nu over, of spreekt hij een beller? Een storing telt als ja (geen reeks oproepen). */
export async function medewerkerBezig(nu = Date.now()): Promise<boolean> {
  try {
    const s = await kvGet<Stand>(SLEUTEL);
    if (!s || typeof s.at !== "number" || s.at <= 0) return false;
    return nu - s.at < (s.bezet ? BEZET_MS : BELT_MS);
  } catch {
    return true;
  }
}

export async function zetMedewerker(stand: "belt" | "bezet" | "vrij", nu = Date.now()): Promise<void> {
  await kvSet(SLEUTEL, stand === "vrij" ? { at: 0 } : { at: nu, ...(stand === "bezet" ? { bezet: true } : {}) }).catch(() => undefined);
}

/** Laat de telefoon van de medewerker overgaan (zonder opname); hij neemt aan met toets 1. Zonder Twilio of nummer: niets. */
export async function belMedewerker(base: string, callId: string, nu = Date.now()): Promise<boolean> {
  const nummer = env.TELEPHONY_FORWARD_NUMBER;
  if (!nummer || !twilioConfigured()) return false;
  await zetMedewerker("belt", nu);
  try {
    await placeTwilioCall({
      to: nummer,
      voiceUrl: `${base}/api/telephony/wachtrij/medewerker?callId=${callId}`,
      statusUrl: `${base}/api/telephony/wachtrij/medewerker?callId=${callId}&stap=status`,
      opnemen: false,
    });
    return true;
  } catch (err) {
    logger.warn("wachtrij: medewerker bellen mislukt", { error: zonderNummers((err as Error).message).slice(0, 160) });
    await zetMedewerker("vrij");
    return false;
  }
}
