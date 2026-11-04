import { beforeEach, describe, expect, it, vi } from "vitest";

// Verlopen voorbeeldsites van de gratis website-check opruimen: alleen sites
// die de check maakte (tenant "voorstel:wc-…", nog een voorstel), een week na het
// verlopen; nooit de site van een bedrijf of een voorstel van sales.

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async (k: string) => kv.get(k) ?? null),
  kvSet: vi.fn(async (k: string, v: unknown) => void kv.set(k, v)),
  kvDelete: vi.fn(async (k: string) => void kv.delete(k)),
  kvListKeys: vi.fn(async (p: string) => [...kv.keys()].filter((k) => k.startsWith(p))),
  kvListValues: vi.fn(async (p: string) => [...kv.entries()].filter(([k]) => k.startsWith(p)).map(([, v]) => v)),
  kvListEntries: vi.fn(async (p: string) => [...kv.entries()].filter(([k]) => k.startsWith(p)).map(([key, value]) => ({ key, value }))),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const audit = vi.fn();
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => audit(...a) }));
const rm = vi.fn(async (...args: unknown[]) => void args);
vi.mock("node:fs/promises", async (orig) => ({ ...(await orig<typeof import("node:fs/promises")>()), rm: (...a: unknown[]) => rm(...a) }));
const cron = vi.fn();
vi.mock("@/lib/metrics", () => ({ recordCronRun: (...a: unknown[]) => cron(...a) }));

const { deleteCheckProposalSite } = await import("@/lib/sites/store");
const { ruimVerlopenSitesOp, OPRUIM_NA_DAGEN } = await import("@/lib/website-check/nieuwe-site");

const DAG = 86_400_000;
const NU = Date.parse("2026-12-20T03:45:00Z");

function zet(id: string, slug: string, tenantId: string, verloopt: string | null) {
  kv.set(`site:${id}`, { id, slug, tenantId, builds: [{ id: "b1", at: "", by: "" }], ...(verloopt ? { voorstel: { officieel: "x.example.com", verloopt } } : {}) });
  kv.set(`site-slug:${slug}`, id);
  kv.set(`site-tenant:${tenantId}`, id);
  kv.set(`site-build:${id}:b1`, {});
  kv.set(`site-contact:${id}:m1`, {});
}

beforeEach(() => {
  kv.clear();
  audit.mockReset();
  rm.mockClear();
  cron.mockReset();
});

describe("verlopen voorbeeldsites opruimen", () => {
  it("ruimt een site van de check een week na het verlopen op, met foto's en alle sleutels", async () => {
    const verlopen = new Date(NU - (OPRUIM_NA_DAGEN + 1) * DAG).toISOString();
    zet("swcoud00001", "bakkerij-jansen", "voorstel:wc-aaaaaaaaaaaaaaaaaa", verlopen);
    kv.set("website-check-site:bakkerij.example.com", { siteId: "swcoud00001", slug: "bakkerij-jansen", at: "", verloopt: verlopen, score: 90 });
    expect(await ruimVerlopenSitesOp(NU)).toEqual({ opgeruimd: 1 });
    expect([...kv.keys()]).toEqual([]);
    expect(rm).toHaveBeenCalledWith(expect.stringMatching(/sitebuilder[\\/]swcoud00001$/), { recursive: true, force: true });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "site.check-proposal-removed", actorUserId: null }));
    expect(cron).toHaveBeenCalledWith("website-check-opruimen", true);
  });

  it("laat een net verlopen site nog een week staan (de link toont dan 'verlopen')", async () => {
    const net = new Date(NU - 2 * DAG).toISOString();
    zet("swcnet00001", "kapper-kees", "voorstel:wc-bbbbbbbbbbbbbbbbbb", net);
    expect(await ruimVerlopenSitesOp(NU)).toEqual({ opgeruimd: 0 });
    expect(kv.has("site:swcnet00001")).toBe(true);
    expect(rm).not.toHaveBeenCalled();
  });

  it("raakt nooit de site van een bedrijf of een voorstel van sales", async () => {
    const lang = new Date(NU - 400 * DAG).toISOString();
    zet("ssales00001", "schilder-de-vries", "voorstel:a1b2c3d4e5f6a1b2c3d4e5f6", lang); // voorstel van sales
    zet("sbedrijf001", "bakker-echt", "ten_123", null); // echte klantsite
    zet("swcover0001", "overgezet", "voorstel:wc-cccccccccccccccccc", null); // check-site die al van het bedrijf is (geen voorstel meer)
    expect(await ruimVerlopenSitesOp(NU)).toEqual({ opgeruimd: 0 });
    for (const id of ["ssales00001", "sbedrijf001", "swcover0001"]) {
      expect(kv.has(`site:${id}`)).toBe(true);
      expect(await deleteCheckProposalSite(id)).toBe(false);
    }
    expect(rm).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});
