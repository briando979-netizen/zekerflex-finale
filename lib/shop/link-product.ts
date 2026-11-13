// ---------------------------------------------------------------------------
// "Product van een link" (Winkel-AI, 13 nov 2026): uit de pagina van een leverancier of andere webwinkel de naam, de
// omschrijving, de foto en de prijs lezen, zodat de eigenaar die niet hoeft over te typen. We lezen wat een pagina zelf
// aanbiedt voor zoekmachines en het delen van links: JSON-LD "Product" en de og-tags. Soepel: wat ontbreekt blijft leeg.
// Puur bestand (geen ophalen, geen opslag); het ophalen staat in lib/shop/link-product-server.ts.
// Let op: grote marktplaatsen (AliExpress, Temu, Amazon) geven een robot een lege pagina (gemeten 13 nov); dan komt hier
// niets uit en vraagt het scherm om de tekst te plakken.
// ---------------------------------------------------------------------------

export interface LinkProduct {
  titel: string;
  omschrijving: string;
  /** adressen van productfoto's (https), de beste eerst; hooguit zes */
  fotos: string[];
  /** de prijs op de pagina, in centen; null als die er niet staat */
  prijsCents: number | null;
  /** de munt bij die prijs (EUR, USD, …); null als onbekend */
  valuta: string | null;
}

const ENTITEIT: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", euro: "€", eacute: "é", egrave: "è", euml: "ë", iuml: "ï", ouml: "ö", uuml: "ü" };

function ontcijfer(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (heel, c: string) => {
    if (c[0] === "#") {
      const n = c[1] === "x" || c[1] === "X" ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10);
      return Number.isFinite(n) && n > 31 && n < 0x10ffff ? String.fromCodePoint(n) : " ";
    }
    const naam = c.toLowerCase();
    return Object.hasOwn(ENTITEIT, naam) ? (ENTITEIT[naam] ?? heel) : heel;
  });
}

/** Gewone tekst: geen HTML, geen dubbele spaties, niet langer dan max. */
function tekst(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return ontcijfer(v.replace(/<[^>]*>/g, " "))
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function adres(v: unknown, basis: string): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  try {
    const u = new URL(ontcijfer(v.trim()), basis);
    return u.protocol === "https:" && u.href.length <= 600 ? u.href : null;
  } catch {
    return null;
  }
}

/** "12,50", "1.299,00", "12.5" of 12.5 → centen. */
export function prijsNaarCents(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 && v < 1_000_000 ? Math.round(v * 100) : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const komma = s.lastIndexOf(",");
  const punt = s.lastIndexOf(".");
  // het laatste teken van de twee is het decimaalteken, als er één of twee cijfers achter staan
  const dec = Math.max(komma, punt);
  if (dec >= 0 && s.length - dec - 1 <= 2) s = `${s.slice(0, dec).replace(/[.,]/g, "")}.${s.slice(dec + 1)}`;
  else s = s.replace(/[.,]/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? Math.round(n * 100) : null;
}

/** De meta-tags van een pagina, sleutel in kleine letters; de eerste waarde telt. */
function metaTags(html: string): Map<string, string> {
  const uit = new Map<string, string>();
  for (const m of html.matchAll(/<meta\b[^>]{0,8000}>/gi)) {
    const tag = m[0];
    const sleutel = /\b(?:property|name|itemprop)\s*=\s*["']([^"']{1,80})["']/i.exec(tag)?.[1]?.toLowerCase();
    const inhoud = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const waarde = inhoud?.[1] ?? inhoud?.[2];
    if (sleutel && waarde !== undefined && !uit.has(sleutel)) uit.set(sleutel, waarde);
  }
  return uit;
}

type Los = Record<string, unknown>;
const isLos = (v: unknown): v is Los => typeof v === "object" && v !== null && !Array.isArray(v);

/** Zoekt in een JSON-LD-boom het eerste object van het type Product (ook in @graph of een lijst). */
function zoekProduct(v: unknown, diepte = 0): Los | null {
  if (diepte > 6) return null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const p = zoekProduct(x, diepte + 1);
      if (p) return p;
    }
    return null;
  }
  if (!isLos(v)) return null;
  const t = v["@type"];
  const types = Array.isArray(t) ? t : [t];
  if (types.some((x) => typeof x === "string" && /(^|\/)(Product|ProductGroup)$/i.test(x))) return v;
  for (const k of ["@graph", "mainEntity", "itemListElement", "item"]) {
    const p = zoekProduct(v[k], diepte + 1);
    if (p) return p;
  }
  return null;
}

