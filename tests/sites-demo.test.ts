import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// De voorbeeldwebsite Bakkerij Jansen: maakt zichzelf aan bij het eerste bezoek,
// zegt op elke pagina dat het een voorbeeld is, en het formulier verstuurt niets.

process.env.SITE_BUILDER_DIR = mkdtempSync(join(tmpdir(), "zf-demo-"));
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
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => undefined, privateRateLimitIdentifier: (s: string) => s }));
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn().mockResolvedValue(undefined) }));
const importRemoteImage = vi.fn();
vi.mock("@/lib/media/clean-image", () => ({ importRemoteImage: (...a: unknown[]) => importRemoteImage(...a) }));

const { DEMO_SLUG, ensureDemoSite, photoUrl } = await import("@/lib/sites/demo");
const { liveSiteBySlug } = await import("@/lib/sites/store");
const { renderPage } = await import("@/lib/sites/render");
const { handleSiteContact } = await import("@/lib/sites/serve");
const route = await import("@/app/site/[slug]/[[...path]]/route");

beforeEach(() => {
  store.clear();
  importRemoteImage.mockReset();
  importRemoteImage.mockResolvedValue({ bytes: Buffer.from("webp"), width: 2000, height: 1333, sourceUrl: "" });
});

describe("voorbeeldwebsite Bakkerij Jansen", () => {
  it("maakt zichzelf aan op /site/bakkerij-jansen, met foto's, als voorbeeld, gepubliceerd", async () => {
    await ensureDemoSite();
    const live = await liveSiteBySlug(DEMO_SLUG);
    expect(live).not.toBeNull();
    expect(live!.snapshot.voorbeeld).toBe(true);
    expect(live!.snapshot.slug).toBe("bakkerij-jansen");
    expect(live!.snapshot.pages.map((p) => p.slug)).toEqual(["", "assortiment", "over-ons", "contact"]);
    expect(live!.snapshot.media).toHaveLength(7);
    expect(importRemoteImage).toHaveBeenCalledWith(photoUrl("1509440159596-0249088772ff"));
  });

  it("een tweede keer doet niets; een foto die niet lukt houdt de site niet tegen", async () => {
    importRemoteImage.mockImplementation(async (url: string) => {
      if (url.includes("1486427944299")) return Promise.reject(new Error("weg"));
      return { bytes: Buffer.from("webp"), width: 800, height: 600, sourceUrl: "" };
    });
    await ensureDemoSite();
    const calls = importRemoteImage.mock.calls.length;
    await ensureDemoSite();
    expect(importRemoteImage.mock.calls.length).toBe(calls);
    expect((await liveSiteBySlug(DEMO_SLUG))!.snapshot.media).toHaveLength(6);
  });

  it("de route maakt hem bij het eerste bezoek en toont de voorbeeldbalk", async () => {
    const res = await route.GET(new Request("https://zekerflex.com/site/bakkerij-jansen"), { params: Promise.resolve({ slug: DEMO_SLUG }) });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Dit is een voorbeeldwebsite");
    expect(html).toContain("Bakkerij Jansen bestaat niet");
    expect(html).not.toContain("application/ld+json"); // geen nepbedrijf voor zoekmachines
  });

  it("het formulier staat uit en de server neemt geen berichten aan", async () => {
    await ensureDemoSite();
    const live = (await liveSiteBySlug(DEMO_SLUG))!;
    const contact = live.snapshot.pages.find((p) => p.slug === "contact")!;
    const html = renderPage(live.snapshot, contact, { root: "/site/bakkerij-jansen/", origin: "https://zekerflex.com" });
    expect(html).toMatch(/<button class="btn" type="submit" disabled>/);
    expect(html).toContain("dit formulier verstuurt niets");
    const form = new FormData();
    form.set("naam", "Piet");
    form.set("email", "piet@example.nl");
    form.set("bericht", "Hoi");
    const res = await handleSiteContact(new Request("https://zekerflex.com/site/bakkerij-jansen/_zf/contact", { method: "POST", body: form }), live, { origin: "https://zekerflex.com", noindex: true, thanks: "/x", address: "x" });
    expect(res.status).toBe(403);
    expect([...store.keys()].some((k) => k.startsWith("site-contact:"))).toBe(false);
  });

  it("heeft een echt bedrijf het adres al, dan komt er geen voorbeeld", async () => {
    const { createSite } = await import("@/lib/sites/store");
    const real = await createSite("t-echt", { userId: "u1", name: "Jan" }, { templateId: "algemeen", bedrijf: { naam: "Bakkerij Jansen", kvk: "", straat: "", postcode: "", plaats: "Rijssen", telefoon: "", email: "" } });
    expect(real.slug).toBe(DEMO_SLUG);
    await ensureDemoSite();
    expect(importRemoteImage).not.toHaveBeenCalled();
    expect([...store.keys()].some((k) => k.startsWith("site-slug:bakkerij-jansen-"))).toBe(false);
  });

  it("een gewone site krijgt geen voorbeeldbalk", async () => {
    await ensureDemoSite();
    const live = (await liveSiteBySlug(DEMO_SLUG))!;
    const home = live.snapshot.pages[0]!;
    const html = renderPage({ ...live.snapshot, voorbeeld: false }, home, { root: "/site/x/", origin: "https://zekerflex.com" });
    expect(html).not.toContain("demo-bar");
    expect(html).toContain("application/ld+json");
  });
});
