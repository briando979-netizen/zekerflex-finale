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

/**
 * Zet dit attribuut op een formulier waarvan de velden niet onder de chatknop mogen liggen (23 nov 2026, schermcontrole van de live
 * site: op 390 px lag de knop op /klus-plaatsen over het pijltje van de keuzelijst en het kalenderpictogram bij Datum). De knop wijkt
 * zolang een veld of knop in dat formulier onder de knop ligt, en komt TERUG_NA_MS nadat er niets meer onder ligt. Anders dan
 * CHATKNOP_VRIJ kijkt dit naar elk veld afzonderlijk, niet naar het hele blok: tussen twee velden door is de knop dus gewoon te zien.
 */
export const CHATKNOP_VELDEN = "data-chatknop-velden";

/** De velden en knoppen in zo'n formulier (een tik daarop mag niet bij de chatknop uitkomen). */
export const VELDEN_SELECTOR = ["input", "select", "textarea", "button"].map((t) => `[${CHATKNOP_VELDEN}] ${t}`).join(", ");

/** Hoe lang de knop wegblijft nadat er niets meer onder lag: zo flikkert hij niet tijdens het scrollen langs een rij velden. */
export const TERUG_NA_MS = 350;

/** Ligt dit blok (getBoundingClientRect) onder de chatknop in een venster van deze maat? */
export function raaktChatknop(blok: Vlak, venster: { breedte: number; hoogte: number }, knop: typeof CHATKNOP = CHATKNOP): boolean {
  const links = venster.breedte - knop.rechts - knop.maat - knop.marge;
  const rechts = venster.breedte - knop.rechts + knop.marge;
  const boven = venster.hoogte - knop.onder - knop.maat - knop.marge;
  const onder = venster.hoogte - knop.onder + knop.marge;
  return blok.right > links && blok.left < rechts && blok.bottom > boven && blok.top < onder;
}

/**
 * Moet de knop wijken? Als een blok met CHATKNOP_VRIJ (bijv. een totaalbedrag) of een veld in een formulier met CHATKNOP_VELDEN
 * onder de knop ligt. De ChatWidget geeft de plekken van die blokken en velden (getBoundingClientRect) door.
 */
export function wijktChatknop(
  o: { blokken: readonly Vlak[]; velden: readonly Vlak[] },
  venster: { breedte: number; hoogte: number },
  knop: typeof CHATKNOP = CHATKNOP,
): boolean {
  return o.blokken.some((b) => raaktChatknop(b, venster, knop)) || o.velden.some((v) => raaktChatknop(v, venster, knop));
}