function fotosUit(v: unknown, basis: string): string[] {
  const lijst = Array.isArray(v) ? v : [v];
  const uit: string[] = [];
  for (const x of lijst) {
    const a = adres(isLos(x) ? (x.url ?? x.contentUrl) : x, basis);
    if (a && !uit.includes(a)) uit.push(a);
  }
  return uit;
}

function aanbod(v: unknown): { prijsCents: number | null; valuta: string | null } {
  for (const o of Array.isArray(v) ? v : [v]) {
    if (!isLos(o)) continue;
    const spec = isLos(o.priceSpecification) ? o.priceSpecification : null;
    const prijsCents = prijsNaarCents(o.price ?? o.lowPrice ?? spec?.price);
    const munt = o.priceCurrency ?? spec?.priceCurrency;
    if (prijsCents) return { prijsCents, valuta: typeof munt === "string" && /^[A-Za-z]{3}$/.test(munt) ? munt.toUpperCase() : null };
  }
  return { prijsCents: null, valuta: null };
}

/**
 * Leest een productpagina. `basis` is het adres van de pagina (voor foto's met een kort adres). Geeft null als er geen
 * naam te vinden is: dan is het geen leesbare productpagina.
 */
export function leesProductPagina(html: string, basis: string): LinkProduct | null {
  const bron = html.slice(0, 3_000_000);
  let ld: Los | null = null;
  for (const m of bron.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      ld = zoekProduct(JSON.parse((m[1] ?? "").trim()));
    } catch {
      // één onleesbaar blok overslaan en doorgaan
    }
    if (ld) break;
  }
  const meta = metaTags(bron);
  const m = (k: string) => meta.get(k) ?? "";

  const titel = tekst(ld?.name, 160) || tekst(m("og:title"), 160) || tekst(m("twitter:title"), 160) || tekst(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(bron)?.[1], 160);
  if (titel.length < 2) return null;
  const omschrijving = tekst(ld?.description, 1500) || tekst(m("og:description"), 1500) || tekst(m("description"), 1500) || tekst(m("twitter:description"), 1500);

  const fotos = [...fotosUit(ld?.image, basis), ...fotosUit([m("og:image:secure_url"), m("og:image"), m("twitter:image")], basis)];
  const uniek = fotos.filter((f, i) => fotos.indexOf(f) === i).slice(0, 6);

  let { prijsCents, valuta } = aanbod(ld?.offers);
  if (!prijsCents) {
    prijsCents = prijsNaarCents(m("product:price:amount") || m("og:price:amount"));
    const munt = m("product:price:currency") || m("og:price:currency");
    valuta = prijsCents && /^[A-Za-z]{3}$/.test(munt) ? munt.toUpperCase() : null;
  }
  return { titel, omschrijving, fotos: uniek, prijsCents, valuta };
}

// ---------------------------------------------------------------------------
// Winkelsystemen die hun producten ook als gegevens aanbieden (13 nov, "meer bronnen"). Veel leveranciers en dropshippers
// draaien op Shopify of WooCommerce; daar staat naast de pagina een openbaar gegevensadres. Dat lezen we als de pagina zelf
// te weinig geeft (bijvoorbeeld omdat de winkel alles met scripts opbouwt).
// ---------------------------------------------------------------------------

/** Shopify: "/products/<naam>" (ook achter /collections/… of een taal) heeft een "/products/<naam>.json". */
export function shopifyGegevensAdres(url: string): string | null {
  try {
    const u = new URL(url);
    const m = /\/products\/([a-z0-9][a-z0-9_-]{0,200})(?:\.json)?\/?$/i.exec(u.pathname);
    return u.protocol === "https:" && m?.[1] ? `${u.origin}/products/${m[1]}.json` : null;
  } catch {
    return null;
  }
}

