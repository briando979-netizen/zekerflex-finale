import { describe, expect, it } from "vitest";
import { bouwProductFeed, feedItems } from "@/lib/shop/feed";
import type { CatalogusProduct } from "@/lib/shop/agent-handel";

// De productfeed voor Google Shopping, Meta en TikTok (18 nov 2026): één regel per variant, alleen koopbare
// producten met foto, nette XML (ook met & en < in een naam), verzendkosten per stuk zoals de kassa.

const basis = "https://zekerflex.com";
const product = (over: Partial<CatalogusProduct>): CatalogusProduct => ({
  id: "p1",
  slug: "oordopjes-pro",
  name: "Oordopjes Pro",
  description: "Draadloze oordopjes met **laadcase**. Zie https://x.test/info",
  category: "Elektronica",
  gender: null,
  priceCents: 2995,
  imageUploadId: "u1",
  imageUrl: "/api/shop/media/u1",
  isBundle: false,
  active: true,
  sellerTenantId: null,
  sellerStatus: null,
  sellerName: null,
  variants: [
    { id: "v1", sku: "cj-a-bk", size: null, color: "Zwart", priceCents: null, stock: 3 },
    { id: "v2", sku: "cj-a-wh", size: null, color: "Wit", priceCents: 3195, stock: 0 },
  ],
  ...over,
});

describe("productfeed", () => {
  it("één regel per variant, met prijs, voorraad, kleur en verzendkosten", () => {
    const items = feedItems([product({})], basis);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ id: "v1", groep: "p1", titel: "Oordopjes Pro – Zwart", prijsCents: 2995, opVoorraad: true, kleur: "Zwart", verzendCents: 495, link: "https://zekerflex.com/shop/oordopjes-pro" });
    expect(items[1]).toMatchObject({ id: "v2", titel: "Oordopjes Pro – Wit", prijsCents: 3195, opVoorraad: false });
    expect(items[0]!.foto).toBe("https://zekerflex.com/api/shop/beeld/p1.jpg");
    expect(items[0]!.omschrijving).toBe("Draadloze oordopjes met laadcase. Zie");
  });

  it("boven de gratis-verzendgrens 0 verzendkosten; kinderen = age_group kids; één variant = gewone titel", () => {
    const items = feedItems([product({ priceCents: 5995, gender: "kinderen", variants: [{ id: "v9", sku: "s", size: "M", color: null, priceCents: null, stock: 1 }] })], basis);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ titel: "Oordopjes Pro", verzendCents: 0, kinderen: true, maat: "M" });
  });

  it("slaat over wat niet koopbaar is: uit, zonder foto, bundel, verkoper niet goedgekeurd", () => {
    expect(feedItems([product({ active: false })], basis)).toHaveLength(0);
    expect(feedItems([product({ imageUploadId: null, imageUrl: null })], basis)).toHaveLength(0);
    expect(feedItems([product({ isBundle: true })], basis)).toHaveLength(0);
    expect(feedItems([product({ sellerTenantId: "t1", sellerStatus: "wacht" })], basis)).toHaveLength(0);
  });

  it("maakt geldige XML met de g:-velden en ontsnapt bijzondere tekens", () => {
    const { xml, aantal } = bouwProductFeed([product({ name: "Kabel <3 m> & stekker" })], basis, new Date("2026-11-18T10:00:00Z"));
    expect(aantal).toBe(2);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    expect(xml).toContain("<g:title>Kabel &lt;3 m&gt; &amp; stekker – Zwart</g:title>");
    expect(xml).toContain("<g:price>29.95 EUR</g:price>");
    expect(xml).toContain("<g:availability>out_of_stock</g:availability>");
    expect(xml).toContain("<g:identifier_exists>no</g:identifier_exists>");
    expect(xml).toContain("<g:shipping><g:country>NL</g:country><g:service>Standaard</g:service><g:price>4.95 EUR</g:price></g:shipping>");
    expect(xml).toContain("<lastBuildDate>Wed, 18 Nov 2026 10:00:00 GMT</lastBuildDate>");
    expect(xml.trim().endsWith("</channel></rss>")).toBe(true);
  });
});
