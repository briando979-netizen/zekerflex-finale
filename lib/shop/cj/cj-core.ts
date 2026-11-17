// ---------------------------------------------------------------------------
// CJ Dropshipping, het leesgedeelte (puur: geen fetch, geen database). De koppeling
// zelf staat in cj-client.ts, het overnemen in de webshop in importeer.ts.
// Wat hier gebeurt: het JSON van CJ (Engels, dollars, varianten als "Black-XL")
// wordt een net product voor ons: kleur en maat los, inkoopprijs in dollarcenten,
// foto's, voorraad, en onze categorie en doelgroep uit de CJ-categorie en de naam.
// ---------------------------------------------------------------------------

import { isShopCategorie, type ShopCategorie } from "@/lib/shop/categorieen";
import type { Doelgroep } from "@/lib/shop/winkel-ai-core";

export interface CjVariant {
  vid: string;
  sku: string;
  naam: string;
  maat: string | null;
  kleur: string | null;
  foto: string | null;
  inkoopUsdCents: number;
  voorraad: number;
}

export interface CjProduct {
  pid: string;
  sku: string;
  naamEn: string;
  omschrijvingEn: string;
  fotos: string[];
  categorieCj: string;
  categorie: ShopCategorie;
  doelgroep: Doelgroep | null;
  gewichtGram: number | null;
  /** de hoogste inkoopprijs van de varianten (zo is de marge voor élke variant gehaald) */
  inkoopUsdCents: number;
  varianten: CjVariant[];
}

/** Een item uit de zoeklijst (product/list), nog zonder varianten. */
export interface CjZoekTreffer {
  pid: string;
  sku: string;
  naamEn: string;
  foto: string | null;
  inkoopUsdCents: number;
  categorieCj: string;
  categorie: ShopCategorie;
  /** hoe vaak andere winkels het product al voeren (CJ: listedNum) */
  gevoerd: number;
}

const tekst = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const getal = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** "12.5", "12.5 -- 15.0", "12.5-15" of een getal → dollarcenten van het HOOGSTE bedrag; null als er niets in staat. */
export function usdCentsVan(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
  if (typeof v !== "string") return null;
  const delen = v.match(/\d+(?:[.,]\d+)?/g);
  if (!delen) return null;
  const hoogste = Math.max(...delen.map((d) => Number(d.replace(",", "."))));
  return Number.isFinite(hoogste) ? Math.round(hoogste * 100) : null;
}

/** Een lijst foto-adressen uit productImageSet (array, JSON-tekst of één adres), alleen https, zonder dubbele. */
export function fotosVan(...bronnen: unknown[]): string[] {
  const uit: string[] = [];
  const voeg = (s: unknown) => {
    const u = tekst(s);
    if (/^https:\/\/\S+$/.test(u) && !uit.includes(u)) uit.push(u);
  };
  for (const b of bronnen) {
    if (Array.isArray(b)) b.forEach(voeg);
    else if (typeof b === "string" && b.startsWith("[")) {
      try {
        const lijst: unknown = JSON.parse(b);
        if (Array.isArray(lijst)) lijst.forEach(voeg);
      } catch {
        /* geen lijst: dan als één adres proberen */
        voeg(b);
      }
    } else voeg(b);
  }
  return uit;
}