/** WooCommerce: "/product/<naam>/" (of /winkel/…, /shop/…) is op te vragen via de openbare winkel-API. */
export function wooGegevensAdres(url: string): string | null {
  try {
    const u = new URL(url);
    const m = /\/(?:product|producten|winkel|shop)\/(?:[^/]+\/)*([a-z0-9][a-z0-9_-]{0,200})\/?$/i.exec(u.pathname);
    return u.protocol === "https:" && m?.[1] ? `${u.origin}/wp-json/wc/store/v1/products?slug=${encodeURIComponent(m[1])}` : null;
  } catch {
    return null;
  }
}

/** Het antwoord van "/products/<naam>.json" van een Shopify-winkel. De munt staat er niet in. */
export function leesShopifyProduct(json: unknown, basis: string): LinkProduct | null {
  const p = isLos(json) && isLos(json.product) ? json.product : null;
  if (!p) return null;
  const titel = tekst(p.title, 160);
  if (titel.length < 2) return null;
  const fotos = [...fotosUit(isLos(p.image) ? p.image.src : null, basis), ...fotosUit(Array.isArray(p.images) ? p.images.map((f) => (isLos(f) ? f.src : null)) : [], basis)];
  const variant = Array.isArray(p.variants) ? p.variants.find(isLos) : null;
  return { titel, omschrijving: tekst(p.body_html, 1500), fotos: fotos.filter((f, i) => fotos.indexOf(f) === i).slice(0, 6), prijsCents: prijsNaarCents(variant?.price), valuta: null };
}

/** Het antwoord van de winkel-API van WooCommerce: een lijst met (hooguit) dit ene product. De prijs staat er in centen. */
export function leesWooProduct(json: unknown, basis: string): LinkProduct | null {
  const p = Array.isArray(json) ? json.find(isLos) : null;
  if (!p) return null;
  const titel = tekst(p.name, 160);
  if (titel.length < 2) return null;
  const fotos = fotosUit(Array.isArray(p.images) ? p.images.map((f) => (isLos(f) ? f.src : null)) : [], basis);
  const prijzen = isLos(p.prices) ? p.prices : null;
  const klein = typeof prijzen?.currency_minor_unit === "number" ? prijzen.currency_minor_unit : 2;
  const ruw = typeof prijzen?.price === "string" && /^\d{1,9}$/.test(prijzen.price) ? Number(prijzen.price) : null;
  const prijsCents = ruw && ruw > 0 ? Math.round(ruw * 10 ** (2 - klein)) : null;
  const munt = prijzen?.currency_code;
  return {
    titel,
    omschrijving: tekst(p.short_description, 1500) || tekst(p.description, 1500),
    fotos: fotos.slice(0, 6),
    prijsCents: prijsCents && prijsCents < 100_000_000 ? prijsCents : null,
    valuta: prijsCents && typeof munt === "string" && /^[A-Za-z]{3}$/.test(munt) ? munt.toUpperCase() : null,
  };
}

/** Of er genoeg staat om er een product van te maken: een naam met een omschrijving of een foto. */
export const isBruikbaar = (p: LinkProduct | null): p is LinkProduct => Boolean(p && (p.omschrijving || p.fotos.length > 0));

/** De tekst voor het vak "Het idee": de naam en de omschrijving van de leverancier, klaar voor de AI. */
export function ideeUitLink(p: LinkProduct): string {
  return [p.titel, p.omschrijving].filter(Boolean).join("\n\n").slice(0, 1500);
}

/** Een adres voor in het scherm: alleen host en pad, nooit een querystring, fragment of inloggegevens (kunnen tokens zijn). */
export function kortAdres(adres: string | null | undefined): string | null {
  if (!adres) return null;
  try {
    const u = new URL(adres);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const pad = u.pathname.replace(/\/+$/, "");
    const kort = `${u.host}${pad}`;
    return kort.length > 90 ? `${kort.slice(0, 89)}…` : kort;
  } catch {
    return null;
  }
}

/** De regel bij een conceptproduct in Beheer; null als er geen bron is. */
export function bronRegel(bron: { pagina?: string | null | undefined; foto?: string | null | undefined } | null | undefined): string | null {
  const pagina = kortAdres(bron?.pagina);
  const foto = kortAdres(bron?.foto);
  if (!pagina && !foto) return null;
  const delen = [pagina ? `pagina ${pagina}` : null, foto ? `foto ${foto}` : null].filter(Boolean).join(", ");
  return `Bron: ${delen}. Controleer of je de foto mag gebruiken.`;
}
