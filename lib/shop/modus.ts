// Particulier of zakelijk winkelen. Zakelijk toont prijzen zonder btw (de
// betaling blijft incl. btw, met de btw apart op het overzicht), een eigen
// menu en de zakelijke startpagina /shop/zakelijk. De keuze staat in een
// functioneel cookie, zodat de server meteen de goede prijzen rendert.
// Puur: ook de client en de tests gebruiken dit.

export type ShopModus = "particulier" | "zakelijk";
export const MODUS_COOKIE = "zf_shop_modus";
export const MODUS_MAX_AGE = 60 * 60 * 24 * 365;

export const leesModus = (v: string | null | undefined): ShopModus => (v === "zakelijk" ? "zakelijk" : "particulier");

/** Btw-tarief van een product: boeken 9 %, de rest (kleding, PBM, accessoires) 21 %. */
export function btwTarief(p: { slug?: string | null | undefined; name?: string | null | undefined }): number {
  return /\b(les)?boek\b|\bboek-|-boek\b/i.test(`${p.slug ?? ""} ${p.name ?? ""}`) ? 0.09 : 0.21;
}

/** Bedrag zonder btw, op hele centen. */
export const zonderBtw = (centenIncl: number, tarief: number): number => Math.round(centenIncl / (1 + tarief));

export type PrijsRegel = { hoofd: number; incl: number; btw: number; exclusief: boolean };

/** Wat een prijs toont: particulier de prijs incl. btw, zakelijk zonder btw (incl. als kleine regel). */
export function prijsRegel(centenIncl: number, modus: ShopModus, tarief: number): PrijsRegel {
  const excl = zonderBtw(centenIncl, tarief);
  return { hoofd: modus === "zakelijk" ? excl : centenIncl, incl: centenIncl, btw: centenIncl - excl, exclusief: modus === "zakelijk" };
}

export type Regel = { centenIncl: number; tarief: number; aantal: number };

/** Een winkelwagen in btw opgesplitst: zonder btw, btw en totaal (verzending telt mee tegen 21 %). */
export function btwOverzicht(regels: Regel[], verzendingIncl: number): { excl: number; btw: number; incl: number } {
  let incl = 0;
  let excl = 0;
  for (const r of regels) {
    incl += r.centenIncl * r.aantal;
    excl += zonderBtw(r.centenIncl, r.tarief) * r.aantal;
  }
  incl += verzendingIncl;
  excl += zonderBtw(verzendingIncl, 0.21);
  return { excl, btw: incl - excl, incl };
}
