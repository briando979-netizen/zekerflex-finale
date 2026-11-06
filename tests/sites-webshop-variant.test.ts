import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// Website bouwen en Webshop openen zijn twee aparte varianten: een bedrijf kan van
// elke soort één hebben, ze delen de motor maar niet het adres of de inhoud.

await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  process.env.SITE_BUILDER_DIR = mkdtempSync(join(tmpdir(), "zf-webshop-"));
});

const store = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => structuredClone(store.get(k) ?? null),
  kvSet: async (k: string, v: unknown) => void store.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void store.delete(k),
  kvListValues: async (prefix: string) => [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    keyValueStore: {
      create: async ({ data }: { data: { key: string; value: unknown } }) => {
        if (store.has(data.key)) throw new Prisma.PrismaClientKnownRequestError("dubbel", { code: "P2002", clientVersion: "5" });
        store.set(data.key, data.value);
        return data;
      },
    },
  },
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

import { createSite, siteOfTenant, winkelSiteOf } from "@/lib/sites/store";
import { siteSaveSchema } from "@/lib/sites/schema";
import { WEBSHOP_TEMPLATES, voorwaardenTekst, webshopPages } from "@/lib/sites/webshop-templates";

const by = { userId: "u1", name: "Jan" };
const bedrijf = { naam: "Studio Linde", kvk: "12345678", straat: "Lindelaan 4", postcode: "7461 AA", plaats: "Rijssen", telefoon: "0548 123456", email: "hallo@studiolinde.nl" };

beforeEach(() => store.clear());

describe("website en webshop naast elkaar", () => {
  it("een bedrijf kan een website én een webshop hebben, elk met een eigen adres", async () => {
    const website = await createSite("t1", by, { templateId: "algemeen", bedrijf });
    const shop = await createSite("t1", by, { templateId: "mode", bedrijf, soort: "webshop" });
    expect(website.soort).toBeUndefined();
    expect(shop.soort).toBe("webshop");
    expect(shop.slug).not.toBe(website.slug);
    expect((await siteOfTenant("t1"))?.id).toBe(website.id);
    expect((await siteOfTenant("t1", "website"))?.id).toBe(website.id);
    expect((await siteOfTenant("t1", "webshop"))?.id).toBe(shop.id);
  });

  it("van elke soort maar één per bedrijf", async () => {
    await createSite("t1", by, { templateId: "algemeen", bedrijf, soort: "webshop" });
    await expect(createSite("t1", by, { templateId: "algemeen", bedrijf, soort: "webshop" })).rejects.toThrow(/al een webshop/);
    await createSite("t1", by, { templateId: "algemeen", bedrijf });
    await expect(createSite("t1", by, { templateId: "algemeen", bedrijf })).rejects.toThrow(/al een website/);
  });

  it("de winkel zit in de webshop, en anders in een website die al producten heeft", async () => {
    const website = await createSite("t2", by, { templateId: "algemeen", bedrijf });
    expect((await winkelSiteOf("t2"))?.id).toBe(website.id);
    const shop = await createSite("t2", by, { templateId: "algemeen", bedrijf, soort: "webshop" });
    expect((await winkelSiteOf("t2"))?.id).toBe(shop.id);
    expect(await winkelSiteOf("onbekend")).toBeNull();
  });

  it("een nieuwe webshop begint met een lege winkel, de winkelstijl en de wettelijke pagina's", async () => {
    const shop = await createSite("t3", by, { templateId: "eten", bedrijf, soort: "webshop" });
    expect(shop.winkel?.producten).toEqual([]);
    expect(shop.theme.stijl).toBe("premium");
    expect(shop.pages.map((p) => p.slug)).toEqual(["", "over-ons", "verzenden-en-retourneren", "voorwaarden", "contact"]);
    expect(shop.pages[0]?.blocks.map((b) => b.type)).toContain("producten");
    // en alles is gewoon op te slaan: het schema accepteert de pagina's
    expect(siteSaveSchema.safeParse({ theme: shop.theme, bedrijf: shop.bedrijf, pages: shop.pages }).success).toBe(true);
  });

  it("een website blijft zoals hij was: geen winkel, huisstijl beleving", async () => {
    const site = await createSite("t4", by, { templateId: "algemeen", bedrijf });
    expect(site.winkel).toBeUndefined();
    expect(site.theme.stijl).toBe("beleving");
  });
});

describe("webshop-startpunten", () => {
  it("hebben unieke namen, geldige kleuren en een eigen sfeer", () => {
    expect(new Set(WEBSHOP_TEMPLATES.map((t) => t.id)).size).toBe(WEBSHOP_TEMPLATES.length);
    for (const t of WEBSHOP_TEMPLATES) {
      expect(t.theme.kleur).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(t.theme.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(t.usps).toHaveLength(3);
    }
  });

  it("vullen bedrijf en plaats in en laten geen accolades over", () => {
    let n = 0;
    for (const t of WEBSHOP_TEMPLATES) {
      const tekst = JSON.stringify(webshopPages(t, bedrijf, () => `b${++n}x`));
      expect(tekst).not.toMatch(/\{(bedrijf|plaats)\}/);
      expect(tekst).toContain("Studio Linde");
    }
  });

  it("de voorwaarden noemen wie de verkoper is en de 14 dagen bedenktijd", () => {
    const tekst = voorwaardenTekst(bedrijf);
    expect(tekst).toContain("KVK 12345678");
    expect(tekst).toContain("Lindelaan 4");
    expect(tekst).toContain("14 dagen");
  });
});
