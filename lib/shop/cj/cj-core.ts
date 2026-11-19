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

// De volgorde is de voorrang: de eerste regel die ergens in "CJ-categorie + naam" past, wint. Zo gaat
// "Toys For Boys" onder "Event & Party Supplies" naar Speelgoed (niet naar Cadeaus om dat "party"),
// en een "Bean Bag Chair" onder "Furniture" naar Wonen & keuken (niet naar Tassen om dat "bag").
// Cadeaus is de laatste regel én de uitkomst als niets past.
const REGELS: [RegExp, ShopCategorie][] = [
  [/\b(safety|work ?wear|workwear|ppe|protective|hi-?vis|helmet|work glove)/i, "Werk & PBM"],
  // huisdieren vóór speelgoed: "cat toy" en "dog ball" zijn voor het dier
  [/\b(pets?\b|dog (toy|toys|bed|leash|collar|bowl|food|harness)|cat (toy|toys|tree|bed|litter|scratch\w*)|for (dogs?|cats?)\b|puppy|kitten|leash|aquarium|hamster|bird cage|litter box)/i, "Huisdieren"],
  // gaming en hobby vóór auto (een racestuur is geen auto-onderdeel) en vóór elektronica (een gaming-stoel is geen elektronica)
  [/\b(gaming|gamer|gamepad|game (controller|table)|console|playstation|xbox|nintendo|wheel stand|racing wheel|sim racing|foosball|air hockey|billiard|pool table|model kit|diamond painting|knitting|crochet|embroidery|3d pen|paint by numbers|airbrush|spray booth|hobby)/i, "Gaming & hobby"],
  [/\b(car (accessor|mount|holder|seat|wash|vacuum|sticker|charger|organizer|cover|phone)|automotive|dash ?cam|bicycle|bike|cycling|e-?bike|scooter|motorcycle|tires?\b|tyres?\b|windshield|steering wheel)/i, "Auto & fiets"],
  [/\b(phone (case|cover|holder|stand|mount|grip|strap|charger|cable)|iphone|galaxy s|screen protector|tempered glass|airpods? case|earbuds? case|selfie stick|popsocket|magsafe)/i, "Telefoon & accessoires"],
  [/\b(toy|toys|plush|puzzle|doll|building blocks?|lego|rc car|bouncy|inflatable (castle|pool|slide)|ride-?on|kids?'? (electric )?car|train track|craft kit|play ?(set|shop|kitchen|tent|house|mat)|board game|slime|stuffed animal|jigsaw|exploration (set|kit)|explorer kit)/i, "Speelgoed"],
  [/\b(baby|babies|infant|newborn|toddler|stroller|diaper|nappy|pacifier|crib|bibs?\b|teether|nursery)/i, "Baby & kind"],
  // "napkin rings" en "ring light" zijn geen sieraden
  [/\b(napkin rings?|curtain rings?|key ?rings?|ring (light|holder|binder))/i, "Wonen & keuken"],
  [/\b(jewel|necklace|bracelet|earring|pendant|rings?\b(?! light)|watch(?!.*smart)|watches)/i, "Sieraden & horloges"],
  [/\b(electronic|bluetooth|speaker|headphone|earphone|earbud|charger|charging|cable|usb|power bank|camera|smart ?watch|smart home|phone|tablet|keyboard|mouse|gadget|led strip|drone|projector|tracker|microphone|router|webcam)/i, "Elektronica"],
  [/\b(garden (hose|tools?|lights?|planter|decor)|gardening|lawn|planter|hose|tools?\b|drill|screwdriver|wrench|pliers|tape measure|ladder|diy|hardware|workbench|soldering|glue gun)/i, "Tuin & klussen"],
  [/\b(massager|massage gun|thermometer|first aid|blood pressure|oximeter|posture|orthopedic|knee (brace|pad|support)|back (brace|support)|heating pad|ear ?plugs|sleep mask|pill (box|organizer)|hot water bottle|compression socks)/i, "Gezondheid"],
  [/\b(furniture|sofa|couch|lounger|bean ?bag|chairs?\b|stools?\b|beds?\b|daybed|mattress|tables?\b|desks?\b|shel(f|ves)\b|cabinet|wardrobe|tv (stand|unit)|lowboard|sideboard|bookcase|bookshelf|curtain|rugs?\b|carpet|pillow|cushion|blanket|home|kitchen|decor|storage|lamp|lights?\b|lighting|bedding|towel|cleaning|organizer|cups?\b|mug|bottle)/i, "Wonen & keuken"],
  [/\b(bags?\b|backpack|handbag|wallet|purse|shoe|shoes|sneaker|boots?\b|sandal|slipper|luggage)/i, "Tassen & schoenen"],
  [/\b(beauty|make ?up|skin ?care|hair|nail|cosmetic|perfume|shaver|trimmer|brush)/i, "Beauty & verzorging"],
  [/\b(sport|fitness|yoga|gym|outdoor|camping|hiking|fishing|swim|running|balls?\b|darts?\b|dartboard)/i, "Sport & buiten"],
  [/\b(cloth|clothing|dress|shirt|t-shirt|hoodie|jacket|pants|trousers|sweater|apparel|coat|socks|jeans|skirt|lingerie|underwear|swimwear|hats?\b|caps?\b|scarf|gloves)/i, "Kleding"],
  [/\b(stationer(y|ies)|office|notebooks?\b|pens?\b|markers?\b|pencils?\b|planner)/i, "Werkdag"],
  [/\b(christmas|xmas|halloween|easter|party|balloons?\b|birthday|wedding|sinterklaas|new year|valentine|garland|confetti|costume|advent|thanksgiving|carnival)/i, "Feest & seizoen"],
  [/\b(gift|gifts|present|novelty)/i, "Cadeaus"],
];

/** Onze categorie uit de CJ-categorie en de naam samen; de volgorde van REGELS is de voorrang. */
export function categorieVanCj(categorieCj: unknown, naamEn: unknown): ShopCategorie {
  const bron = `${tekst(categorieCj)} ${tekst(naamEn)}`.trim();
  if (!bron) return "Cadeaus";
  // een slim horloge is elektronica, ook als CJ hem onder "Watches" zet
  if (/smart ?watch/i.test(bron)) return "Elektronica";
  for (const [re, cat] of REGELS) if (re.test(bron)) return cat;
  return "Cadeaus";
}

/** Zo lang mag een overname "bezig" zijn; daarna mag een volgende klik het slot overnemen (bv. na een herstart midden in een import). */
export const CLAIM_MAX_MS = 15 * 60_000;

/** Foto's van CJ: hooguit zoveel per product en zo groot (18 nov 2026: 6 × tot 2400 px = 258 kB gemiddeld, 721 MB per dag). */
export const CJ_MAX_FOTOS = 5;
export const CJ_FOTO_MAX_PX = 1200;

/** De upload-id uit een eigen media-url ("/api/shop/media/<id>", ook met host of querystring); null voor een vreemde url. */
export function uploadIdUitMediaUrl(url: string): string | null {
  const m = /\/api\/shop\/media\/([A-Za-z0-9_-]{8,64})(?:[/?#]|$)/.exec(url);
  return m?.[1] ?? null;
}

export type ClaimStand = { soort: "vrij" } | { soort: "product"; id: string } | { soort: "bezig"; sinds: string | null; verlopen: boolean };

/**
 * Wat staat er in KV shop:cj:pid:<pid>? Een product-id (al overgenomen), een slot `{ bezig: <tijd> }` (nog bezig,
 * of verlopen als het ouder is dan CLAIM_MAX_MS), het oude losse woord "bezig" (van vóór 18 nov: altijd verlopen) of niets.
 */
export function leesClaim(waarde: unknown, now = Date.now()): ClaimStand {
  if (waarde === null || waarde === undefined || waarde === "") return { soort: "vrij" };
  if (typeof waarde === "string") return waarde === "bezig" ? { soort: "bezig", sinds: null, verlopen: true } : { soort: "product", id: waarde };
  if (typeof waarde === "object" && typeof (waarde as { bezig?: unknown }).bezig === "string") {
    const sinds = (waarde as { bezig: string }).bezig;
    const t = Date.parse(sinds);
    return { soort: "bezig", sinds, verlopen: !Number.isFinite(t) || now - t > CLAIM_MAX_MS };
  }
  return { soort: "bezig", sinds: null, verlopen: true };
}

export interface CjVerzending {
  usdCents: number;
  dienst: string;
  /** levertijd zoals CJ hem noemt, bv. "6-12" (dagen); leeg als onbekend */
  dagen: string;
}

/** De goedkoopste dienst uit het antwoord van logistic/freightCalculate (logisticPrice in dollars). */
export function goedkoopsteVerzending(data: unknown): CjVerzending | null {
  if (!Array.isArray(data)) return null;
  let beste: CjVerzending | null = null;
  for (const r of data) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const prijs = getal(o.logisticPrice);
    if (prijs === null || prijs < 0) continue;
    const usdCents = Math.round(prijs * 100);
    if (beste && beste.usdCents <= usdCents) continue;
    beste = { usdCents, dienst: tekst(o.logisticName).slice(0, 80), dagen: tekst(o.logisticAging).slice(0, 20) };
  }
  return beste;
}

/**
 * Voorraad per variant-id uit product/stock/getInventoryByPid: data.variantInventories[] met vid en inventory[]
 * (countryCode, totalInventory). product/query geeft de voorraad lang niet altijd mee; dit wel.
 */
export function leesVoorraadPerVariant(data: unknown, land?: string): Map<string, number> {
  const uit = new Map<string, number>();
  const lijst = data && typeof data === "object" ? (data as { variantInventories?: unknown }).variantInventories : null;
  if (!Array.isArray(lijst)) return uit;
  for (const r of lijst) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const vid = tekst(o.vid);
    if (!vid) continue;
    uit.set(vid, voorraadVan(o.inventory ?? o.inventories, land));
  }
  return uit;
}

// woorden die in het Nederlands niet voorkomen; "die", "den" en "der" bewust niet (gewoon Nederlands)
const DUITS = /(und|mit|für|aus|ein|eine|einen|nicht|oder|auch|Stück|Stücke|Weiß|Schwarz|Grün|Größe|verstellbar|klappbar)|[ßäöü]/i;

/** Lijkt deze tekst Duits? Het model laat een Duitse bron soms half staan ("Goldaufkleber 16 Stücke"); dan telt de vertaling niet. */
export function lijktDuits(t: string): boolean {
  return DUITS.test(t);
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

/** Een product dat al een van de sku's van een nieuwe import heeft: kandidaat om te hergebruiken (zie herbruikbareWees). */
export interface WeesKandidaat {
  id: string;
  slug: string;
  active: boolean;
  heeftKoppeling: boolean;
  inLijst: boolean;
  verkocht: boolean;
}

/**
 * Een halve import hergebruiken (19 nov 2026). Breekt de app af tussen shopProduct.create en de koppeling (herstart,
 * crash), dan blijft een "wees" achter: een inactief product met de sku's, zonder foto, zonder koppeling in KV en zonder
 * pid-sleutel. De volgende import van hetzelfde CJ-product maakte dan een tweede product met 0 varianten (de sku's
 * bestonden al) dat nooit aan kon. Nu wordt die wees aangevuld en gekoppeld, maar alleen als álle gevonden sku's bij
 * precies één product horen en dat product inactief is, geen koppeling heeft, niet in de CJ-lijst staat en nooit
 * verkocht is. In elk ander geval (een echt, actief product met die sku; twee producten) blijft alles zoals het was.
 */
export function herbruikbareWees(kandidaten: readonly WeesKandidaat[]): WeesKandidaat | null {
  const uniek = [...new Map(kandidaten.map((k) => [k.id, k])).values()];
  const w = uniek[0];
  if (!w || uniek.length !== 1) return null;
  if (w.active || w.heeftKoppeling || w.inLijst || w.verkocht) return null;
  return w;
}
