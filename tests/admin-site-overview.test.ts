import { beforeEach, describe, expect, it, vi } from "vitest";

// Beheer → Website-beheer, "Gebouwde websites" (lib/sites/admin-overview.ts): alleen echte
// klantsites (geen voorbeeld of voorstel), het eigen domein zodra dat actief is, en wat er de
// laatste 30 dagen gebeurde. Een storing in de bezoekerscijfers mag het overzicht niet breken.

const sites: unknown[] = [];
vi.mock("@/lib/storage/kv", () => ({ kvListValues: async (prefix: string) => (prefix === "site:" ? sites : []) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findMany: async () => [{ id: "t1", name: "Bakkerij BV" }, { id: "t2", name: "Schilder BV" }] },
    managedWebsite: { findMany: async () => [{ tenantId: "t1", status: "ACTIVE" }] },
  },
}));
const domains = new Map<string, { host: string; activeAt: string | null }>();
vi.mock("@/lib/sites/domain", () => ({ getDomain: async (id: string) => domains.get(id) ?? null }));
const statsFor = vi.fn();
vi.mock("@/lib/sites/stats", () => ({ siteStats: (...a: unknown[]) => statsFor(...a) }));
const messages = new Map<string, { at: string }[]>();
vi.mock("@/lib/sites/store", () => ({ listContactMessages: async (id: string) => messages.get(id) ?? [] }));

const { builtSitesOverview } = await import("@/lib/sites/admin-overview");

const NOW = new Date("2026-11-03T20:00:00Z");
const site = (over: object) => ({ id: "s1", tenantId: "t1", slug: "bakkerij", bedrijf: { naam: "Bakkerij Jansen" }, liveBuild: "b2", builds: [{ id: "b1", at: "2026-10-30T10:00:00Z" }, { id: "b2", at: "2026-11-02T09:00:00Z" }], ...over });

beforeEach(() => {
  sites.length = 0;
  domains.clear();
  messages.clear();
  statsFor.mockReset();
  statsFor.mockResolvedValue({ views: 12, entries: 5 });
});

describe("builtSitesOverview", () => {
  it("lists real customer sites only, never the example or a proposal", async () => {
    sites.push(site({}), site({ id: "s2", slug: "bakkerij-jansen", voorbeeld: true }), site({ id: "s3", slug: "voorstel", voorstel: { officieel: null, verloopt: "2099-01-01" } }));
    const rows = await builtSitesOverview("https://zekerflex.com/", NOW);
    expect(rows.map((r) => r.id)).toEqual(["s1"]);
    expect(rows[0]).toEqual({
      id: "s1",
      bedrijf: "Bakkerij Jansen",
      online: true,
      adres: "https://zekerflex.com/site/bakkerij",
      eigenDomein: false,
      gepubliceerd: "2026-11-02T09:00:00Z",
      weergaven: 12,
      binnenkomsten: 5,
      berichten: 0,
      beheer: "ACTIVE",
    });
    expect(statsFor).toHaveBeenCalledWith("s1", 30, NOW);
  });

  it("shows the own domain once it is active, and counts only messages from the last 30 days", async () => {
    sites.push(site({}), site({ id: "s4", tenantId: "t2", slug: "schilder", bedrijf: { naam: "" }, liveBuild: null, builds: [] }));
    domains.set("s1", { host: "bakkerjansen.nl", activeAt: "2026-11-01T00:00:00Z" });
    domains.set("s4", { host: "schilder.nl", activeAt: null });
    messages.set("s1", [{ at: "2026-11-02T10:00:00Z" }, { at: "2026-10-20T10:00:00Z" }, { at: "2026-09-01T10:00:00Z" }]);
    const [a, b] = await builtSitesOverview("https://zekerflex.com", NOW);
    expect([a?.adres, a?.eigenDomein, a?.berichten]).toEqual(["https://bakkerjansen.nl", true, 2]);
    // not active yet: still the address on zekerflex.com; no name on the site: the company's name
    expect([b?.adres, b?.eigenDomein, b?.bedrijf, b?.online, b?.gepubliceerd, b?.beheer]).toEqual(["https://zekerflex.com/site/schilder", false, "Schilder BV", false, null, null]);
  });

  it("keeps the overview when the visitor figures can't be read", async () => {
    sites.push(site({}));
    statsFor.mockRejectedValue(new Error("redis weg"));
    const [row] = await builtSitesOverview("https://zekerflex.com", NOW);
    expect([row?.weergaven, row?.binnenkomsten]).toEqual([null, null]);
  });

  it("is empty without sites", async () => {
    expect(await builtSitesOverview("https://zekerflex.com", NOW)).toEqual([]);
  });
});
