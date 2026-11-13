// Teksten en hulpjes voor Beheer -> Webshop -> Foto's en video's (components/admin/ShopMedia.tsx):
// elk vak (Webshop, Homepage) bewaart los, en het scherm zegt altijd wat er nu echt live staat.
// Puur bestand, zodat de test het zonder React kan lezen.

export type MediaPagina = "shop" | "home";
export type MediaKeuze = { media: string; poster?: string } | null;
type MediaNaam = { id: string; naam: string };

export const PAGINA_NAAM: Record<MediaPagina, string> = { shop: "Webshop", home: "Homepage" };

/** "Nu live: <naam of Geen>", uit de stand van de server. */
export function nuLiveTekst(keuze: MediaKeuze, media: MediaNaam[]): string {
  if (!keuze) return "Nu live: Geen";
  const item = media.find((m) => m.id === keuze.media);
  return `Nu live: ${item ? item.naam : "een bestand dat niet meer in de bibliotheek staat"}`;
}

export function bewaarKnopTekst(pagina: MediaPagina): string {
  return `Bewaren voor ${PAGINA_NAAM[pagina]}`;
}

/** De melding na bewaren: zegt uitdrukkelijk dat alleen deze pagina verandert. */
export function bewaardMelding(pagina: MediaPagina, keuze: MediaKeuze): string {
  return keuze
    ? `Bewaard: alleen op de ${PAGINA_NAAM[pagina]}. Op de pagina verschijnt het binnen een minuut.`
    : `Weggehaald: alleen van de ${PAGINA_NAAM[pagina]}. De andere pagina is niet veranderd.`;
}

/** De keuze zoals de server hem teruggeeft; zonder teruggave de verstuurde keuze. */
export function serverKeuze(antwoord: { achtergrond?: Partial<Record<MediaPagina, MediaKeuze>> } | null, pagina: MediaPagina, verstuurd: MediaKeuze): MediaKeuze {
  const terug = antwoord?.achtergrond?.[pagina];
  return terug === undefined ? verstuurd : terug;
}