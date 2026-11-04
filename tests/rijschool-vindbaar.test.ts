import { beforeEach, describe, expect, it, vi } from "vitest";

// Vindbaar in Google: de sitemap van een rijschoolsite (eigen domein of
// zekerflex.com) en welke rijscholen in de sitemap van ZekerFlex staan.

const scholen = [
  { id: "r1", slug: "jansen", tenantId: "t1", proeflesOnline: true, updatedAt: new Date("2026-11-01T10:00:00Z") },
  { id: "r2", slug: "pietersen", tenantId: "t2", proeflesOnline: false, updatedAt: new Date("2026-11-02T10:00:00Z") },
  { id: "r3", slug: "eigen-domein", tenantId: "t3", proeflesOnline: true, updatedAt: new Date("2026-11-03T10:00:00Z") },
  { id: "r4", slug: "test-bedrijven", tenantId: "t4", proeflesOnline: true, updatedAt: new Date("2026-11-04T10:00:00Z") },
];
const findMany = vi.fn(async () => scholen);
vi.mock("@/lib/prisma", () => ({ prisma: { rijschool: { findMany: (...a: unknown[]) => findMany(...(a as [])) } } }));
vi.mock("@/lib/rijschool/domein", () => ({ eigenAdres: async (id: string) => (id === "r3" ? "https://rijschooleigen.nl" : null) }));
vi.mock("@/lib/billing/comp", () => ({ isCompTenant: async (t: string) => t === "t4" }));

import { openbarePaden, openbareUrls, rijschoolPadenVoorSitemap, sitemapXml } from "@/lib/rijschool/vindbaar";

beforeEach(() => findMany.mockClear());

describe("sitemap van een rijschoolsite", () => {
  it("de voorpagina, en de proefles alleen als die online te plannen is", () => {
    expect(openbarePaden({ proeflesOnline: true })).toEqual(["", "/proefles"]);
    expect(openbarePaden({ proeflesOnline: false })).toEqual([""]);
  });

  it("de adressen zijn de canonical: op het eigen domein of op zekerflex.com", () => {
    const r = { slug: "jansen", proeflesOnline: true };
    expect(openbareUrls(r, "https://rijschooljansen.nl", "https://zekerflex.com")).toEqual(["https://rijschooljansen.nl/", "https://rijschooljansen.nl/proefles"]);
    expect(openbareUrls(r, null, "https://zekerflex.com")).toEqual(["https://zekerflex.com/rijschool/jansen", "https://zekerflex.com/rijschool/jansen/proefles"]);
  });

  it("geldige XML met lastmod; tekens worden veilig gemaakt", () => {
    const xml = sitemapXml(["https://a.nl/", "https://a.nl/x?a=1&b=2"], new Date("2026-11-04T12:00:00Z"));
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain("<url><loc>https://a.nl/</loc><lastmod>2026-11-04T12:00:00.000Z</lastmod></url>");
    expect(xml).toContain("<loc>https://a.nl/x?a=1&amp;b=2</loc>");
    expect(xml.trim().endsWith("</urlset>")).toBe(true);
  });
});

describe("rijscholen in de sitemap van zekerflex.com", () => {
  it("alleen online, zonder actief eigen domein en zonder kosteloze accounts", async () => {
    const paden = await rijschoolPadenVoorSitemap();
    expect(paden.map((p) => p.pad)).toEqual(["/rijschool/jansen", "/rijschool/jansen/proefles", "/rijschool/pietersen"]);
    expect(paden[0]?.bijgewerkt.toISOString()).toBe("2026-11-01T10:00:00.000Z");
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { online: true } }));
  });
});
