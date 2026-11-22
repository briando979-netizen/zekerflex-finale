// ---------------------------------------------------------------------------
// De ronde chatknop rechtsonder op de openbare site (components/marketing/ChatWidget.tsx) mag niet over een bedrag vallen.
// 22 nov 2026 (gebruikersonderzoek B04b-04): op /klus-plaatsen lag hij op de telefoon over "Totaal excl. btw" (je zag
// "€ 1..."). Een blok met het attribuut CHATKNOP_VRIJ houdt de knop weg zolang het onder de knop doorschuift; daarna
// komt hij terug. Puur: de browser en de tests lezen het.
// ---------------------------------------------------------------------------

/** Zet dit attribuut op een blok dat nooit onder de chatknop mag verdwijnen (bijvoorbeeld een totaalbedrag). */
export const CHATKNOP_VRIJ = "data-chatknop-vrij";

export interface Vlak {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** De plek van de knop: bottom-5 right-5 (20 px) en h-14 w-14 (56 px), met wat ruimte eromheen. */
export const CHATKNOP = { rechts: 20, onder: 20, maat: 56, marge: 8 } as const;

/** Ligt dit blok (getBoundingClientRect) onder de chatknop in een venster van deze maat? */
export function raaktChatknop(blok: Vlak, venster: { breedte: number; hoogte: number }, knop: typeof CHATKNOP = CHATKNOP): boolean {
  const links = venster.breedte - knop.rechts - knop.maat - knop.marge;
  const rechts = venster.breedte - knop.rechts + knop.marge;
  const boven = venster.hoogte - knop.onder - knop.maat - knop.marge;
  const onder = venster.hoogte - knop.onder + knop.marge;
  return blok.right > links && blok.left < rechts && blok.bottom > boven && blok.top < onder;
}
