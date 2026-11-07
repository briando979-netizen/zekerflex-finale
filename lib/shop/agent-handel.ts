import { GRATIS_VERZENDING_VANAF_CENT, VERZENDKOSTEN_CENT } from "@/lib/shop/verzending";

// ---------------------------------------------------------------------------
// Verkopen via AI-assistenten (Stripe Agentic Commerce Suite), het pure deel.
//
// 1. De productlijst: elke maat/kleur van een actief product met een foto wordt
//    één regel in de CSV die Stripe deelt met AI-assistenten (ChatGPT, Copilot,
//    Perplexity, …). Het id van een regel is het id van de variant, zodat een
//    bestelling via een assistent precies op die variant terugkomt.
// 2. De bestelling: Stripe regelt het afrekenen en stuurt daarna een gewone
//    checkout.session.completed. Hier zetten we die sessie om naar een
//    ShopOrder-regel (lib/shop/agent-handel-server.ts maakt hem aan).
//
// Geen netwerk, geen database: alles hier is los te testen.
// Veldnamen en waarden volgen docs.stripe.com/agentic-commerce/concepts/catalog-feed.
// ---------------------------------------------------------------------------

export interface CatalogusVariant {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  priceCents: number | null;
  stock: number;
}

export interface CatalogusProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  gender: string | null;
  priceCents: number;
  imageUploadId: string | null;
  imageUrl: string | null;
  isBundle: boolean;
  active: boolean;
  sellerTenantId: string | null;
  sellerStatus: string | null;
  sellerName: string | null;
  variants: CatalogusVariant[];
}

export const PRODUCT_KOLOMMEN = [
  "id",
  "item_group_id",
  "item_group_title",
  "title",
  "description",
  "link",
  "image_link",
  "brand",
  "mpn",
  "product_category",
  "gender",
  "age_group",
  "color",
  "size",
  "availability",
  "inventory_quantity",
  "price",
  "tax_behavior",
  "stripe_product_tax_code",
  "shipping",
  "shipping_tax_behavior",
  "free_shipping_threshold",
] as const;
export const VOORRAAD_KOLOMMEN = ["id", "availability", "inventory_quantity"] as const;
export const PRIJS_KOLOMMEN = ["id", "price"] as const;

export type ProductRij = Record<(typeof PRODUCT_KOLOMMEN)[number], string>;

/** Velden die per kwartier kunnen veranderen; de rest verandert zelden (zie vasteVingerafdruk). */
const WISSELEND = new Set<string>(["availability", "inventory_quantity", "price"]);

const VERZENDDIENST = "Standaard verzending";
// Eigen voorraad: "voor 22:00 besteld, morgen in huis" (lib/i18n/dictionaries.ts, shop.announcement),
// in het weekend een dag later. Een verkoper verstuurt binnen 2 werkdagen (lib/shop/verkoper.ts).
const SNELHEID_EIGEN = "1-2";
const SNELHEID_VERKOPER = "2-4";
// Algemene fysieke goederen, prijzen inclusief btw (zoals op de site).
const BELASTINGCODE = "txcd_99999999";

const CATEGORIEPAD: Record<string, string> = {
  "Werk & PBM": "Kleding en accessoires > Werkkleding en beschermingsmiddelen",
  Kleding: "Kleding en accessoires > Kleding",
  Werkdag: "Werk en kantoor > Werkdagbenodigdheden",
  Cadeaus: "Cadeaus",
};

const GESLACHT: Record<string, "male" | "female" | "unisex"> = { heren: "male", vrouwen: "female", unisex: "unisex", kinderen: "unisex" };

export const bedrag = (cent: number) => `${(cent / 100).toFixed(2)} EUR`;

/** Platte tekst voor de omschrijving: geen opmaaktekens of links (Stripe wil "plain text only"). */
export function schoneTekst(s: string, max = 5000): string {
  return s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>]+/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

/**
 * Een openbare JPEG- of PNG-foto van het product. Een foto in public/ die al
 * JPEG of PNG is, gaat rechtstreeks; al het andere (WebP, een upload) via
 * /api/shop/beeld/<id>.jpg, dat er een JPEG van maakt. Zonder foto: null.
 */
