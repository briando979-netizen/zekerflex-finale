// ---------------------------------------------------------------------------
// Spoedoproep (4 nov 2026): een opdrachtgever die vandaag of morgen nog iemand
// mist, stuurt één oproep naar geschikte krachten in de buurt: push in de app,
// en als het is ingericht ook sms (Twilio) of WhatsApp (eigen brug). De kracht
// antwoordt met "1" (ik neem aan) of "2" (nee); "1" plant meteen in via het
// gewone aannamepad (lib/matching/apply.ts), dus met alle controles.
// Dit bestand is puur (geen prisma/kv): de regels, los te testen.
// ---------------------------------------------------------------------------

export type Kanaal = "push" | "sms" | "whatsapp";
export const KANALEN: Kanaal[] = ["push", "sms", "whatsapp"];
export const STRALEN_KM = [10, 25, 50] as const;
export const MAX_ONTVANGERS = 40;
/** een oproep geldt tot de dienst begint, maar nooit langer dan dit */
export const MAX_GELDIG_MS = 12 * 3_600_000;
/** begon de dienst al (invaller gezocht), dan nog zo lang */
export const NA_START_MS = 2 * 3_600_000;

export interface SpoedOntvanger {
  userId: string;
  naam: string;
  km: number;
  via: Kanaal[];
  at: string;
  antwoord?: "ja" | "nee";
  antwoordAt?: string;
  /** wat er met een "ja" gebeurde: "ingepland" of de reden dat het niet lukte */
  uitkomst?: string;
}

export interface SpoedOproep {
  shiftId: string;
  tenantId: string;
  gestartDoor: string;
  at: string;
  verloopt: string;
  radiusKm: number;
  kanalen: Kanaal[];
  ontvangers: SpoedOntvanger[];
  gestopt?: string;
}

/** Wat er op het wachtlijstje van een kracht staat: de oproepen waar "1" of "2" over kan gaan. */
export interface SpoedWacht {
  items: { shiftId: string; tot: string }[];
}

/**
 * Een telefoonnummer naar +31…-vorm. Nederlands als er geen landcode is
 * ("06 12 34 56 78" → "+31612345678"); "0031…" en "+…" blijven hun land.
 */
export function normaliseerTelefoon(s: string | null | undefined): string | null {
  if (!s) return null;
  let t = s.replace(/[\s().-]/g, "");
  if (t.startsWith("00")) t = `+${t.slice(2)}`;
  else if (t.startsWith("0")) t = `+31${t.slice(1)}`;
  else if (/^\d+$/.test(t)) t = `+${t}`;
  return /^\+[1-9]\d{8,14}$/.test(t) ? t : null;
}

/** De laatste negen cijfers: om een opgeslagen nummer in welke schrijfwijze ook terug te vinden. */
export function telefoonStaart(s: string): string {
  return s.replace(/\D/g, "").slice(-9);
}

/** Wat een antwoord per sms/WhatsApp betekent, in de talen van de app. */
export function leesAntwoord(tekst: string): "ja" | "nee" | "stop" | null {
  const t = tekst.trim().toLowerCase().replace(/[.!…]+$/g, "");
  if (/^(stop|stoppen|afmelden|uitschrijven|unsubscribe)$/.test(t)) return "stop";
  if (/^(1|ja|yes|y|ok|oké|okay|tak|da|так|ja graag|ik kom|i'm in|accept)$/.test(t)) return "ja";
  if (/^(2|nee|no|n|nie|nu|ні|niet|helaas|kan niet|decline)$/.test(t)) return "nee";
  return null;
}

/** Tot wanneer een oproep open staat: tot de start (max 12 uur), of nog 2 uur als de dienst al loopt. */
export function verlooptOp(start: Date, nu: Date): Date {
  const totStart = start.getTime() - nu.getTime();
  if (totStart <= 0) return new Date(nu.getTime() + NA_START_MS);
  return new Date(nu.getTime() + Math.min(totStart, MAX_GELDIG_MS));
}

export function isOpen(o: SpoedOproep, nu = new Date()): boolean {
  return !o.gestopt && Date.parse(o.verloopt) > nu.getTime();
}

/** Welke oproep een "1" bedoelt: de jongste die nog open staat. */
export function kiesWachtende(w: SpoedWacht | null, nu = new Date()): string | null {
  if (!w) return null;
  const open = w.items.filter((i) => Date.parse(i.tot) > nu.getTime());
  return open.length ? open[open.length - 1]!.shiftId : null;
}

/** Het wachtlijstje bijwerken: één regel per dienst, verlopen regels eruit. */
export function voegWachtToe(w: SpoedWacht | null, shiftId: string, tot: string, nu = new Date()): SpoedWacht {
  const items = (w?.items ?? []).filter((i) => i.shiftId !== shiftId && Date.parse(i.tot) > nu.getTime());
  return { items: [...items, { shiftId, tot }] };
}

export function telling(o: SpoedOproep): { verstuurd: number; ja: number; nee: number; open: number; ingepland: number } {
  const ja = o.ontvangers.filter((x) => x.antwoord === "ja").length;
  const nee = o.ontvangers.filter((x) => x.antwoord === "nee").length;
  const ingepland = o.ontvangers.filter((x) => x.uitkomst === "ingepland").length;
  return { verstuurd: o.ontvangers.length, ja, nee, open: o.ontvangers.length - ja - nee, ingepland };
}

/** Kies de dichtstbijzijnde krachten die nog niet eerder zijn benaderd voor deze oproep. */
export function kiesOntvangers<T extends { userId: string; km: number }>(kandidaten: T[], alBereikt: Set<string>, radiusKm: number, max = MAX_ONTVANGERS): T[] {
  return kandidaten
    .filter((k) => k.km <= radiusKm && !alBereikt.has(k.userId))
    .sort((a, b) => a.km - b.km)
    .slice(0, max);
}
