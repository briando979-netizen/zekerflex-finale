import { describe, expect, it, vi } from "vitest";

// De sitemap geeft alleen een lastmod waar de echte datum bekend is. "Nu" maakte van elke uitrol (en elke 10 minuten)
// een wijziging van de hele site: gemeten 12 nov 2026, 320 van 337 regels op het tijdstip van de uitrol.

vi.mock("@/lib/prisma", () => ({
  prisma: { shopProduct: { findMany: async () => [{ slug: "werkschoen", updatedAt: new Date("2026-10-01T10:00:00+02:00") }] } },
}));
vi.mock("@/lib/public-shifts", () => ({
  publicOpenShifts: async () => [{ id: "klus1", createdAt: new Date("2026-11-10T08:00:00+01:00") }],
}));
vi.mock("@/lib/ontwerp/paginas-store", () => ({
  paginaLijst: async () => [
    { slug: "actie", live: { noindex: false }, liveVertalingen: { en: {} }, gepubliceerd: "2026-11-05T12:00:00.000Z" },
    { slug: "nooit-gepubliceerd-datum", live: { noindex: false }, gepubliceerd: null },
    { slug: "verborgen", live: { noindex: true }, gepubliceerd: "2026-11-05T12:00:00.000Z" },
  ],
}));
vi.mock("@/lib/rijschool/vindbaar", () => ({ rijschoolPadenVoorSitemap: async () => [] }));

import sitemap from "@/app/sitemap";

describe("sitemap", () => {
  it("geen lastmod 'nu': vaste pagina's zonder datum laten hem weg, de rest houdt zijn echte datum", async () => {
    const begin = Date.now();
    const regels = await sitemap();
    const pad = (p: string) => regels.find((r) => r.url.endsWith(p));

    // vaste pagina's: geen datum
    expect(pad("/prijzen")?.lastModified).toBeUndefined();
    expect(pad("/contact")?.lastModified).toBeUndefined();
    // met een echte datum: die datum
    expect((pad("/shop/werkschoen")?.lastModified as Date).toISOString()).toBe("2026-10-01T08:00:00.000Z");
    expect((pad("/klussen/klus1")?.lastModified as Date).toISOString()).toBe("2026-11-10T07:00:00.000Z");
    expect((pad("/p/actie")?.lastModified as Date).toISOString()).toBe("2026-11-05T12:00:00.000Z");
    expect((pad("/p/actie/en")?.lastModified as Date).toISOString()).toBe("2026-11-05T12:00:00.000Z");
    expect(pad("/p/nooit-gepubliceerd-datum")?.lastModified).toBeUndefined();
    expect(pad("/p/verborgen")).toBeUndefined();

    // geen enkele regel krijgt het tijdstip van het maken van de sitemap
    const vers = regels.filter((r) => r.lastModified instanceof Date && r.lastModified.getTime() >= begin - 1000);
    expect(vers.map((r) => r.url)).toEqual([]);
    expect(regels.length).toBeGreaterThan(100);
  });

  it("blijft tien minuten in het geheugen: een tweede aanvraag krijgt dezelfde lijst zonder de database opnieuw te lezen", async () => {
    const eerste = await sitemap();
    expect(await sitemap()).toBe(eerste);
  });
});
