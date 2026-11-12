// ---------------------------------------------------------------------------
// Bonnen per mail: de nodige kopvelden (afzender, datum, onderwerp) bij een bon, zodat een mens bij "even kijken" ziet
// waar hij vandaan kwam. Dit staat bewust NIET in de boeking (daar staan geen persoonsgegevens) en de mail zelf wordt
// niet bewaard. KV `boekhouding:bonmail:kop:<bonId>` en per mail een verwerkt-merkteken `boekhouding:bonmail:gezien:<hash>`
// (alleen de hash van het Message-ID: een mail wordt nooit twee keer verwerkt). Platformgegevens van de eigen
// administratie, geen organisatie- of gebruikersgegevens (lib/privacy/org-kv.ts en user-kv.ts gaan hier niet over).
// ---------------------------------------------------------------------------

import { kvGet, kvSet } from "@/lib/storage/kv";

export interface BonKop {
  afzender: string | null;
  /** zoals in de mail, ingekort; geen tijdzone-omzetting nodig: alleen ter informatie */
  datum: string | null;
  onderwerp: string | null;
}

const kopSleutel = (bonId: string) => `boekhouding:bonmail:kop:${bonId}`;
const gezienSleutel = (mailHash: string) => `boekhouding:bonmail:gezien:${mailHash}`;

const kort = (s: string | null, max: number) => (s === null ? null : s.replace(/\s+/g, " ").trim().slice(0, max) || null);

export async function bewaarBonKop(bonId: string, kop: BonKop): Promise<void> {
  await kvSet(kopSleutel(bonId), { afzender: kort(kop.afzender, 200), datum: kort(kop.datum, 60), onderwerp: kort(kop.onderwerp, 200) } satisfies BonKop);
}

export async function leesBonKop(bonId: string): Promise<BonKop | null> {
  return kvGet<BonKop>(kopSleutel(bonId));
}

export interface GezienMail {
  /** wanneer verwerkt (ISO, UTC) */
  op: string;
  /** de bonnen die eruit kwamen */
  bonIds: string[];
  /** "geen-bijlage" als er niets te bewaren viel */
  soort: "bonnen" | "geen-bijlage";
}

export async function leesGezienMail(mailHash: string): Promise<GezienMail | null> {
  return kvGet<GezienMail>(gezienSleutel(mailHash));
}

export async function markeerMailGezien(mailHash: string, gezien: GezienMail): Promise<void> {
  await kvSet(gezienSleutel(mailHash), gezien);
}

/** Een mail zonder bijlage: er is geen bestand om als bon te bewaren, dus alleen de kopvelden voor een mens. */
export async function bewaarMailZonderBijlage(mailHash: string, kop: BonKop, reden: string): Promise<void> {
  await kvSet(`boekhouding:bonmail:zonder-bijlage:${mailHash}`, {
    afzender: kort(kop.afzender, 200),
    datum: kort(kop.datum, 60),
    onderwerp: kort(kop.onderwerp, 200),
    reden: kort(reden, 300),
  });
}