/** HTML van de leverancier → gewone tekst (geen tags, entiteiten gelezen, witruimte samengevat), hooguit `max` tekens. */
export function tekstUitHtml(html: unknown, max = 1500): string {
  const s = tekst(html)
    .replace(/<\s*(br|p|div|li|h\d|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

const MAAT = /^(xxs|xs|s|m|l|xl|xxl|xxxl|[2-6]xl|one size|free size|onesize|\d{2,3}|\d{1,3}(?:[.,]\d)?\s?(?:cm|mm|inch|in|")|eu\s?\d{2}|us\s?\d{1,2}(?:[.,]5)?|\d{2}-\d{2})$/i;

/** "Black-XL" → kleur Black, maat XL; "XL" → maat; "Red" → kleur; "Blue-Set A" → kleur Blue, maat "Set A". */
export function kleurEnMaat(variantKey: unknown, variantNameEn?: unknown): { kleur: string | null; maat: string | null } {
  const sleutel = tekst(variantKey) || tekst(variantNameEn);
  if (!sleutel) return { kleur: null, maat: null };
  const delen = sleutel.split(/\s*[-–|/]\s*/).map((d) => d.trim()).filter(Boolean);
  if (delen.length === 1) {
    const d = delen[0] ?? "";
    return MAAT.test(d) ? { kleur: null, maat: d.toUpperCase() } : { kleur: d, maat: null };
  }
  const maten = delen.filter((d) => MAAT.test(d));
  const rest = delen.filter((d) => !MAAT.test(d));
  if (maten.length) return { kleur: rest.join(" ") || null, maat: maten.map((m) => m.toUpperCase()).join(" ") };
  // geen herkenbare maat: CJ zet de kleur meestal voorop, de rest is de uitvoering
  return { kleur: delen[0] ?? null, maat: delen.slice(1).join(" ") || null };
}

/** Voorraad over alle magazijnen (CJ: inventories[].totalInventory), of één land als dat gevraagd is. */
export function voorraadVan(inventories: unknown, land?: string): number {
  if (!Array.isArray(inventories)) return 0;
  let som = 0;
  for (const i of inventories) {
    if (!i || typeof i !== "object") continue;
    const r = i as Record<string, unknown>;
    if (land && tekst(r.countryCode).toUpperCase() !== land.toUpperCase()) continue;
    som += Math.max(0, getal(r.totalInventory) ?? getal(r.cjInventory) ?? 0);
  }
  return Math.round(som);
}

const REGELS: [RegExp, ShopCategorie][] = [
  [/\b(safety|work ?wear|workwear|ppe|protective|hi-?vis|helmet|work glove)/i, "Werk & PBM"],
  [/\b(toy|toys|kids?|baby|plush|puzzle|doll|building blocks?|lego|rc car|children)/i, "Speelgoed"],
  [/\b(jewel|necklace|bracelet|earring|pendant|ring|watch(?!.*smart)|watches)/i, "Sieraden & horloges"],
  [/\b(electronic|bluetooth|speaker|headphone|earphone|earbud|charger|charging|cable|usb|power bank|camera|smart ?watch|smart home|phone|tablet|keyboard|mouse|gadget|led strip|drone|projector|tracker)/i, "Elektronica"],
  [/\b(bag|bags|backpack|handbag|wallet|purse|shoe|shoes|sneaker|boot|boots|sandal|slipper|luggage)/i, "Tassen & schoenen"],
  [/\b(beauty|make ?up|skin ?care|hair|nail|massage|cosmetic|perfume|shaver|trimmer|brush)/i, "Beauty & verzorging"],
  [/\b(sport|fitness|yoga|gym|outdoor|camping|hiking|cycling|bike|fishing|swim|running|ball)/i, "Sport & buiten"],
  [/\b(home|kitchen|decor|garden|storage|lamp|light|lighting|bedding|towel|pet|cleaning|organizer|cup|mug|bottle)/i, "Wonen & keuken"],
  [/\b(cloth|clothing|dress|shirt|t-shirt|hoodie|jacket|pants|trousers|sweater|apparel|coat|socks|jeans|skirt|lingerie|underwear|swimwear|hat|cap|scarf|gloves)/i, "Kleding"],
  [/\b(gift|gifts|present|novelty|party)/i, "Cadeaus"],
];

/** Onze categorie uit de CJ-categorie en de naam; de categorie weegt het zwaarst. */
export function categorieVanCj(categorieCj: unknown, naamEn: unknown): ShopCategorie {
  // een slim horloge is elektronica, ook als CJ hem onder "Watches" zet
  if (/smart ?watch/i.test(`${tekst(categorieCj)} ${tekst(naamEn)}`)) return "Elektronica";
  for (const bron of [tekst(categorieCj), tekst(naamEn)]) {
    if (!bron) continue;
    for (const [re, cat] of REGELS) if (re.test(bron)) return cat;
  }
  return "Cadeaus";
}

/** Voor wie, uit de CJ-categorie ("Women's Clothing", "Men's Shoes", "Kids & Baby"). */
export function doelgroepVanCj(categorieCj: unknown, naamEn: unknown): Doelgroep | null {
  const s = `${tekst(categorieCj)} ${tekst(naamEn)}`.toLowerCase();
  if (/\b(kids?|baby|children|toddler|boys?|girls?)\b/.test(s)) return "kinderen";
  const vrouw = /\b(women'?s?|woman|ladies|female|girl)\b/.test(s);
  const man = /\b(men'?s?|man\b|male|boy)\b/.test(s);
  if (vrouw && man) return "unisex";
  if (vrouw) return "vrouwen";
  if (man) return "heren";
  return null;
}

/** Eén variant uit product/query of product/variant/query. */
export function leesCjVariant(v: unknown): CjVariant | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const sku = tekst(r.variantSku);
  const prijs = usdCentsVan(r.variantSellPrice);
  if (!sku || prijs === null) return null;
  const { kleur, maat } = kleurEnMaat(r.variantKey, r.variantNameEn);
  const foto = tekst(r.variantImage);
  return {
    vid: tekst(r.vid) || sku,
    sku,
    naam: tekst(r.variantNameEn) || tekst(r.variantKey) || sku,
    maat,
    kleur,
    foto: /^https:\/\/\S+$/.test(foto) ? foto : null,
    inkoopUsdCents: prijs,
    voorraad: voorraadVan(r.inventories),
  };
}

/** Het antwoord van product/query (data) → ons product; null als er geen bruikbare naam, foto of prijs in zit. */
export function leesCjProduct(data: unknown): CjProduct | null {
  if (!data || typeof data !== "object") return null;
  const r = data as Record<string, unknown>;
  const pid = tekst(r.pid);
  const naamEn = tekst(r.productNameEn) || tekst(r.productName);
  const fotos = fotosVan(r.bigImage, r.productImage, r.productImageSet);
  const varianten = (Array.isArray(r.variants) ? r.variants : []).map(leesCjVariant).filter((x): x is CjVariant => x !== null);
  const prijsProduct = usdCentsVan(r.sellPrice);
  const inkoop = varianten.length ? Math.max(...varianten.map((x) => x.inkoopUsdCents)) : prijsProduct;
  if (!pid || !naamEn || !fotos.length || inkoop === null || inkoop <= 0) return null;
  const categorieCj = tekst(r.categoryName);
  const gewicht = getal(r.productWeight);
  return {
    pid,
    sku: tekst(r.productSku) || tekst(r.sku) || pid,
    naamEn,
    omschrijvingEn: tekstUitHtml(r.description),
    fotos,
    categorieCj,
    categorie: categorieVanCj(categorieCj, naamEn),
    doelgroep: doelgroepVanCj(categorieCj, naamEn),
    gewichtGram: gewicht !== null && gewicht > 0 ? Math.round(gewicht) : null,
    inkoopUsdCents: inkoop,
    varianten,
  };
}

/** Eén regel uit product/list (data.list) of listV2 (data.content). */
export function leesCjTreffer(v: unknown): CjZoekTreffer | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const pid = tekst(r.pid) || tekst(r.id);
  const naamEn = tekst(r.productNameEn) || tekst(r.nameEn) || tekst(r.productName);
  const prijs = usdCentsVan(r.sellPrice);
  if (!pid || !naamEn || prijs === null || prijs <= 0) return null;
  const foto = fotosVan(r.productImage, r.bigImage)[0] ?? null;
  const categorieCj = tekst(r.categoryName);
  return { pid, sku: tekst(r.productSku) || tekst(r.sku) || pid, naamEn, foto, inkoopUsdCents: prijs, categorieCj, categorie: categorieVanCj(categorieCj, naamEn), gevoerd: Math.max(0, Math.round(getal(r.listedNum) ?? 0)) };
}

/** De vaste categorie die de beheerder koos gaat vóór de automatische; anders de automatische. */
export function categorieKeuze(gekozen: unknown, automatisch: ShopCategorie): ShopCategorie {
  return isShopCategorie(gekozen) ? gekozen : automatisch;
}

/** Een unieke sku voor onze variantentabel: "cj-<variantSku>"; CJ-sku's zijn al wereldwijd uniek. */
export const onzeSku = (variantSku: string): string => `cj-${variantSku.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
