import { beoordeelBericht, leesAntwoord, maakSlug, rubriekVoor, uniekeSlug, type FeedItem, type NieuwsBericht, type Rubriek } from "@/lib/nieuws/regels";
import type { NieuwsBron } from "@/lib/nieuws/bronnen";
import type { NieuwsStand } from "@/lib/nieuws/store";

// ---------------------------------------------------------------------------
// Eén ronde van de nieuwsroom: de feeds lezen, kiezen wat bij ons past, de bronpagina lezen, het model een eigen kort
// bericht laten schrijven, dat hard controleren (lib/nieuws/regels.ts) en het bewaren. Staat de vlag
// `nieuws-vanzelf-plaatsen` aan, dan gaat een goedgekeurd bericht meteen op de site; anders wacht het als concept in
// Beheer → Nieuwsroom op een mens. Een afgekeurd bericht wordt nooit geplaatst.
//
// Alles van buiten komt via `NieuwsAfhankelijkheden` binnen, zodat de ronde zonder netwerk en model te testen is.
// ---------------------------------------------------------------------------

export const NIEUWS_VLAG = "nieuws-vanzelf-plaatsen";
export const NIEUWS_JOB = "nieuws";
/** hooguit zoveel nieuwe berichten per ronde: het eigen model is traag en een dag heeft meer rondes */
export const MAX_PER_RONDE = 2;
/** ouder nieuws is geen nieuws meer */
export const MAX_LEEFTIJD_DAGEN = 4;
const DAG = 86_400_000;

export interface NieuwsAfhankelijkheden {
  vanzelf: () => Promise<boolean>;
  bronnen: NieuwsBron[];
  haalFeed: (bron: NieuwsBron) => Promise<FeedItem[]>;
  haalPagina: (url: string) => Promise<string>;
  schrijf: (invoer: { bron: NieuwsBron; item: FeedItem; tekst: string; rubriek: Rubriek }) => Promise<unknown>;
  isGezien: (id: string) => Promise<boolean>;
  zetGezien: (id: string, nu: Date) => Promise<void>;
  slugs: () => Promise<string[]>;
  bewaar: (b: NieuwsBericht) => Promise<void>;
  bewaarStand: (s: NieuwsStand) => Promise<void>;
  ruimOp: (nu: number) => Promise<unknown>;
}

export async function loopNieuwsNa(d: NieuwsAfhankelijkheden, nu = new Date()): Promise<NieuwsStand> {
  const vanzelf = await d.vanzelf().catch(() => false);
  const stand: NieuwsStand = { at: nu.toISOString(), vanzelf, bekeken: 0, paste: 0, geschreven: 0, geplaatst: 0, afgekeurd: [] };
  const fouten: string[] = [];
  const slugs = new Set(await d.slugs().catch(() => []));
  let gemaakt = 0;

  for (const bron of d.bronnen) {
    let items: FeedItem[];
    try {
      items = await d.haalFeed(bron);
    } catch (e) {
      fouten.push(`${bron.naam}: ${(e as Error).message}`);
      continue;
    }
    const vers = items
      .filter((i) => i.url.startsWith(bron.alleenPad) && nu.getTime() - Date.parse(i.datum) < MAX_LEEFTIJD_DAGEN * DAG)
      .sort((a, b) => b.datum.localeCompare(a.datum));
    for (const item of vers) {
      if (await d.isGezien(item.id)) continue;
      stand.bekeken++;
      const rubriek = rubriekVoor(item.titel, item.omschrijving);
      if (!rubriek) {
        await d.zetGezien(item.id, nu);
        continue;
      }
      stand.paste++;
      // de rest wacht op de volgende ronde: niet gemarkeerd, dus het komt vanzelf terug
      if (gemaakt >= MAX_PER_RONDE) continue;
      gemaakt++;
      try {
        const tekst = await d.haalPagina(item.url);
        if (tekst.length < 300) throw new Error("de bronpagina heeft te weinig tekst");
        const gelezen = leesAntwoord(await d.schrijf({ bron, item, tekst, rubriek }));
        if (!gelezen) throw new Error("het model gaf geen bruikbaar bericht");
        stand.geschreven++;
        // de titel van de bron telt mee als brontekst: een getal uit de kop mag terugkomen
        const oordeel = beoordeelBericht(gelezen, `${item.titel}\n${item.omschrijving}\n${tekst}`, nu);
        if (!oordeel.goed) {
          stand.afgekeurd.push({ titel: item.titel.slice(0, 120), reden: oordeel.reden ?? "afgekeurd" });
          await d.zetGezien(item.id, nu);
          continue;
        }
        const slug = uniekeSlug(maakSlug(gelezen.titel), slugs);
        slugs.add(slug);
        await d.bewaar({
          slug,
          ...gelezen,
          rubriek,
          gemaakt: nu.toISOString(),
          status: vanzelf ? "geplaatst" : "concept",
          ...(vanzelf ? { geplaatst: nu.toISOString(), door: "vanzelf" } : {}),
          bron: { naam: bron.naam, titel: item.titel, url: item.url, datum: item.datum },
        });
        if (vanzelf) stand.geplaatst++;
        await d.zetGezien(item.id, nu);
      } catch (e) {
        // niet gemarkeerd: een storing in het model of de bron is de volgende ronde misschien over
        fouten.push(`${item.titel.slice(0, 60)}: ${(e as Error).message}`);
      }
    }
  }

  if (fouten.length) stand.fout = fouten.slice(0, 3).join(" · ").slice(0, 400);
  await d.bewaarStand(stand).catch(() => undefined);
  await d.ruimOp(nu.getTime()).catch(() => undefined);
  return stand;
}
