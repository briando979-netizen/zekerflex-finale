import { POSTS } from "@/lib/kennis/content";
import { leesMinuten, type NieuwsBericht, type Rubriek } from "@/lib/nieuws/regels";

// Wat op /nieuws in de lijst staat: de berichten van de nieuwsroom én onze eigen blogs (lib/kennis/content.ts, rubriek
// "Van ZekerFlex"), samen op datum. Zo is de nieuwsroom nooit leeg en staat ons eigen nieuws er ook tussen. Puur.

export interface NieuwsKaart {
  href: string;
  titel: string;
  samenvatting: string;
  rubriek: Rubriek;
  /** ISO-tijdstip, voor de volgorde en de datum op de kaart */
  datum: string;
  minuten: number;
  bron: string | null;
}

export function nieuwsKaarten(berichten: NieuwsBericht[]): NieuwsKaart[] {
  const nieuws: NieuwsKaart[] = berichten
    .filter((b) => b.status === "geplaatst")
    .map((b) => ({ href: `/nieuws/${b.slug}`, titel: b.titel, samenvatting: b.samenvatting, rubriek: b.rubriek, datum: b.geplaatst ?? b.gemaakt, minuten: leesMinuten(b), bron: b.bron.naam }));
  const eigen: NieuwsKaart[] = POSTS.map((p) => ({ href: `/kennis/blog/${p.slug}`, titel: p.title, samenvatting: p.excerpt, rubriek: "zekerflex", datum: `${p.date}T09:00:00+01:00`, minuten: p.readMinutes, bron: null }));
  return [...nieuws, ...eigen].sort((a, b) => Date.parse(b.datum) - Date.parse(a.datum));
}

const DATUM = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric" });
/** "18 november 2026", in Nederlandse tijd (de server draait in UTC). */
export const nieuwsDatum = (iso: string) => DATUM.format(new Date(iso));
