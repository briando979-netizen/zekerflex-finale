import { describe, expect, it } from "vitest";
import { bySize, shopMoney, toShopProduct } from "@/components/marketing/shop-product";

// Het etalageproduct van de vernieuwde shop: wat de server naar de browser stuurt.

describe("etalageproduct", () => {
  it("zet een databaserij om en laat alleen een échte tweede foto door", () => {
    const p = toShopProduct({ id: "p1", slug: "hoodie", name: "Hoodie", description: "Warm", priceCents: 6900, category: "Kleding", badge: "Nieuw", imageUrl: "/a.jpg", modelPhotoUrl: "/a.jpg", variants: [] });
    expect(p).toMatchObject({ price: 69, label: "Nieuw", imageUrl: "/a.jpg", altImageUrl: null });
    expect(p.variants).toEqual([{ id: "p1-default", size: null, color: null, priceCents: null, stock: 0 }]);
    expect(toShopProduct({ id: "p2", name: "X", priceCents: 100, imageUrl: "/a.jpg", modelPhotoUrl: "/b.jpg" }).altImageUrl).toBe("/b.jpg");
  });

  it("sorteert maten zoals mensen verwachten", () => {
    expect(["XL", "39-42", "S", "38", "M", "43-46", "XXL", "110"].sort(bySize)).toEqual(["S", "M", "XL", "XXL", "38", "39-42", "43-46", "110"]);
  });

  it("schrijft bedragen op zijn Nederlands", () => {
    expect(shopMoney(9.95)).toBe("€ 9,95");
    expect(shopMoney(69)).toBe("€ 69,00");
  });
});