export function beeldLink(p: Pick<CatalogusProduct, "id" | "imageUrl" | "imageUploadId">, basis: string): string | null {
  const url = p.imageUrl?.trim() ?? "";
  const eigen = url.startsWith("/") && !url.startsWith("//");
  if (eigen && !url.startsWith("/api/") && /\.(jpe?g|png)$/i.test(url)) return `${basis}${url}`;
  if (p.imageUploadId || eigen) return `${basis}/api/shop/beeld/${p.id}.jpg`;
  return null;
}

/** Waarom een product niet in de lijst komt, of null als het mee mag. */
export function redenOverslaan(p: CatalogusProduct, basis: string): string | null {
  if (!p.active) return "staat uit";
  if (p.isBundle) return "bundel (wordt als één product verkocht)";
  if (p.sellerTenantId && p.sellerStatus !== "goedgekeurd") return "verkopersproduct nog niet goedgekeurd";
  if (!beeldLink(p, basis)) return "geen foto";
  if (p.variants.length === 0) return "geen maat of variant";
  if (!p.description.trim()) return "geen omschrijving";
  return null;
}

/**
 * De regels van de productlijst (één per variant), plus wat er bewust buiten
 * bleef. Een product dat in de shop uit staat, telt daar niet mee: het staat
 * ook niet in de webshop.
 */
export function productRijen(producten: readonly CatalogusProduct[], basis: string): { rijen: ProductRij[]; overgeslagen: { naam: string; reden: string }[] } {
  const rijen: ProductRij[] = [];
  const overgeslagen: { naam: string; reden: string }[] = [];
  for (const p of producten) {
    const reden = redenOverslaan(p, basis);
    if (reden) {
      if (p.active) overgeslagen.push({ naam: p.name, reden });
      continue;
    }
    const groep = p.variants.length > 1;
    const verkoper = Boolean(p.sellerTenantId);
    const geslacht = p.gender ? GESLACHT[p.gender] : undefined;
    for (const v of p.variants) {
      const voorraad = Math.max(0, v.stock);
      rijen.push({
        id: v.id,
        item_group_id: groep ? p.id : "",
        item_group_title: groep ? p.name.slice(0, 150) : "",
        title: p.name.slice(0, 150),
        description: schoneTekst(p.description),
        link: `${basis}/shop/${p.slug}`,
        image_link: beeldLink(p, basis) ?? "",
        brand: (p.sellerName?.trim() || "ZekerFlex").slice(0, 70),
        mpn: v.sku.slice(0, 70),
        product_category: CATEGORIEPAD[p.category] ?? p.category,
        gender: geslacht ?? "",
        age_group: p.gender === "kinderen" ? "kids" : "",
        color: v.color?.trim() ?? "",
        size: (v.size?.trim() ?? "").slice(0, 20),
        availability: voorraad > 0 ? "in_stock" : "out_of_stock",
        inventory_quantity: String(voorraad),
        price: bedrag(v.priceCents ?? p.priceCents),
        tax_behavior: "inclusive",
        stripe_product_tax_code: BELASTINGCODE,
        shipping: `NL:ALL:${VERZENDDIENST}:${verkoper ? SNELHEID_VERKOPER : SNELHEID_EIGEN}:${bedrag(VERZENDKOSTEN_CENT)}`,
        shipping_tax_behavior: "inclusive",
        free_shipping_threshold: `NL:ALL:${VERZENDDIENST}:${bedrag(GRATIS_VERZENDING_VANAF_CENT)}`,
      });
    }
  }
  return { rijen, overgeslagen };
}

