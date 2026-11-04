// Het product zoals de etalage het toont (kaart, raster, uitgelicht). Puur: de
// server zet de databaserij om (app/shop/page.tsx), zodat alleen wat de kaart
// nodig heeft naar de browser gaat.

export type ShopCategory = "Werk & PBM" | "Kleding" | "Werkdag" | "Cadeaus";
export type ShopVariant = { id: string; size: string | null; color: string | null; priceCents: number | null; stock: number };
export type ShopCardProduct = {
  id: string;
  slug?: string | undefined;
  name: string;
  description: string;
  price: number;
  category: ShopCategory;
  gender?: string | null;
  label?: string | null;
  imageUrl?: string | null;
  /** tweede foto (iemand die het draagt), getoond als je over de kaart beweegt */
  altImageUrl?: string | null;
  variants: ShopVariant[];
};

const oneSize = (id: string, stock = 10): ShopVariant[] => [{ id: `${id}-default`, size: null, color: null, priceCents: null, stock }];

/** Databaserij (of API-item) → etalageproduct. */
export function toShopProduct(it: Record<string, unknown>): ShopCardProduct {
  const imageUrl = typeof it.imageUrl === "string" ? it.imageUrl : null;
  const alt = typeof it.modelPhotoUrl === "string" && it.modelPhotoUrl !== imageUrl ? it.modelPhotoUrl : null;
  return {
    id: String(it.id),
    slug: typeof it.slug === "string" ? it.slug : undefined,
    name: String(it.name),
    description: String(it.description ?? ""),
    price: Number(it.priceCents) / 100,
    category: (it.category as ShopCategory) ?? "Werkdag",
    gender: typeof it.gender === "string" ? it.gender : null,
    label: typeof it.badge === "string" ? it.badge : null,
    imageUrl,
    altImageUrl: alt,
    variants:
      Array.isArray(it.variants) && it.variants.length > 0
        ? (it.variants as Record<string, unknown>[]).map((v) => ({
            id: String(v.id),
            size: typeof v.size === "string" ? v.size : null,
            color: typeof v.color === "string" ? v.color : null,
            priceCents: typeof v.priceCents === "number" ? v.priceCents : null,
            stock: Number(v.stock ?? 0),
          }))
        : oneSize(String(it.id), Number(it.stock ?? 0)),
  };
}

export const shopMoney = (euros: number): string => `€ ${euros.toFixed(2).replace(".", ",")}`;

/** "12,95" in twee delen voor de grote prijs op een kaart: ["12", "95"]; hele euro's als ["12", "-"]. */
export function priceParts(euros: number): [string, string] {
  const [whole = "0", frac = "00"] = euros.toFixed(2).split(".");
  return [whole, frac === "00" ? "-" : frac];
}

/** Voorraad zoals de kaart hem toont: genoeg, weinig (5 of minder) of uitverkocht. */
export function cardStock(p: Pick<ShopCardProduct, "variants">): { kind: "ruim" | "weinig" | "uit"; n: number } {
  const n = p.variants.reduce((s, v) => s + Math.max(0, v.stock), 0);
  if (n <= 0) return { kind: "uit", n: 0 };
  return { kind: n <= 5 ? "weinig" : "ruim", n };
}

/** Maten in de volgorde die mensen verwachten: XS < S < M < L < XL, 38 < 39, "39-42" op zijn eerste getal. */
const LETTER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"];
export function bySize(a: string, b: string): number {
  const la = LETTER.indexOf(a.toUpperCase());
  const lb = LETTER.indexOf(b.toUpperCase());
  if (la >= 0 && lb >= 0) return la - lb;
  if (la >= 0 !== lb >= 0) return la >= 0 ? -1 : 1; // letters vóór getallen
  const na = parseFloat(a);
  const nb = parseFloat(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb || a.length - b.length; // 39 vóór 39-42
  return a.localeCompare(b, "nl");
}

/** Breedtes voor next/image in het productraster: 2 kolommen op de telefoon, 3 op een tablet en naast de filters, 4 op een breed scherm. */
export const GRID_SIZES = "(min-width: 1280px) 22vw, (min-width: 640px) 33vw, 50vw";
