import { LEGE_INVOER, MAX_PER_PRODUCT, isUitverkocht, maxBestelbaar, zichtbareProducten, type BestelInvoer } from "@/lib/sites/winkel";
import type { SiteProduct, Winkel } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// De winkelmand van een klantsite (4 nov 2026, opdracht van de eigenaar: "een
// webshop met winkelmand, filters en alles erop"). Zonder scripts: de mand staat
// in één functioneel cookie (zf_mand, alleen voor deze site, geen volgcookie),
// en verandert met gewone links en formulieren (GET …/mand?voeg=…, dan terug naar
// …/mand). Prijzen staan er nooit in: die komen bij elke stap van de site zelf.
// Puur: lezen, schrijven en rekenen; de route zet het cookie (lib/sites/serve.ts).
// ---------------------------------------------------------------------------

export const MAND_COOKIE = "zf_mand";
/** Hoeveel verschillende regels er in een mand passen (het cookie blijft ruim onder 4 kB). */
export const MAX_REGELS = 30;
/** Per product hoogstens zoveel varianten (maat/kleur) naast elkaar. */
export const MAX_VARIANTEN = 10;

export interface MandRegel {
  productId: string;
  aantal: number;
  /** de gekozen waarde per optie (maat, kleur), in de volgorde van de opties */
  keuzes: string[];
}

const isProductId = (s: string) => /^p[a-z0-9]{6,20}$/.test(s);

/** Het cookie lezen uit de Cookie-kop; alles wat niet klopt valt weg. */
export function leesMand(cookieKop: string | null | undefined): MandRegel[] {
  const ruw = (cookieKop ?? "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${MAND_COOKIE}=`))
    ?.slice(MAND_COOKIE.length + 1);
  if (!ruw) return [];
  let tekst = "";
  try {
    tekst = decodeURIComponent(ruw);
  } catch {
    return [];
  }
  const uit: MandRegel[] = [];
  for (const deel of tekst.split("|").slice(0, MAX_REGELS)) {
    const [id = "", n = "", ...k] = deel.split("~");
    const aantal = Math.floor(Number(n));
    if (!isProductId(id) || !(aantal >= 1)) continue;
    uit.push({ productId: id, aantal: Math.min(MAX_PER_PRODUCT, aantal), keuzes: k.slice(0, 2).map((w) => w.slice(0, 40)) });
  }
  return uit;
}

/** De waarde van het cookie (zonder naam en attributen). */
export function schrijfMand(regels: MandRegel[]): string {
  const veilig = (s: string) => s.replace(/[~|]/g, " ");
  return encodeURIComponent(
    regels
      .slice(0, MAX_REGELS)
      .map((r) => [r.productId, String(r.aantal), ...r.keuzes.map(veilig)].join("~"))
      .join("|"),
  );
}

/** De Set-Cookie-kop: alleen voor deze site (`pad`), 30 dagen, niet leesbaar voor scripts. Leeg = weg. */
export function mandCookie(regels: MandRegel[], pad: string, https: boolean): string {
  const waarde = regels.length ? schrijfMand(regels) : "";
  return `${MAND_COOKIE}=${waarde}; Path=${pad}; Max-Age=${regels.length ? 30 * 86_400 : 0}; HttpOnly; SameSite=Lax${https ? "; Secure" : ""}`;
}

const zelfde = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Een product erbij: dezelfde keuze telt op, een andere maat of kleur wordt een eigen regel. */
export function voegToe(regels: MandRegel[], nieuw: MandRegel): MandRegel[] {
  const i = regels.findIndex((r) => r.productId === nieuw.productId && zelfde(r.keuzes, nieuw.keuzes));
  if (i >= 0) return regels.map((r, j) => (j === i ? { ...r, aantal: Math.min(MAX_PER_PRODUCT, r.aantal + nieuw.aantal) } : r));
  if (regels.filter((r) => r.productId === nieuw.productId).length >= MAX_VARIANTEN || regels.length >= MAX_REGELS) return regels;
  return [...regels, { ...nieuw, aantal: Math.min(MAX_PER_PRODUCT, nieuw.aantal) }];
}

/** Regel `i` op een nieuw aantal; 0 haalt hem weg. */
export function zetAantal(regels: MandRegel[], i: number, aantal: number): MandRegel[] {
  if (!(i >= 0 && i < regels.length)) return regels;
  const n = Math.floor(aantal);
  if (!(n >= 1)) return regels.filter((_, j) => j !== i);
  return regels.map((r, j) => (j === i ? { ...r, aantal: Math.min(MAX_PER_PRODUCT, n) } : r));
}

export interface MandRegelInfo extends MandRegel {
  /** de plek in de mand (voor wijzigen en verwijderen) */
  index: number;
  product: SiteProduct;
  /** "M, Zwart" */
  variant: string;
  totaalCents: number;
  /** waarom deze regel niet besteld kan worden ("Uitverkocht", "Nog 2 op voorraad"), of null */
  probleem: string | null;
}

/**
 * De mand tegen de winkel zoals hij nu is: producten die weg of verborgen zijn vallen af,
 * een uitverkocht product of te weinig voorraad krijgt een melding.
 */
export function mandMetProducten(w: Winkel, regels: MandRegel[]): { regels: MandRegelInfo[]; subtotaalCents: number; aantal: number } {
  const producten = new Map(zichtbareProducten(w).map((p) => [p.id, p]));
  const perProduct = new Map<string, number>();
  for (const r of regels) perProduct.set(r.productId, (perProduct.get(r.productId) ?? 0) + r.aantal);
  const uit: MandRegelInfo[] = [];
  regels.forEach((r, index) => {
    const product = producten.get(r.productId);
    if (!product) return;
    const opties = product.opties ?? [];
    const keuzes = opties.map((o, k) => (o.waarden.includes(r.keuzes[k] ?? "") ? (r.keuzes[k] as string) : ""));
    const totaal = perProduct.get(r.productId) ?? r.aantal;
    const probleem = isUitverkocht(product)
      ? "Uitverkocht"
      : product.voorraad != null && totaal > maxBestelbaar(product)
        ? `Nog ${product.voorraad} op voorraad`
        : keuzes.some((k) => !k)
          ? `Kies ${opties.find((_, k) => !keuzes[k])?.naam.toLowerCase() ?? "een optie"}`
          : null;
    uit.push({ ...r, keuzes, index, product, variant: keuzes.filter(Boolean).join(", "), totaalCents: product.prijsCents * r.aantal, probleem });
  });
  return { regels: uit, subtotaalCents: uit.filter((r) => !r.probleem).reduce((s, r) => s + r.totaalCents, 0), aantal: uit.reduce((s, r) => s + r.aantal, 0) };
}

/**
 * Het bestelformulier gevuld uit de mand. Elke regel krijgt een sleutel: het product-id, en voor een
 * tweede maat of kleur van hetzelfde product "<id>-1", "<id>-2" (lib/sites/winkel.ts leesBestelForm).
 */
export function mandNaarInvoer(regels: MandRegelInfo[]): BestelInvoer {
  const aantallen: Record<string, number> = {};
  const keuzes: Record<string, string[]> = {};
  const teller = new Map<string, number>();
  for (const r of regels) {
    if (r.probleem) continue;
    const n = teller.get(r.productId) ?? 0;
    teller.set(r.productId, n + 1);
    const sleutel = n === 0 ? r.productId : `${r.productId}-${n}`;
    aantallen[sleutel] = r.aantal;
    if (r.keuzes.length) keuzes[sleutel] = r.keuzes;
  }
  return { ...LEGE_INVOER, aantallen, keuzes };
}
