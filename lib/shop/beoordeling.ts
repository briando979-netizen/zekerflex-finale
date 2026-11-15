// ---------------------------------------------------------------------------
// Beoordelingen in de webshop, zoals bol.com (15 nov 2026), maar alleen echte: wie het product kocht en de bestelling
// verzonden kreeg, kan het beoordelen via de getekende link uit de mail (lib/shop/bon-token.ts). Elke beoordeling wacht op
// de beheerder (Beheer → Webshop → Beoordelingen) voordat hij op de site staat. Nooit een verzonnen beoordeling: zonder
// beoordelingen zegt de productpagina dat eerlijk. Puur bestand, ook voor de browser.
// ---------------------------------------------------------------------------

export const BEOORDELING_STATUSSEN = ["wacht", "zichtbaar", "afgewezen"] as const;
export type BeoordelingStatus = (typeof BEOORDELING_STATUSSEN)[number];

export const TEKST_MIN = 10;
export const TEKST_MAX = 2000;

const STATUS_TABEL: Record<BeoordelingStatus, true> = { wacht: true, zichtbaar: true, afgewezen: true };

/** Object.hasOwn, niet `in`: anders telt "constructor" als status. */
export function isBeoordelingStatus(v: unknown): v is BeoordelingStatus {
  return typeof v === "string" && Object.hasOwn(STATUS_TABEL, v);
}

/** Pas na verzending: dan heeft de koper het product (bijna) in handen. */
export function magBeoordelen(orderStatus: string): boolean {
  return orderStatus === "SHIPPED";
}

/** Hoe de koper op de site staat: voornaam en de eerste letter van de achternaam ("Sanne B."), nooit de hele naam. */
export function weergaveNaam(voornaam: string, achternaam: string): string {
  const v = voornaam.trim().split(/\s+/)[0] ?? "";
  const a = achternaam.trim().replace(/^(van der|van den|van de|van|de|der|den|ter|ten|te)\s+/i, "");
  const letter = a.charAt(0).toUpperCase();
  const naam = `${v.charAt(0).toUpperCase()}${v.slice(1)}`;
  if (!naam) return "Klant";
  return letter ? `${naam} ${letter}.` : naam;
}

export interface Samenvatting {
  /** gemiddelde op één decimaal; 0 zonder beoordelingen */
  gemiddelde: number;
  aantal: number;
  /** aantal per sterrental, index 0 = 1 ster … index 4 = 5 sterren */
  verdeling: [number, number, number, number, number];
}

export function samenvatting(sterren: readonly number[]): Samenvatting {
  const verdeling: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let som = 0;
  let aantal = 0;
  for (const s of sterren) {
    const n = Math.round(s);
    if (n < 1 || n > 5) continue;
    verdeling[n - 1] = (verdeling[n - 1] ?? 0) + 1;
    som += n;
    aantal += 1;
  }
  return { gemiddelde: aantal ? Math.round((som / aantal) * 10) / 10 : 0, aantal, verdeling };
}

/** Hoeveel van elke ster vol is (voor de weergave): 3,5 → [1, 1, 1, 0.5, 0]. */
export function sterVulling(gemiddelde: number): number[] {
  return [0, 1, 2, 3, 4].map((i) => Math.max(0, Math.min(1, gemiddelde - i)));
}

/** "4,3" met een komma, zoals in Nederland. */
export function cijferTekst(gemiddelde: number): string {
  return gemiddelde.toFixed(1).replace(".", ",");
}

/** Een product uit een bestelling dat de koper kan beoordelen (lib/shop/beoordeling-server.ts), met wat hij er al over schreef. */
export interface TeBeoordelen {
  productId: string;
  naam: string;
  slug: string;
  imageUrl: string | null;
  beoordeling: { sterren: number; tekst: string; status: BeoordelingStatus } | null;
}

/** Een goedgekeurde beoordeling zoals de productpagina hem toont. */
export interface ZichtbareBeoordeling {
  id: string;
  naam: string;
  sterren: number;
  tekst: string;
  /** ISO-datum; de pagina toont hem in Nederlandse tijd */
  datum: string;
}

/** Wat de productpagina over de beoordelingen krijgt. */
export interface ProductBeoordelingen {
  samenvatting: Samenvatting;
  lijst: ZichtbareBeoordeling[];
}

/** De datum van een beoordeling, in Nederlandse tijd (ook als de server in UTC draait: geen hydratiefout). */
export function beoordelingDatum(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === "en" ? "en-GB" : "nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric" });
}
