import { beforeEach, describe, expect, it, vi } from "vitest";

// Gratis website-check → "Maak mijn nieuwe website": een ontwerpvoorstel in de
// stijl beleving van de gecheckte site, één per website, 30 dagen, niets gemaild.

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async (k: string) => kv.get(k) ?? null),
  kvSet: vi.fn(async (k: string, v: unknown) => void kv.set(k, v)),
  kvListValues: vi.fn(async () => []),
}));
const build = vi.fn();
vi.mock("@/lib/sites/proposal-site", () => ({ buildProposalSite: (...a: unknown[]) => build(...a) }));
const getSite = vi.fn();
const saveSite = vi.fn();
const publishSite = vi.fn();
vi.mock("@/lib/sites/store", () => ({
  getSite: (...a: unknown[]) => getSite(...a),
  saveSite: (...a: unknown[]) => saveSite(...a),
  publishSite: (...a: unknown[]) => publishSite(...a),
  isCheckProposalTenant: (t: string) => t.startsWith("voorstel:wc-"),
}));
const fetchPage = vi.fn();
vi.mock("@/lib/website-check/fetch", async (orig) => ({ ...(await orig<typeof import("@/lib/website-check/fetch")>()), fetchPage: (...a: unknown[]) => fetchPage(...a) }));
const sendMail = vi.fn();
vi.mock("@/lib/mail", () => ({ sendMail }));

const { maakNieuweSite, kiesStijl, NIEUWE_SITE_DAGEN } = await import("@/lib/website-check/nieuwe-site");
const THEMA = { kleur: "#325A46", accent: "#FF5F1F", lettertype: "modern", hoeken: "rond", stijl: "beleving", logo: null };
type Check = import("@/lib/website-check/run").WebsiteCheckResult;

const CHECK: Check = {
  id: "0123456789abcdef",
  at: "2026-11-04T10:00:00Z",
  url: "https://bakkerij.example.com/",
  finalUrl: "https://bakkerij.example.com/",
  host: "bakkerij.example.com",
  score: 54,
  categories: [],
  findings: [],
  metrics: { ttfbMs: 300, totalMs: 900, htmlBytes: 40_000, transferBytes: 40_000, scripts: 9, images: 4, linksChecked: 0, brokenLinks: 0 },
  platform: null,
  leadId: null,
};
const HTML = `<html><head><title>Bakkerij Jansen</title></head><body><h1>Bakkerij Jansen</h1><p>Vers brood uit Zonnedorp.</p></body></html>`;

beforeEach(() => {
  kv.clear();
  build.mockReset();
  getSite.mockReset();
  fetchPage.mockReset();
  kv.set(`website-check:${CHECK.id}`, CHECK);
  fetchPage.mockImplementation(async (url: string) => {
    // het meten van de nieuwe site zelf: die pagina "bestaat" in deze test niet
    if (url.includes("/site/")) throw new Error("niet bereikbaar in de test");
    return { status: 200, finalUrl: url, body: HTML, headers: {}, bytes: HTML.length, transferBytes: HTML.length, ttfbMs: 10, totalMs: 20 };
  });
  build.mockResolvedValue({ id: "snieuw00001", slug: "bakkerij-jansen", voorstel: { officieel: CHECK.host, verloopt: "x" }, media: [], theme: THEMA });
  saveSite.mockReset();
  publishSite.mockReset();
});

