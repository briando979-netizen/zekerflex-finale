import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_SITES_PER_SOORT, leesLijst, magErbij, metIds, regelVan, sorteerRegels } from "@/lib/sites/meer-sites-core";
import type { SiteDoc } from "@/lib/sites/types";

// Meer dan één website of webshop per bedrijf (13 nov). De bestaande verwijzing "de site die open staat" blijft zoals hij is;
// daarnaast een lijst van alle sites. Er mag nooit een site uit beeld raken, en een site van een ander bedrijf is nooit te openen.

const kv = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvDelete: async (k: string) => void kv.delete(k),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: async () => undefined }));

const site = (id: string, tenantId: string, soort: "website" | "webshop" = "website", extra: Partial<SiteDoc> = {}): SiteDoc => ({
  id,
  tenantId,
  ...(soort === "webshop" ? { soort } : {}),
  slug: `slug-${id}`,
  theme: { kleur: "#0E5C4A", accent: "#F2B544", lettertype: "modern", hoeken: "rond" },
  bedrijf: { naam: `Naam ${id}`, kvk: "", straat: "", postcode: "", plaats: "", telefoon: "", email: "" },
  pages: [],
  media: [],
  liveBuild: null,
  builds: [],
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
  ...extra,
});

// de opslag van sites zelf, nagebootst op dezelfde kv: alleen wat meer-sites.ts gebruikt
const sleutel = (t: string, s?: string) => (s === "webshop" ? `webshop-tenant:${t}` : `site-tenant:${t}`);
let volgnummer = 0;
vi.mock("@/lib/sites/store", () => ({
  getSite: async (id: string) => (kv.get(`site:${id}`) as SiteDoc | undefined) ?? null,
  siteOfTenant: async (t: string, s = "website") => {
    const id = kv.get(sleutel(t, s)) as string | undefined;
    return id ? ((kv.get(`site:${id}`) as SiteDoc | undefined) ?? null) : null;
  },
  zetActieveSite: async (t: string, s: SiteDoc) => {
    if (s.tenantId !== t) throw new Error("niet van dit bedrijf");
    kv.set(sleutel(t, s.soort), s.id);
  },
  createSite: async (t: string, _by: unknown, input: { soort?: "website" | "webshop" }, opts: { extra?: boolean } = {}) => {
    if (!opts.extra && kv.get(sleutel(t, input.soort))) throw new Error("heeft er al een");
    const s = site(`snieuw${String(++volgnummer).padStart(3, "0")}`, t, input.soort ?? "website");
    kv.set(`site:${s.id}`, s);
    kv.set(sleutel(t, input.soort), s.id);
    return s;
  },
}));

import { kiesSite, maakExtraSite, sitesVanTenant } from "@/lib/sites/meer-sites";

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const T = "tenant-a";
const BY = { userId: "u1", name: "Test" };
const INVOER = { templateId: "algemeen", bedrijf: { naam: "Nieuw", kvk: "", straat: "", postcode: "", plaats: "", telefoon: "", email: "" } };

beforeEach(() => {
  kv.clear();
  volgnummer = 0;
});

describe("de regels", () => {
  it("de lijst: alleen geldige id's, elk één keer", () => {
    expect(leesLijst(["sabc1234", "sabc1234", "constructor", 4, null, "sdef5678"])).toEqual(["sabc1234", "sdef5678"]);
    for (const raw of [null, undefined, "x", {}, 3]) expect(leesLijst(raw)).toEqual([]);
    expect(metIds(["sabc1234"], "sdef5678", null, undefined, "sabc1234")).toEqual(["sabc1234", "sdef5678"]);
  });

  it("hoogstens vijf van één soort; de andere soort telt niet mee", () => {
    const vijf = Array.from({ length: MAX_SITES_PER_SOORT }, () => ({}));
    expect(magErbij(vijf, "website")).toBe(false);
    expect(magErbij(vijf, "webshop")).toBe(true);
    expect(magErbij([], "website")).toBe(true);
  });

  it("het overzicht toont alleen wat nodig is om een site te herkennen, de open site eerst", () => {
    const a = regelVan(site("saaaaaaa", T, "website", { updatedAt: "2026-11-02T10:00:00.000Z" }), ["sbbbbbbb"]);
    const b = regelVan(site("sbbbbbbb", T, "website", { liveBuild: "b1" }), ["sbbbbbbb"]);
    const c = regelVan(site("scccccccc", T, "webshop"), []);
    expect(Object.keys(a).sort()).toEqual(["actief", "bijgewerkt", "id", "naam", "online", "slug", "soort"]);
    expect(b).toMatchObject({ online: true, actief: true });
    expect(sorteerRegels([c, a, b]).map((r) => r.id)).toEqual(["sbbbbbbb", "saaaaaaa", "scccccccc"]);
  });
});

