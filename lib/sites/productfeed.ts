import type { Company, Media, SiteProduct, SiteSoort, Winkel } from "@/lib/sites/types";
import { isUitverkocht, winkelVan, zichtbareProducten } from "@/lib/sites/winkel";

// ---------------------------------------------------------------------------
// Studio → Webshop → Groei: de productfeed voor Google Merchant Center (gratis
// vermeldingen in Google Shopping). RSS 2.0 met de g:-velden van Google, op het
// eigen adres van de webshop: …/productfeed.xml (lib/sites/serve.ts). Prijs en
// voorraad komen uit de winkel zoals hij nu is, net als de productpagina's.
// Google eist een foto en een prijs: een product zonder blijft buiten de feed,
// en het Groei-scherm zegt hoeveel. Puur, zodat tests en scherm hetzelfde tellen.
// ---------------------------------------------------------------------------

/** Het pad van de feed op de site: /site/<naam>/productfeed.xml of jouwwinkel.nl/productfeed.xml. */
export const FEED_PAD = "productfeed.xml";

/** Wat de feed van een site nodig heeft (een gepubliceerde momentopname, of de site zelf). */
export interface FeedSite {
  soort?: SiteSoort | undefined;
  bedrijf: Pick<Company, "naam">;
  media: Pick<Media, "id" | "file">[];
  winkel?: Winkel | undefined;
  voorbeeld?: boolean | undefined;
  voorstel?: unknown;
}

export interface Feed {
  xml: string;
  /** zoveel producten staan erin */
  inFeed: number;
  /** zichtbare producten zonder foto (Google weigert ze) */
  zonderFoto: number;
  /** zichtbare producten met prijs € 0 (Google weigert ze) */
  zonderPrijs: number;
}

/** Een webshop (of een website met producten) heeft een feed; een voorbeeld of ontwerpvoorstel nooit. */
export const heeftFeed = (site: FeedSite): boolean => !site.voorbeeld && !site.voorstel && (site.soort === "webshop" || zichtbareProducten(winkelVan(site)).length > 0);

/** 1295 → "12.95 EUR": de notatie van Google (punt, ISO-valuta). */
export function feedPrijs(cents: number): string {
  const c = Math.max(0, Math.round(cents));
  return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")} EUR`;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };

/** Tekst veilig in XML: geëscaped, zonder tekens die XML 1.0 niet toestaat (stuurcodes, losse surrogaten). */
export function xmlTekst(s: string): string {
  return (
    s
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
      // een geldig paar blijft staan, een losse helft gaat weg
      .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, (m) => (m.length === 2 ? m : ""))
      .replace(/[&<>"']/g, (c) => ESC[c] ?? c)
  );
}

/** Ten hoogste `max` tekens, zonder een emoji of ander teken met twee helften door te knippen. */
const kort = (s: string, max: number) => Array.from(s.replace(/\s+/g, " ").trim()).slice(0, max).join("");

/** Ontbreekt er iets wat Google eist? Dan blijft het product buiten de feed. */
export function feedBezwaar(p: Pick<SiteProduct, "fotos" | "prijsCents">, media: Map<string, unknown>): "foto" | "prijs" | null {
  if (!p.fotos.some((f) => media.has(f))) return "foto";
  if (!(p.prijsCents > 0)) return "prijs";
  return null;
}

function item(p: SiteProduct, merk: string, basis: string, fotos: string[]): string {
  const aanbieding = p.oudePrijsCents != null && p.oudePrijsCents > p.prijsCents;
  const velden = [
    `<g:id>${xmlTekst(p.id)}</g:id>`,
    `<title>${xmlTekst(kort(p.naam, 150))}</title>`,
    `<description>${xmlTekst(kort(p.omschrijving || p.korteTekst || p.naam, 5000))}</description>`,
    `<link>${xmlTekst(`${basis}p/${p.slug}`)}</link>`,
    `<g:image_link>${xmlTekst(`${basis}media/${fotos[0] ?? ""}`)}</g:image_link>`,
    ...fotos.slice(1, 11).map((f) => `<g:additional_image_link>${xmlTekst(`${basis}media/${f}`)}</g:additional_image_link>`),
    // in de aanbieding: de oude prijs is de prijs, de nieuwe de aanbiedingsprijs (zo toont Google de korting)
    `<g:price>${feedPrijs(aanbieding ? (p.oudePrijsCents ?? p.prijsCents) : p.prijsCents)}</g:price>`,
    ...(aanbieding ? [`<g:sale_price>${feedPrijs(p.prijsCents)}</g:sale_price>`] : []),
    `<g:availability>${isUitverkocht(p) ? "out_of_stock" : "in_stock"}</g:availability>`,
    `<g:condition>new</g:condition>`,
    `<g:brand>${xmlTekst(kort(merk, 70))}</g:brand>`,
    // eigen producten hebben geen streepjescode (GTIN) of artikelnummer van een fabrikant
    `<g:identifier_exists>no</g:identifier_exists>`,
    ...(p.categorie.trim() ? [`<g:product_type>${xmlTekst(kort(p.categorie, 750))}</g:product_type>`] : []),
  ];
  return `<item>${velden.join("")}</item>`;
}

/**
 * De feed van een site. `origin` + `root` zijn het adres waarop de site staat ("https://jouwwinkel.nl" + "/",
 * of "https://zekerflex.com" + "/site/<naam>/"); elke link wijst daarheen.
 */
export function productFeed(site: FeedSite, adres: { origin: string; root: string }): Feed {
  const basis = `${adres.origin}${adres.root}`;
  const media = new Map(site.media.map((m) => [m.id, m.file]));
  const naam = site.bedrijf.naam.trim() || "Webshop";
  let zonderFoto = 0;
  let zonderPrijs = 0;
  const items: string[] = [];
  for (const p of zichtbareProducten(winkelVan(site))) {
    const bezwaar = feedBezwaar(p, media);
    if (bezwaar === "foto") zonderFoto++;
    if (bezwaar === "prijs") zonderPrijs++;
    if (bezwaar) continue;
    const fotos = p.fotos.map((f) => media.get(f)).filter((f): f is string => Boolean(f));
    items.push(item(p, naam, basis, fotos));
  }
  const kanaal = `<title>${xmlTekst(naam)}</title><link>${xmlTekst(`${basis}winkel`)}</link><description>${xmlTekst(`Producten van ${naam}`)}</description>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>${kanaal}${items.join("")}</channel></rss>\n`;
  return { xml, inFeed: items.length, zonderFoto, zonderPrijs };
}
