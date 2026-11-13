import { amsterdamDayKey } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// "Ken je een bedrijf dat mensen zoekt?" (werker-app) en de link die daaruit volgt: /klus-plaatsen?via=werker.
// Alleen de bron "werker" en een telling per maand: geen persoon, geen ref-code, geen bonus, geen gegevens van de werker in de
// link. Puur (geen prisma, kv of React), zodat de pagina, de route, de werker-app en de test hem delen.
// ---------------------------------------------------------------------------

export const VIA_WERKER = "werker";
export type KlusVia = typeof VIA_WERKER;
export type ViaStap = "bezoek" | "concept";

export interface ViaTelling {
  bezoek: number;
  concept: number;
}

/** De bron uit de querystring: alleen precies "werker" (hoofdletters en spaties tellen niet); al het andere is geen bron. */
export function leesVia(waarde: unknown): KlusVia | null {
  const w = Array.isArray(waarde) ? waarde[0] : waarde;
  return typeof w === "string" && w.trim().toLowerCase() === VIA_WERKER ? VIA_WERKER : null;
}

export function leesViaStap(waarde: unknown): ViaStap | null {
  return waarde === "bezoek" || waarde === "concept" ? waarde : null;
}

/** De link die de werker deelt: altijd dezelfde, zonder iets van de werker. */
export function tipLink(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/klus-plaatsen?via=${VIA_WERKER}`;
}

/** De KV-sleutel van de maandtelling (Amsterdamse maand), los van een gebruiker: geen persoonsgegeven. */
export const viaSleutel = (nu: Date) => `meting:klus-via:${amsterdamDayKey(nu).slice(0, 7)}`;

/** Een stap erbij tellen op een (mogelijk leeg of onvolledig) bewaard object. */
export function telViaStap(oud: Partial<ViaTelling> | null | undefined, stap: ViaStap): ViaTelling {
  const t: ViaTelling = { bezoek: Math.max(0, Math.floor(Number(oud?.bezoek) || 0)), concept: Math.max(0, Math.floor(Number(oud?.concept) || 0)) };
  t[stap] += 1;
  return t;
}

/** Het localStorage-merk van "niet meer tonen" per apparaat. */
export const TIP_WEG_SLEUTEL = "zf:tip-bedrijf-weg";

/**
 * Staan er echte open klussen in de lijst? Testklussen (lib/shifts/testklus.ts) tellen niet mee. Zonder echte klussen
 * (leeg, of alleen testklussen) komt de kaart bovenaan, anders onderaan.
 */
export function tipPlek(shifts: readonly { testklus?: boolean }[]): "boven" | "onder" {
  return shifts.some((s) => !s.testklus) ? "onder" : "boven";
}
