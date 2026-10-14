import { describe, expect, it } from "vitest";
import { canonical, productJsonLd } from "@/lib/seo";

// canonical() previously returned just { openGraph: { url } } — since Next.js
// metadata merging REPLACES a parent segment's `openGraph` object wholesale
// the moment a child declares its own `openGraph` key (it doesn't deep-merge
// nested objects), every one of the 13 pages spreading `...canonical(path)`
// was silently clobbering the root layout's og:type/og:image/og:site_name/
// og:locale down to just a bare url. This guards against that regressing.
describe("canonical", () => {
  it("returns a canonical alternate for the given path", () => {
    expect(canonical("/prijzen").alternates.canonical).toBe("/prijzen");
  });

  it("returns a full OpenGraph block, not just a url", () => {
    const { openGraph } = canonical("/prijzen");
    expect(openGraph).toMatchObject({
      type: "website",
      siteName: "ZekerFlex",
      locale: "nl_NL",
    });
    expect(openGraph.url).toContain("/prijzen");
    expect(Array.isArray(openGraph.images)).toBe(true);
    expect((openGraph.images as unknown[]).length).toBeGreaterThan(0);
  });

  it("includes a page-specific title/description when given one", () => {
    const { openGraph } = canonical("/", { title: "Custom title", description: "Custom description" });
    expect(openGraph.title).toBe("Custom title");
    expect(openGraph.description).toBe("Custom description");
  });

  it("omits title/description when none is given, rather than inventing one", () => {
    const { openGraph } = canonical("/prijzen");
    expect(openGraph.title).toBeUndefined();
    expect(openGraph.description).toBeUndefined();
  });

  it("uses a page-specific image when given one (e.g. a shop product photo)", () => {
    const { openGraph } = canonical("/shop/werkhandschoenen", { title: "Werkhandschoenen", image: "/shop/gloves.jpg" });
    expect(openGraph.images).toEqual([
      { url: "/shop/gloves.jpg", width: 1200, height: 1200, alt: "Werkhandschoenen" },
    ]);
  });
});

describe("productJsonLd", () => {
  const BASE = {
    name: "Werkhandschoenen met grip",
    description: "Ademende nitril-coating, sterke grip.",
    slug: "werkhandschoenen-grip",
    priceCents: 1295,
    inStock: true,
  };

  it("builds a schema.org Product with an EUR Offer", () => {
    const ld = productJsonLd(BASE);
    expect(ld["@type"]).toBe("Product");
    expect(ld.offers).toMatchObject({
      "@type": "Offer",
      priceCurrency: "EUR",
      price: "12.95",
      availability: "https://schema.org/InStock",
    });
  });

  it("marks out-of-stock products accordingly rather than always claiming availability", () => {
    const ld = productJsonLd({ ...BASE, inStock: false });
    expect((ld.offers as { availability: string }).availability).toBe("https://schema.org/OutOfStock");
  });

  it("resolves a relative product image against the site origin", () => {
    const ld = productJsonLd({ ...BASE, imageUrl: "/shop/gloves.jpg" });
    expect(ld.image).toMatch(/^https?:\/\/.*\/shop\/gloves\.jpg$/);
  });

  it("falls back to the default OG image when the product has none", () => {
    const ld = productJsonLd({ ...BASE, imageUrl: null });
    expect(ld.image).toMatch(/\/opengraph-image$/);
  });

  it("still emits a single Offer when every variant shares the same price", () => {
    const ld = productJsonLd({ ...BASE, variants: [{ priceCents: 1295, stock: 3 }, { priceCents: 1295, stock: 0 }] });
    expect(ld.offers).toMatchObject({ "@type": "Offer", price: "12.95", availability: "https://schema.org/InStock" });
  });

  it("emits an AggregateOffer with low/high price when variants price differently, instead of one mismatched price", () => {
    const ld = productJsonLd({
      ...BASE,
      variants: [
        { priceCents: 1295, stock: 2 },
        { priceCents: 1495, stock: 0 },
      ],
    });
    expect(ld.offers).toMatchObject({
      "@type": "AggregateOffer",
      priceCurrency: "EUR",
      lowPrice: "12.95",
      highPrice: "14.95",
      offerCount: 2,
      availability: "https://schema.org/InStock",
    });
  });

  it("rolls up availability from the variants (out of stock only when every variant is)", () => {
    const ld = productJsonLd({ ...BASE, inStock: true, variants: [{ priceCents: 1295, stock: 0 }, { priceCents: 1295, stock: 0 }] });
    expect((ld.offers as { availability: string }).availability).toBe("https://schema.org/OutOfStock");
  });

  it("ignores the stale top-level inStock flag once variants are given", () => {
    const ld = productJsonLd({ ...BASE, inStock: false, variants: [{ priceCents: 1295, stock: 5 }] });
    expect((ld.offers as { availability: string }).availability).toBe("https://schema.org/InStock");
  });
});
