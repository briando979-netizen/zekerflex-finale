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

/** Breedtes voor next/image in het productraster: 2 kolommen op de telefoon, 3 op een tablet, 4 op een computer. */
export const GRID_SIZES = "(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw";