describe("de opslag", () => {
  it("een bedrijf van vóór deze functie (zonder lijst) ziet gewoon zijn website en webshop", async () => {
    kv.set("site:soud00001", site("soud00001", T));
    kv.set("site:soud00002", site("soud00002", T, "webshop"));
    kv.set(sleutel(T), "soud00001");
    kv.set(sleutel(T, "webshop"), "soud00002");
    const r = await sitesVanTenant(T);
    expect(r.map((x) => [x.id, x.soort, x.actief])).toEqual([["soud00001", "website", true], ["soud00002", "webshop", true]]);
    // alleen kijken schrijft niets
    expect(kv.has(`site-lijst:${T}`)).toBe(false);
  });

  it("nog een site maken: de oude blijft bestaan en in de lijst, de nieuwe staat open", async () => {
    kv.set("site:soud00001", site("soud00001", T, "website", { liveBuild: "b1" }));
    kv.set(sleutel(T), "soud00001");
    const nieuw = await maakExtraSite(T, BY, INVOER);
    expect(kv.get(sleutel(T))).toBe(nieuw.id);
    expect(kv.get(`site-lijst:${T}`)).toEqual(["soud00001", nieuw.id]);
    // de oude site is niet aangeraakt: nog online, zelfde adres
    expect(kv.get("site:soud00001")).toMatchObject({ liveBuild: "b1", slug: "slug-soud00001" });
    const r = await sitesVanTenant(T);
    expect(r.map((x) => [x.id, x.actief])).toEqual([[nieuw.id, true], ["soud00001", false]]);
  });

  it("terug naar de oude site: alleen de verwijzing verandert", async () => {
    kv.set("site:soud00001", site("soud00001", T));
    kv.set(sleutel(T), "soud00001");
    const nieuw = await maakExtraSite(T, BY, INVOER);
    const voor = JSON.stringify(kv.get(`site:${nieuw.id}`));
    await kiesSite(T, "soud00001", BY);
    expect(kv.get(sleutel(T))).toBe("soud00001");
    expect(JSON.stringify(kv.get(`site:${nieuw.id}`))).toBe(voor);
    expect((await sitesVanTenant(T)).map((x) => x.id).sort()).toEqual([nieuw.id, "soud00001"].sort());
  });

  it("een site van een ander bedrijf is niet te openen en staat niet in het overzicht, ook niet als zijn id in de lijst belandt", async () => {
    kv.set("site:svreemd01", site("svreemd01", "tenant-b"));
    kv.set(sleutel("tenant-b"), "svreemd01");
    kv.set(`site-lijst:${T}`, ["svreemd01"]);
    expect(await sitesVanTenant(T)).toEqual([]);
    await expect(kiesSite(T, "svreemd01", BY)).rejects.toThrow("hoort niet bij je bedrijf");
    expect(kv.get(sleutel(T))).toBeUndefined();
  });

  it("niet meer dan het maximum van één soort", async () => {
    for (let i = 0; i < MAX_SITES_PER_SOORT; i++) await maakExtraSite(T, BY, INVOER);
    await expect(maakExtraSite(T, BY, INVOER)).rejects.toThrow(`al ${MAX_SITES_PER_SOORT} websites`);
    // een webshop mag er nog wel bij
    expect((await maakExtraSite(T, BY, { ...INVOER, soort: "webshop" })).soort).toBe("webshop");
  });

  it("rommel in de lijst breekt het overzicht niet", async () => {
    kv.set("site:soud00001", site("soud00001", T));
    kv.set(sleutel(T), "soud00001");
    kv.set(`site-lijst:${T}`, { kapot: true });
    expect((await sitesVanTenant(T)).map((x) => x.id)).toEqual(["soud00001"]);
    kv.set(`site-lijst:${T}`, ["sbestaatniet"]);
    expect((await sitesVanTenant(T)).map((x) => x.id)).toEqual(["soud00001"]);
  });
});

describe("de rest van het systeem blijft zoals het was", () => {
  const store = bron("lib/sites/store.ts");

  it("zonder 'extra' geldt nog steeds één site per soort, en de bestaande aanroepen geven dat niet mee", () => {
    expect(store).toContain("if (!opts.extra && (await siteOfTenant(tenantId, soort))) throw");
    for (const f of ["app/api/werkgever/sites/route.ts", "lib/sites/proposal-site.ts", "lib/sites/demo.ts", "lib/sites/branche-demo.ts", "lib/sites/winkel-demo.ts", "lib/sites/burger-demo.ts"]) expect(bron(f), f).not.toContain("extra: true");
    // siteOfTenant en winkelSiteOf zelf zijn niet veranderd: ze lezen de verwijzing
    expect(store).toContain("const id = await kvGet<string>(tenantKey(tenantId, soort));\n  return id ? getSite(id) : null;");
  });

  it("de verwijzing omzetten kan alleen voor een site van het eigen bedrijf", () => {
    expect(store).toContain('if (site.tenantId !== tenantId) throw AppError.forbidden("Deze site hoort niet bij je bedrijf.");');
  });

  it("de route is voor de beheerder van het bedrijf, en maken is begrensd", () => {
    const route = bron("app/api/werkgever/sites/lijst/route.ts");
    expect(route.match(/const tenantId = await siteTenantOf\(p\);/g) ?? []).toHaveLength(2);
    expect(route).toContain('enforceRateLimit({ name: "site-extra", identifier: p.userId');
    // het bedrijf komt van de ingelogde beheerder, nooit uit het verzoek
    expect(route).not.toMatch(/tenantId: z\./);
  });

  it("het blok staat op het startscherm van de Studio en laadt de pagina opnieuw na openen of maken", () => {
    expect(bron("components/studio/Kiezer.tsx")).toContain("<MeerSites />");
    const blok = bron("components/studio/MeerSites.tsx");
    expect(blok.match(/window\.location\.assign\(`\/studio\/\$\{/g) ?? []).toHaveLength(2);
    expect(blok).toContain("if (sites.length === 0) return null;");
  });
});
