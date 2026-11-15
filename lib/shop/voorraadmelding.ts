// ---------------------------------------------------------------------------
// "Laat me weten als hij er weer is", zoals bol.com (stap 5, 15 nov 2026). Bij een uitverkochte maat of kleur laat een
// bezoeker zijn e-mailadres achter. Pas na een klik in de bevestigingsmail telt de aanvraag (daar staat ook een afmeldlink);
// onbevestigd is hij na 3 dagen weg. Een ronde elk kwartier (/api/internal/shop/voorraadmelding) mailt één keer zodra er
// weer voorraad is en wist de aanvraag dan; zonder voorraad is hij na 90 dagen weg. Het adres wordt nergens anders voor
// gebruikt, komt mee bij inzage en wissen van een account (lib/privacy) en staat nooit in een link: die draagt een
// willekeurige code met een handtekening. Opslag: KV `shop-voorraad:<variantId>` (lib/shop/voorraadmelding-server.ts).
// Puur bestand.
// ---------------------------------------------------------------------------

export const VOORRAAD_PREFIX = "shop-voorraad:";
export const BEWAAR_DAGEN = 90;
/** onbevestigde aanvragen zijn na zoveel dagen weg */
export const BEVESTIG_DAGEN = 3;
/** meer aanvragen per maat/kleur bewaren we niet (tegen misbruik) */
export const MAX_PER_VARIANT = 500;

export interface VoorraadAanvraag {
  /** willekeurige code voor de links in de mail (bevestigen, afmelden); nooit het adres zelf */
  id: string;
  email: string;
  /** ISO-tijd van de aanvraag */
  at: string;
  taal: "nl" | "en";
  bevestigd: boolean;
}

export interface VoorraadLijst {
  aanvragen: VoorraadAanvraag[];
}

export const voorraadSleutel = (variantId: string) => `${VOORRAAD_PREFIX}${variantId}`;

/** Kleine letters en zonder spaties; null als het geen bruikbaar adres is. */
export function normaliseerEmail(waarde: unknown): string | null {
  if (typeof waarde !== "string") return null;
  const e = waarde.trim().toLowerCase();
  if (e.length < 6 || e.length > 200) return null;
  return /^[^\s@]+@[^\s@]+\.[a-z0-9-]{2,}$/.test(e) ? e : null;
}

/** Voegt een aanvraag toe; een adres dat er al op staat, telt niet dubbel (bestaand = die aanvraag). */
export function voegAanvraagToe(
  lijst: VoorraadLijst | null,
  a: VoorraadAanvraag,
): { lijst: VoorraadLijst; nieuw: boolean; vol: boolean; bestaand: VoorraadAanvraag | null } {
  const oud = lijst?.aanvragen ?? [];
  const bestaand = oud.find((x) => x.email === a.email) ?? null;
  if (bestaand) return { lijst: { aanvragen: oud }, nieuw: false, vol: false, bestaand };
  if (oud.length >= MAX_PER_VARIANT) return { lijst: { aanvragen: oud }, nieuw: false, vol: true, bestaand: null };
  return { lijst: { aanvragen: [...oud, a] }, nieuw: true, vol: false, bestaand: null };
}

/** De aanvragen die nog niet verlopen zijn: bevestigd 90 dagen, onbevestigd 3. */
export function nogGeldig(lijst: VoorraadLijst | null, nu: Date): VoorraadAanvraag[] {
  return (lijst?.aanvragen ?? []).filter((a) => {
    const t = Date.parse(a.at);
    const dagen = a.bevestigd ? BEWAAR_DAGEN : BEVESTIG_DAGEN;
    return Number.isFinite(t) && t >= nu.getTime() - dagen * 86_400_000;
  });
}

/** "Hoodie (M, Grijs)": de naam met maat en kleur, voor de mail. */
export function variantNaam(product: string, size: string | null, color: string | null): string {
  const extra = [size, color].filter(Boolean).join(", ");
  return extra ? `${product} (${extra})` : product;
}

export type VoorraadActie = "ja" | "af";

/** De link in de mail: maat, code en handtekening (lib/shop/voorraadmelding-server.ts), nooit het adres. */
export function voorraadPad(actie: VoorraadActie, variantId: string, aanvraagId: string, handtekening: string): string {
  return `/shop/voorraadmelding?actie=${actie}&v=${encodeURIComponent(variantId)}&a=${encodeURIComponent(aanvraagId)}&s=${encodeURIComponent(handtekening)}`;
}
