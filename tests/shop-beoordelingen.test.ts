import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Beoordelingen in de webshop, zoals bol.com (stap 2, 15 nov 2026), maar alleen echte: wie het product kocht en de bestelling
// verzonden kreeg, via het getekende token uit de mail; elke beoordeling wacht op de beheerder (lib/shop/beoordeling.ts).

vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "test-geheim-test-geheim-test-geheim" } }));
const orderZoek = vi.fn();
const variantZoek = vi.fn();
const eigenZoek = vi.fn();
const upsert = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shopOrder: { findUnique: (...a: unknown[]) => orderZoek(...a) },
    shopProductVariant: { findMany: (...a: unknown[]) => variantZoek(...a) },
    shopReview: { findMany: (...a: unknown[]) => eigenZoek(...a), upsert: (...a: unknown[]) => upsert(...a) },
  },
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => undefined }));
vi.mock("@/lib/http/request", () => ({ clientIp: () => "203.0.113.9" }));

import { cijferTekst, isBeoordelingStatus, magBeoordelen, samenvatting, sterVulling, weergaveNaam } from "@/lib/shop/beoordeling";
import { bonToken } from "@/lib/shop/bon-token";
import { productJsonLd } from "@/lib/seo";
import { POST } from "@/app/api/shop/orders/[id]/beoordeling/route";

const lees = (f: string) => readFileSync(join(process.cwd(), f), "utf8").split("\r\n").join("\n");

afterEach(() => vi.clearAllMocks());

describe("de regels", () => {
  it("toont de koper als voornaam en de eerste letter van de achternaam, zonder tussenvoegsel", () => {
    expect(weergaveNaam("sanne", "van der Berg")).toBe("Sanne B.");
    expect(weergaveNaam("Jan Willem", "de Vries")).toBe("Jan V.");
    expect(weergaveNaam("Ali", "")).toBe("Ali");
    expect(weergaveNaam("  ", "Bakker")).toBe("Klant");
  });

  it("rekent het gemiddelde en de verdeling, en slaat onzin over", () => {
    expect(samenvatting([5, 4, 4, 0, 6])).toEqual({ gemiddelde: 4.3, aantal: 3, verdeling: [0, 0, 0, 2, 1] });
    expect(samenvatting([])).toEqual({ gemiddelde: 0, aantal: 0, verdeling: [0, 0, 0, 0, 0] });
    expect(sterVulling(3.5)).toEqual([1, 1, 1, 0.5, 0]);
    expect(cijferTekst(4.3)).toBe("4,3");
  });

  it("kent alleen de echte statussen en beoordelen kan pas na verzending", () => {
    expect(isBeoordelingStatus("zichtbaar")).toBe(true);
    expect(isBeoordelingStatus("constructor")).toBe(false);
    expect(magBeoordelen("SHIPPED")).toBe(true);
    for (const s of ["PENDING_PAYMENT", "RECEIVED", "CONFIRMED", "CANCELLED", "PAYMENT_FAILED"]) expect(magBeoordelen(s)).toBe(false);
  });
});