describe("maak mijn nieuwe website", () => {
  it("bouwt een ontwerpvoorstel van hun eigen site, met de band en 30 dagen geldig, en mailt niets", async () => {
    const before = Date.now();
    const { site } = await maakNieuweSite(CHECK.id);
    expect(build).toHaveBeenCalledTimes(1);
    const input = build.mock.calls[0]![0] as { mark: { officieel: string; verloopt: string }; proposalId: string; by: { name: string } };
    expect(input.mark.officieel).toBe("bakkerij.example.com");
    const days = (Date.parse(input.mark.verloopt) - before) / 86_400_000;
    expect(days).toBeGreaterThan(NIEUWE_SITE_DAGEN - 0.01);
    expect(days).toBeLessThan(NIEUWE_SITE_DAGEN + 0.01);
    expect(input.proposalId).toMatch(/^wc-[a-f0-9]{18}$/);
    expect(input.by.name).toBe("Gratis website-check");
    expect(site).toMatchObject({ siteId: "snieuw00001", slug: "bakkerij-jansen", score: null });
    // het rapport onthoudt hem (zichtbaar bij ?r=) en de website ook
    expect((kv.get(`website-check:${CHECK.id}`) as Check).nieuweSite?.slug).toBe("bakkerij-jansen");
    expect(kv.get("website-check-site:bakkerij.example.com")).toMatchObject({ slug: "bakkerij-jansen" });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("maakt er geen tweede: hetzelfde rapport en een nieuwe check van dezelfde site krijgen hem terug", async () => {
    await maakNieuweSite(CHECK.id);
    await maakNieuweSite(CHECK.id);
    expect(build).toHaveBeenCalledTimes(1);
    const ander = { ...CHECK, id: "fedcba9876543210" };
    kv.set(`website-check:${ander.id}`, ander);
    getSite.mockResolvedValue({ id: "snieuw00001", voorstel: { officieel: CHECK.host, verloopt: "x" } });
    const { site } = await maakNieuweSite(ander.id);
    expect(build).toHaveBeenCalledTimes(1);
    expect(site.slug).toBe("bakkerij-jansen");
  });

  it("bouwt opnieuw als de oude verlopen is of al van het bedrijf zelf is", async () => {
    kv.set("website-check-site:bakkerij.example.com", { siteId: "soud0000001", slug: "oud", at: "", verloopt: "2026-01-01T00:00:00Z", score: 80 });
    await maakNieuweSite(CHECK.id);
    expect(build).toHaveBeenCalledTimes(1);
    kv.set(`website-check:${CHECK.id}`, CHECK);
    kv.set("website-check-site:bakkerij.example.com", { siteId: "soverge0001", slug: "overgezet", at: "", verloopt: "2099-01-01T00:00:00Z", score: 80 });
    getSite.mockResolvedValue({ id: "soverge0001" }); // geen voorstel meer: overgezet naar het bedrijf
    await maakNieuweSite(CHECK.id);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("weigert een onbekend rapport en een site van ZekerFlex zelf", async () => {
    await expect(maakNieuweSite("aaaaaaaaaaaaaaaa")).rejects.toThrow("bestaat niet meer");
    kv.set(`website-check:${CHECK.id}`, { ...CHECK, host: "www.zekerflex.com" });
    await expect(maakNieuweSite(CHECK.id)).rejects.toThrow("ZekerFlex zelf");
    expect(build).not.toHaveBeenCalled();
  });

  it("maakt een site van de oude motor (alleen de homepage) opnieuw als erom gevraagd wordt", async () => {
    const oud = { siteId: "soud0000001", slug: "oud", at: "", verloopt: "2099-01-01T00:00:00Z", score: 70 };
    kv.set(`website-check:${CHECK.id}`, { ...CHECK, nieuweSite: oud });
    kv.set("website-check-site:bakkerij.example.com", oud);
    getSite.mockResolvedValue({ id: "soud0000001", voorstel: { officieel: CHECK.host, verloopt: "2099-01-01T00:00:00Z" } });
    const { site } = await maakNieuweSite(CHECK.id);
    expect(build).toHaveBeenCalledTimes(1);
    expect(site.slug).toBe("bakkerij-jansen");
    expect(site.overgenomen).toBeDefined();
  });

  it("onthoudt wat hij van hun website overnam en hun eigen kleuren", async () => {
    const { site } = await maakNieuweSite(CHECK.id);
    expect(site).toMatchObject({ stijl: "beleving", palet: "eigen", eigen: { kleur: "#325A46", accent: "#FF5F1F" } });
    expect(site.overgenomen).toMatchObject({ paginas: 1, fotos: 0, uren: false, google: null });
  });
});

describe("meer opties: stijl en kleuren kiezen", () => {
  const pagina = { id: "p1", slug: "", titel: "Home", seoTitel: "", seoOmschrijving: "", blocks: [] };
  const bedrijf = { naam: "Bakkerij Jansen", kvk: "", straat: "", postcode: "", plaats: "", telefoon: "", email: "" };
  const voorbeeld = (tenantId = "voorstel:wc-abc") => ({ id: "snieuw00001", tenantId, voorstel: { officieel: CHECK.host, verloopt: "2099-01-01T00:00:00Z" }, theme: THEMA, bedrijf, pages: [pagina] });

  it("zet een andere stijl en kleuren en publiceert opnieuw; 'eigen' brengt hun kleuren terug", async () => {
    await maakNieuweSite(CHECK.id);
    getSite.mockResolvedValue(voorbeeld());
    const na = await kiesStijl(CHECK.id, "premium", "oceaan");
    expect(saveSite.mock.calls[0]![1]).toMatchObject({ theme: { stijl: "premium", kleur: "#1D4E89", accent: "#F28C38" } });
    expect(publishSite).toHaveBeenCalledTimes(1);
    expect(na).toMatchObject({ stijl: "premium", palet: "oceaan" });
    expect((kv.get(`website-check:${CHECK.id}`) as Check).nieuweSite).toMatchObject({ stijl: "premium", palet: "oceaan" });
    await kiesStijl(CHECK.id, "luxe", "eigen");
    expect(saveSite.mock.calls[1]![1]).toMatchObject({ theme: { stijl: "luxe", kleur: "#325A46", accent: "#FF5F1F" } });
  });

  it("raakt alleen de voorbeeldsite van de check, en alleen bekende keuzes", async () => {
    await maakNieuweSite(CHECK.id);
    getSite.mockResolvedValue(voorbeeld("t-echt-bedrijf"));
    await expect(kiesStijl(CHECK.id, "premium", "oceaan")).rejects.toThrow("bestaat niet");
    getSite.mockResolvedValue(voorbeeld());
    await expect(kiesStijl(CHECK.id, "neon", "oceaan")).rejects.toThrow("stijlen");
    await expect(kiesStijl(CHECK.id, "premium", "regenboog")).rejects.toThrow("kleuren");
    await expect(kiesStijl("aaaaaaaaaaaaaaaa", "premium", "oceaan")).rejects.toThrow("bestaat niet meer");
    expect(saveSite).not.toHaveBeenCalled();
  });
});
