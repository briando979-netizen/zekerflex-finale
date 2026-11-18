// ---------------------------------------------------------------------------
// De productfeed van de webshop (18 nov 2026): één XML-bestand in het formaat van Google
// Shopping (RSS 2.0 met de g:-velden), dat ook Meta (Instagram- en Facebook-shop) en TikTok
// (catalogus) zo inlezen. De eigenaar plakt het adres /api/shop/feed één keer in elk portaal;
// daarna halen zij hem zelf dagelijks op. Puur: de route (app/api/shop/feed) geeft de producten.
// Dezelfde regels als de productlijst voor AI-assistenten (lib/shop/agent-handel.ts): aan,
// met foto, met variant en omschrijving; bundels en niet-goedgekeurde verkopers niet.
// ---------------------------------------------------------------------------

import { beeldLink, redenOverslaan, schoneTekst, type CatalogusProduct, type CatalogusVariant } from "@/lib/shop/agent-handel";
import { GRATIS_VERZENDING_VANAF_CENT, VERZENDKOSTEN_CENT } from "@/lib/shop/verzending";

// eslint-disable-next-line no-control-regex -- stuurtekens zijn in XML 1.0 verboden; één zo'n teken maakt de hele feed ongeldig
const STUURTEKENS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
const xml = (s: string) => s.replace(STUURTEKENS, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const prijs = (cent: number) => `${(cent / 100).toFixed(2)} EUR`;

const GESLACHT: Record<string, "male" | "female" | "unisex"> = { heren: "male", vrouwen: "female", unisex: "unisex", kinderen: "unisex" };

export interface FeedItem {
  id: string;
  groep: string;
  titel: string;
  omschrijving: string;
  link: string;
  foto: string;
  prijsCents: number;
  opVoorraad: boolean;
  categorie: string;
  kleur: string | null;
  maat: string | null;
  geslacht: "male" | "female" | "unisex" | null;
  kinderen: boolean;
  verzendCents: number;
}

/** Eén regel per variant (kleur/maat), of één per product als er niets te kiezen valt. */
export function feedItems(producten: readonly CatalogusProduct[], basis: string): FeedItem[] {
  const uit: FeedItem[] = [];
  for (const p of producten) {
    if (redenOverslaan(p, basis)) continue;
    const foto = beeldLink(p, basis);
    if (!foto) continue;
    const link = `${basis}/shop/${encodeURIComponent(p.slug)}`;
    const omschrijving = schoneTekst(p.description, 5000);
    const geslacht = p.gender ? (GESLACHT[p.gender] ?? null) : null;
    const kinderen = p.gender === "kinderen";
    const varianten: CatalogusVariant[] = p.variants.length ? p.variants : [{ id: p.id, sku: p.id, size: null, color: null, priceCents: null, stock: 0 }];
    const meerdere = varianten.length > 1;
    for (const v of varianten) {
      const prijsCents = v.priceCents ?? p.priceCents;
      const extra = [v.color, v.size].filter((x): x is string => Boolean(x && x.trim())).join(" ");
      uit.push({
        id: v.id,
        groep: p.id,
        titel: meerdere && extra ? `${p.name} – ${extra}` : p.name,
        omschrijving,
        link,
        foto,
        prijsCents,
        opVoorraad: v.stock > 0,
        categorie: p.category,
        kleur: v.color?.trim() || null,
        maat: v.size?.trim() || null,
        geslacht,
        kinderen,
        // per stuk: boven de grens gratis, anders het vaste tarief (de kassa rekent per bestelling, lib/shop/verzending.ts)
        verzendCents: prijsCents >= GRATIS_VERZENDING_VANAF_CENT ? 0 : VERZENDKOSTEN_CENT,
      });
    }
  }
  return uit;
}

function itemXml(i: FeedItem): string {
  const r: string[] = [
    `<g:id>${xml(i.id)}</g:id>`,
    `<g:item_group_id>${xml(i.groep)}</g:item_group_id>`,
    `<g:title>${xml(i.titel.slice(0, 150))}</g:title>`,
    `<g:description>${xml(i.omschrijving)}</g:description>`,
    `<g:link>${xml(i.link)}</g:link>`,
    `<g:image_link>${xml(i.foto)}</g:image_link>`,
    `<g:availability>${i.opVoorraad ? "in_stock" : "out_of_stock"}</g:availability>`,
    `<g:price>${prijs(i.prijsCents)}</g:price>`,
    `<g:condition>new</g:condition>`,
    // geen EAN/merk van de leverancier: dan moet dit expliciet, anders keurt Google de regel af
    `<g:identifier_exists>no</g:identifier_exists>`,
    `<g:product_type>${xml(i.categorie)}</g:product_type>`,
    `<g:shipping><g:country>NL</g:country><g:service>Standaard</g:service><g:price>${prijs(i.verzendCents)}</g:price></g:shipping>`,
  ];
  if (i.kleur) r.push(`<g:color>${xml(i.kleur)}</g:color>`);
  if (i.maat) r.push(`<g:size>${xml(i.maat)}</g:size>`);
  if (i.geslacht) r.push(`<g:gender>${i.geslacht}</g:gender>`);
  if (i.kinderen) r.push(`<g:age_group>kids</g:age_group>`);
  return `<item>${r.join("")}</item>`;
}

/** Het hele feedbestand. */
export function bouwProductFeed(producten: readonly CatalogusProduct[], basis: string, now = new Date()): { xml: string; aantal: number } {
  const items = feedItems(producten, basis);
  const kop = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>ZekerFlex Shop</title><link>${xml(basis)}/shop</link><description>Producten van de ZekerFlex Shop</description><lastBuildDate>${now.toUTCString()}</lastBuildDate>`;
  return { xml: `${kop}${items.map(itemXml).join("\n")}</channel></rss>\n`, aantal: items.length };
}