describe("POST /api/shop/orders/:id/beoordeling", () => {
  const verzonden = { status: "SHIPPED", firstName: "Sanne", lastName: "van der Berg", itemsJson: [{ name: "Hoodie", priceCents: 4995, qty: 1, variantId: "var_1" }] };
  const stuur = (body: Record<string, unknown>, id = "order_1") =>
    POST(new Request(`https://zekerflex.test/api/shop/orders/${id}/beoordeling`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
  const goed = () => ({ t: bonToken("order_1"), productId: "prod_1", sterren: 5, tekst: "  Zit lekker en is goed warm.  " });

  function bestelling(order: unknown) {
    orderZoek.mockResolvedValue(order);
    variantZoek.mockResolvedValue([{ id: "var_1", product: { id: "prod_1", name: "Hoodie", slug: "hoodie", imageUrl: null } }]);
    eigenZoek.mockResolvedValue([]);
    upsert.mockResolvedValue({});
  }

  it("slaat een echte beoordeling op; die wacht op de beheerder", async () => {
    bestelling(verzonden);
    const res = await stuur(goed());
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0]?.[0] as { where: unknown; create: Record<string, unknown>; update: Record<string, unknown> };
    expect(arg.where).toEqual({ orderId_productId: { orderId: "order_1", productId: "prod_1" } });
    expect(arg.create).toMatchObject({ orderId: "order_1", productId: "prod_1", sterren: 5, tekst: "Zit lekker en is goed warm.", naam: "Sanne B.", status: "wacht" });
    // opnieuw sturen past hem aan en zet hem weer op wachten
    expect(arg.update).toMatchObject({ status: "wacht", sterren: 5 });
  });

  it("zonder geldig token: 404, geen 403 (CrowdSec), en niets opgeslagen", async () => {
    bestelling(verzonden);
    const res = await stuur({ ...goed(), t: bonToken("ander_order") });
    expect(res.status).toBe(404);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("vóór verzending kan het nog niet", async () => {
    bestelling({ ...verzonden, status: "RECEIVED" });
    const res = await stuur(goed());
    expect(res.status).toBe(412);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("alleen een product uit de eigen bestelling", async () => {
    bestelling(verzonden);
    const res = await stuur({ ...goed(), productId: "prod_ander" });
    expect(res.status).toBe(422);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("weigert te weinig tekst en sterren buiten 1 tot 5", async () => {
    bestelling(verzonden);
    expect((await stuur({ ...goed(), tekst: "kort" })).status).toBe(422);
    expect((await stuur({ ...goed(), sterren: 6 })).status).toBe(422);
    expect((await stuur({ ...goed(), sterren: 0 })).status).toBe(422);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("op de site", () => {
  it("geeft Google alleen sterren als er echte beoordelingen zijn (met de Nederlandse datum)", () => {
    const basis = { name: "Hoodie", description: "Warm", slug: "hoodie", priceCents: 4995, inStock: true };
    expect(productJsonLd(basis)).not.toHaveProperty("aggregateRating");
    const met = productJsonLd({
      ...basis,
      beoordelingen: { samenvatting: { gemiddelde: 4.3, aantal: 3 }, lijst: [{ naam: "Sanne B.", sterren: 5, tekst: "Top", datum: "2026-11-20T23:30:00.000Z" }] },
    });
    expect(met.aggregateRating).toEqual({ "@type": "AggregateRating", ratingValue: "4.3", reviewCount: 3, bestRating: 5, worstRating: 1 });
    expect(met.review).toEqual([
      { "@type": "Review", author: { "@type": "Person", name: "Sanne B." }, datePublished: "2026-11-21", reviewBody: "Top", reviewRating: { "@type": "Rating", ratingValue: 5, bestRating: 5, worstRating: 1 } },
    ]);
  });

  it("de productpagina en de kaartjes tonen alleen goedgekeurde beoordelingen, en zeggen het eerlijk als er geen zijn", () => {
    const server = lees("lib/shop/beoordeling-server.ts");
    expect(server.match(/status: "zichtbaar"/g)).toHaveLength(2);
    const pdp = lees("components/marketing/ProductDetail.tsx");
    expect(pdp).toContain("t.shop.beoordelingGeen");
    expect(pdp).toContain("t.shop.beoordelingKoper");
    expect(lees("app/shop/[slug]/page.tsx")).toContain("beoordelingen.samenvatting.aantal > 0 ? { beoordelingen } : {}");
    for (const f of ["app/shop/page.tsx", "app/shop/zakelijk/page.tsx"]) expect(lees(f)).toContain("beoordelingPerProduct(rows.map((r) => r.id))");
  });

  it("beoordelen alleen met het token of als ingelogde koper, en het beheer ziet geen e-mailadres", () => {
    const pagina = lees("app/shop/bestelling/[id]/page.tsx");
    expect(pagina).toContain("koperToken = token;");
    expect(pagina).toContain("koperToken = bonToken(id);");
    expect(pagina).toMatch(/order && koperToken && magBeoordelen\(order\.status\)/);
    const lijst = lees("app/api/admin/shop/beoordelingen/route.ts");
    expect(lijst).toContain('withAdminAccess(["PLATFORM_ADMIN"]');
    expect(lijst).not.toMatch(/email/);
    expect(lees("app/api/admin/shop/beoordelingen/[id]/route.ts").match(/withAdminAccess<\{ id: string \}>\(\["PLATFORM_ADMIN"\]/g)).toHaveLength(2);
  });

  it("de migratie maakt alleen de nieuwe tabel, met één beoordeling per product per bestelling", () => {
    const sql = lees("prisma/migrations/20261115190000_shop_review/migration.sql");
    expect(sql).toContain('CREATE TABLE "ShopReview"');
    expect(sql).toContain('CREATE UNIQUE INDEX "ShopReview_orderId_productId_key"');
    expect(sql).not.toMatch(/DROP|ALTER TABLE "Shop(Product|Order)"/);
  });

  it("alle nieuwe teksten staan in het Nederlands én het Engels", () => {
    const nl = lees("lib/i18n/dictionaries.ts");
    const en = lees("lib/i18n/dictionary-en.ts");
    for (const k of ["beoordelingEen", "beoordelingMeer", "sterrenVan5", "beoordelingGeen", "beoordelingGeenUitleg", "beoordelingKoper", "beoordelingUitleg"]) {
      expect(nl, k).toMatch(new RegExp(`\\b${k}: `));
      expect(en, k).toMatch(new RegExp(`\\b${k}: `));
    }
  });
});