/** Eén CSV-veld volgens RFC 4180: tussen aanhalingstekens zodra er een komma, aanhalingsteken of regeleinde in staat. */
export function csvVeld(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function naarCsv(kolommen: readonly string[], rijen: readonly Record<string, string>[]): string {
  const regels = [kolommen.join(",")];
  for (const r of rijen) regels.push(kolommen.map((k) => csvVeld(r[k] ?? "")).join(","));
  return `${regels.join("\r\n")}\r\n`;
}

export const productCsv = (rijen: readonly ProductRij[]) => naarCsv(PRODUCT_KOLOMMEN, rijen);
export const voorraadCsv = (rijen: readonly ProductRij[]) => naarCsv(VOORRAAD_KOLOMMEN, rijen);
export const prijsCsv = (rijen: readonly ProductRij[]) => naarCsv(PRIJS_KOLOMMEN, rijen);

/** De productlijst zonder voorraad en prijs: verandert die, dan sturen we de hele lijst opnieuw. */
export function vasteVingerafdruk(rijen: readonly ProductRij[]): string {
  return JSON.stringify(rijen.map((r) => Object.entries(r).filter(([k]) => !WISSELEND.has(k))));
}

// ---------------------------------------------------------------------------
// Uitslag van een upload bij Stripe
// ---------------------------------------------------------------------------

export const IMPORT_STATUS_NL: Record<string, { label: string; tone: "ok" | "warn" | "crit" | "neutral" }> = {
  awaiting_upload: { label: "Wacht op het bestand", tone: "warn" },
  processing: { label: "Stripe verwerkt het", tone: "warn" },
  succeeded: { label: "Gelukt", tone: "ok" },
  succeeded_with_errors: { label: "Gelukt, met fouten in regels", tone: "warn" },
  failed: { label: "Mislukt", tone: "crit" },
};

export const isEindstand = (status: string) => status === "succeeded" || status === "succeeded_with_errors" || status === "failed";

/** Een foutmelding van Stripe in gewoon Nederlands (de tekst van Stripe zelf is Engels). */
export function stripeFoutNL(status: number, bericht: string | undefined): string {
  if (status === 401) return "De Stripe-sleutel klopt niet of is ingetrokken.";
  if (status === 403) return "Deze Stripe-sleutel mag geen productlijst uploaden (rechten van de sleutel).";
  if (status === 404) return "Verkopen via AI-assistenten staat nog niet aan in Stripe (Agentic commerce → Get started).";
  if (status === 429) return "Stripe vraagt om even te wachten (te veel verzoeken).";
  if (status >= 500) return "Stripe had een storing; we proberen het later opnieuw.";
  return `Stripe weigerde het verzoek (${status})${bericht ? `: ${bericht.slice(0, 200)}` : ""}.`;
}

/** Wachttijd na een mislukte ronde: 15 min, dan steeds twee keer zo lang, hooguit 6 uur. */
export function wachtNaFout(pogingen: number): number {
  return Math.min(15 * 60_000 * 2 ** Math.max(0, pogingen - 1), 6 * 3_600_000);
}

// ---------------------------------------------------------------------------
// Een bestelling via een AI-assistent → ShopOrder
// ---------------------------------------------------------------------------

/** Wat we uit de (uitgebreide) Checkout Session lezen; alles optioneel, want het komt van buiten. */
export interface AgentSessie {
  id: string;
  amount_total?: number | null;
  amount_subtotal?: number | null;
  total_details?: { amount_shipping?: number | null } | null;
  payment_intent?: string | { id?: string } | null;
  customer_details?: { name?: string | null; email?: string | null; address?: Adres | null } | null;
  collected_information?: { shipping_details?: { name?: string | null; address?: Adres | null } | null } | null;
  shipping_details?: { name?: string | null; address?: Adres | null } | null;
  line_items?: { data?: AgentRegel[] | null } | null;
}

interface Adres {
  line1?: string | null;
  line2?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
}

export interface AgentRegel {
  quantity?: number | null;
  amount_total?: number | null;
  description?: string | null;
  price?: { external_reference?: string | null; unit_amount?: number | null; product?: { name?: string | null } | string | null } | null;
}

export interface BekendeVariant {
  id: string;
  size: string | null;
  color: string | null;
  product: { id: string; name: string; imageUrl: string | null; sellerTenantId: string | null };
}

export interface AgentOrderRegel {
  variantId?: string;
  productId?: string;
  name: string;
  priceCents: number;
  qty: number;
  imageUrl?: string | null;
  size?: string | null;
  color?: string | null;
  sellerTenantId?: string;
}

const variantLabel = (v: Pick<BekendeVariant, "size" | "color">) => [v.size, v.color].filter(Boolean).join(" / ");

/** Het id uit de productlijst dat Stripe bij de regel teruggeeft (price.external_reference). */
export const regelSku = (r: AgentRegel): string | null => {
  const s = r.price?.external_reference;
  return typeof s === "string" && s.trim() ? s.trim() : null;
};

/**
 * De bestelregels van een sessie. Elke regel waarvan het id een variant van
 * ons is, krijgt die variant (voor de voorraad en de verkoper); een regel die
 * we niet kennen, blijft staan met de naam van Stripe, zodat de bestelling
 * compleet is. Null als geen enkele regel van ons is: dan is het geen
 * bestelling uit onze productlijst.
 */
export function agentRegels(sessie: AgentSessie, varianten: ReadonlyMap<string, BekendeVariant>): AgentOrderRegel[] | null {
  const regels: AgentOrderRegel[] = [];
  let vanOns = false;
  for (const r of sessie.line_items?.data ?? []) {
    const qty = Math.max(1, Math.round(r.quantity ?? 1));
    const totaal = typeof r.amount_total === "number" ? r.amount_total : (r.price?.unit_amount ?? 0) * qty;
    const priceCents = Math.round(totaal / qty);
    const sku = regelSku(r);
    const v = sku ? varianten.get(sku) : undefined;
    if (v) {
      vanOns = true;
      const label = variantLabel(v);
      regels.push({
        variantId: v.id,
        productId: v.product.id,
        name: label ? `${v.product.name} — ${label}` : v.product.name,
        priceCents,
        qty,
        imageUrl: v.product.imageUrl,
        size: v.size,
        color: v.color,
        ...(v.product.sellerTenantId ? { sellerTenantId: v.product.sellerTenantId } : {}),
      });
    } else {
      const productNaam = typeof r.price?.product === "object" && r.price.product ? r.price.product.name : null;
      regels.push({ name: (productNaam || r.description || "Onbekend product").slice(0, 200), priceCents, qty });
    }
  }
  return vanOns ? regels : null;
}

/** Naam, e-mail en afleveradres van de koper. */
export function klantVanSessie(sessie: AgentSessie): { firstName: string; lastName: string; email: string; address: string; postalCode: string; city: string } {
  const verzend = sessie.collected_information?.shipping_details ?? sessie.shipping_details ?? null;
  const adres = verzend?.address ?? sessie.customer_details?.address ?? null;
  const naam = (verzend?.name ?? sessie.customer_details?.name ?? "").trim().replace(/\s+/g, " ");
  const spatie = naam.indexOf(" ");
  const land = adres?.country?.toUpperCase();
  const plaats = (adres?.city ?? "").trim();
  return {
    firstName: spatie > 0 ? naam.slice(0, spatie) : naam,
    lastName: spatie > 0 ? naam.slice(spatie + 1) : "",
    email: (sessie.customer_details?.email ?? "").trim().toLowerCase(),
    address: [adres?.line1, adres?.line2].map((s) => s?.trim()).filter(Boolean).join(" "),
    postalCode: (adres?.postal_code ?? "").trim().toUpperCase(),
    city: land && land !== "NL" ? `${plaats} (${land})` : plaats,
  };
}

/** De bedragen zoals Stripe ze rekende (inclusief btw). */
export function bedragenVanSessie(sessie: AgentSessie, regels: readonly AgentOrderRegel[]): { subtotalCents: number; shippingCents: number; totalCents: number } {
  const shippingCents = Math.max(0, sessie.total_details?.amount_shipping ?? 0);
  const subtotalCents = sessie.amount_subtotal ?? regels.reduce((s, r) => s + r.priceCents * r.qty, 0);
  return { subtotalCents, shippingCents, totalCents: sessie.amount_total ?? subtotalCents + shippingCents };
}

export const betaalId = (sessie: AgentSessie): string | null =>
  typeof sessie.payment_intent === "string" ? sessie.payment_intent : (sessie.payment_intent?.id ?? null);
