import { publicOpenShifts } from "@/lib/public-shifts";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Staan er echte klussen open? (22 nov 2026, gebruikersonderzoek punt 2: de tip "Er wachten klussen op je" verscheen terwijl
// alle open klussen testklussen waren.) De bezoekerstip (components/marketing/VisitorNudge.tsx) belooft alleen klussen als er
// minstens één openbare, toekomstige klus van een echt bedrijf is (publicOpenShifts laat testklussen weg). We weten niet waar
// een bezoeker woont, dus "in de buurt" is hier: ergens in Nederland. Eén telling per 5 minuten voor de hele server (via
// globalThis: Next bundelt routes apart). Een storing telt als "geen": dan liever de eerlijke tekst dan een lege belofte.
// ---------------------------------------------------------------------------

const VERS_MS = 5 * 60_000;

type Stand = { echt: boolean; op: number };
const g = globalThis as typeof globalThis & { __zfEchteKlussen?: Stand };

export async function echteKlussenOpen(nu: number = Date.now()): Promise<boolean> {
  const vorige = g.__zfEchteKlussen;
  if (vorige && nu - vorige.op < VERS_MS) return vorige.echt;
  let echt = false;
  try {
    echt = (await publicOpenShifts({ take: 1 })).length > 0;
  } catch (err) {
    logger.warn("echte klussen tellen mislukt", { error: (err as Error).message });
  }
  g.__zfEchteKlussen = { echt, op: nu };
  return echt;
}
