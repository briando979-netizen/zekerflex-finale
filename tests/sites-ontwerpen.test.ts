import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// Studio → Ontwerpen: de galerij (lib/sites/ontwerpen.ts) en "Dit ontwerp gebruiken" /
// "Ongedaan maken" (lib/sites/ontwerp-wissel.ts). De KV en Prisma zijn nagebootst voor de
// start met een gekozen ontwerp (createSite).

const store = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => structuredClone(store.get(k) ?? null),
  kvSet: async (k: string, v: unknown) => void store.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void store.delete(k),
  kvListKeys: async () => [],
  kvListValues: async () => [],
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

import { BRANCHE_VOORBEELDEN } from "@/lib/sites/branche-voorbeelden";
import { MAX_PAGINAS } from "@/lib/sites/paginabouwer";
import { MAX_BLOKKEN, isHuidigOntwerp, maakOngedaan, pasOntwerpToe, voegOpzetToe, wisselThema, zoalsOpgeslagen } from "@/lib/sites/ontwerp-wissel";
import { categorieenVan, kaartVan, ontwerpVoor, ontwerpenVoor, opzetVoor, winkelVoorbeeldSlug, type Ontwerp } from "@/lib/sites/ontwerpen";
import { siteSaveSchema, themeSchema } from "@/lib/sites/schema";
import { createSite } from "@/lib/sites/store";
import { SECTOR_TEMPLATES, newBlock, type Block, type Page, type SiteDoc } from "@/lib/sites/types";
import { WEBSHOP_TEMPLATES } from "@/lib/sites/webshop-templates";

const ROOT = join(__dirname, "..");
const AT = "2026-11-11T10:00:00+01:00";
const bedrijf = { naam: "Studio Linde", kvk: "12345678", straat: "Lindelaan 4", postcode: "7461 AA", plaats: "Rijssen", telefoon: "0548 123456", email: "hallo@studiolinde.test" };

let teller = 0;
const nieuwId = () => `b${(teller++).toString(36).padStart(8, "0")}`;
const ontwerp = (soort: "website" | "webshop", id: string): Ontwerp => {
  const o = ontwerpVoor(soort, id);
  if (!o) throw new Error(`geen ontwerp ${id}`);
  return o;
};
const typen = (p: Page | undefined) => (p?.blocks ?? []).map((b) => b.type);

/** Een webshop die het bedrijf zelf heeft aangepast: eigen kop, een eigen pagina, zonder "Over ons" en zonder de redenen om te kopen. */
function eigenWebshop(): SiteDoc {
  const pages = opzetVoor({ id: "algemeen", soort: "webshop" }, bedrijf, nieuwId)
    .filter((p) => p.slug !== "over-ons")
    .map((p) =>
      p.slug === ""
        ? { ...p, blocks: p.blocks.filter((b) => b.type !== "usps").map((b) => (b.type === "hero" ? { ...b, props: { ...b.props, kop: "Mijn eigen kop", foto: "mabcdef12" } } : b)) as Block[] }
        : p,
    );
  pages.push({ id: "beigen001", slug: "nieuws", titel: "Nieuws", seoTitel: "Nieuws", seoOmschrijving: "", blocks: [{ ...newBlock("tekst", "beigen002"), props: { kop: "Ons nieuws", tekst: "Zelf geschreven." } } as Block] });
  return {
    id: "sabcdef12",
    tenantId: "t1",
    soort: "webshop",
    slug: "studio-linde",
    theme: { kleur: "#123456", accent: "#ABCDEF", lettertype: "klassiek", hoeken: "strak", stijl: "luxe", logo: "mlogo1234" },
    bedrijf,
    pages,
    media: [
      { id: "mlogo1234", file: "mlogo1234.webp", width: 200, height: 80, alt: "Logo", bron: "upload" },
      { id: "mabcdef12", file: "mabcdef12.webp", width: 1600, height: 900, alt: "Winkel", bron: "upload" },
    ],
    liveBuild: "build1",
    builds: [{ id: "build1", at: AT, by: "Jan" }],
    winkel: {
      producten: [{ id: "pabcdef12", naam: "Vaas", slug: "vaas", prijsCents: 2495, korteTekst: "", omschrijving: "", fotos: ["mabcdef12"], categorie: "Wonen", zichtbaar: true, uitverkocht: false, voorraad: 3 }],
      bestellen: true,
      levering: { afhalen: true, bezorgen: false, bezorgkostenCents: 0, gratisVanafCents: null },
      betaalTekst: "Betalen bij afhalen.",
    },
    createdAt: AT,
    updatedAt: AT,
  };
}

beforeEach(() => {
  store.clear();
  teller = 0;
});

describe("de galerij (lib/sites/ontwerpen.ts)", () => {
  it("elk startpunt van de website en de webshop heeft een kaart", () => {
    expect(ontwerpenVoor("website").map((o) => o.id)).toEqual(SECTOR_TEMPLATES.map((t) => t.id));
    expect(ontwerpenVoor("webshop").map((o) => o.id)).toEqual(WEBSHOP_TEMPLATES.map((t) => t.id));
  });

  it("elke foto staat op schijf, met een CREDITS.md in dezelfde map, en elk ontwerp heeft een eigen categorie", () => {
    for (const soort of ["website", "webshop"] as const)
      for (const o of ontwerpenVoor(soort)) {
        expect(o.foto, o.id).toMatch(/^\/[a-z0-9/-]+\.(jpg|webp|png)$/);
        const pad = join(ROOT, "public", o.foto);
        expect(existsSync(pad), `${soort}/${o.id} → ${o.foto}`).toBe(true);
        expect(existsSync(join(dirname(pad), "CREDITS.md")), `bron van ${o.foto}`).toBe(true);
        expect(o.categorie, o.id).not.toBe("Overig");
      }
  });

  it("de stijl van elk ontwerp is een geldige stijl van de bouwer", () => {
    for (const soort of ["website", "webshop"] as const) for (const o of ontwerpenVoor(soort)) expect(() => themeSchema.parse(o.thema), o.id).not.toThrow();
  });

  it("een website-ontwerp toont de voorbeeldsite van zijn branche, in precies die stijl", () => {
    for (const o of ontwerpenVoor("website")) {
      const v = BRANCHE_VOORBEELDEN.find((x) => x.id === o.id);
      expect(v, o.id).toBeDefined();
      expect(o.voorbeeldSlug).toBe(v?.slug);
      expect([o.thema.kleur, o.thema.accent, o.thema.stijl]).toEqual([v?.theme.kleur, v?.theme.accent, v?.theme.stijl ?? "beleving"]);
    }
  });

  it("een webshop-ontwerp wijst naar zijn voorbeeldwinkel en begint zoals een nieuwe webshop", () => {
    for (const o of ontwerpenVoor("webshop")) {
      expect(o.voorbeeldSlug).toBe(winkelVoorbeeldSlug(o.id));
      expect(o.voorbeeldSlug).toBe(`voorbeeldwinkel-${o.id}`);
      expect(o.thema.stijl).toBe("premium");
    }
  });

  it("de knop Voorbeeld bekijken alleen als het voorbeeld er is", () => {
    const o = ontwerp("webshop", "mode");
    expect(kaartVan(o, false).voorbeeld).toBeNull();
    expect(kaartVan(o, true).voorbeeld).toBe("/site/voorbeeldwinkel-mode");
    expect(kaartVan(o, true).stijlNaam).toBe("Premium");
    expect(kaartVan(ontwerp("website", "horeca"), true).voorbeeld).toBe("/site/brasserie-het-plein");
  });

  it("filters: elke categorie één keer, onbekende ontwerpen bestaan niet", () => {
    const cats = categorieenVan(ontwerpenVoor("webshop"));
    expect(new Set(cats).size).toBe(cats.length);
    expect(cats).toContain("Mode en verzorging");
    expect(ontwerpVoor("webshop", "bestaat-niet")).toBeNull();
    expect(ontwerpVoor("website", "constructor")).toBeNull();
  });
});

describe("Dit ontwerp gebruiken (lib/sites/ontwerp-wissel.ts)", () => {
  it("standaard verandert alleen de stijl: logo, pagina's, teksten, producten en bedrijf blijven", () => {
    const site = eigenWebshop();
    const voor = structuredClone(site);
    const mode = ontwerp("webshop", "mode");
    const { site: na, wissel } = pasOntwerpToe(site, mode, null, AT);
    expect(na.theme).toEqual({ ...mode.thema, logo: "mlogo1234" });
    expect(na.pages).toEqual(voor.pages);
    expect(na.winkel).toEqual(voor.winkel);
    expect(na.bedrijf).toEqual(voor.bedrijf);
    expect(na.media).toEqual(voor.media);
    expect(na.liveBuild).toBe("build1");
    expect(wissel).toEqual({ ontwerpId: "mode", naam: mode.naam, at: AT, vorigThema: voor.theme, paginas: [], blokken: [] });
    // de invoer zelf is niet veranderd
    expect(site).toEqual(voor);
  });

  it("het logo blijft ook als de site er geen heeft", () => {
    const t = wisselThema({ kleur: "#000000", accent: "#FFFFFF", lettertype: "modern", hoeken: "rond" }, ontwerp("webshop", "eten").thema);
    expect("logo" in t).toBe(false);
    expect(wisselThema({ kleur: "#000000", accent: "#FFFFFF", lettertype: "modern", hoeken: "rond", logo: null }, ontwerp("webshop", "eten").thema).logo).toBeNull();
  });

  it("met de pagina-opzet komt erbij wat ontbreekt, en wordt niets overschreven of weggehaald", () => {
    const site = eigenWebshop();
    const voor = structuredClone(site);
    const mode = ontwerp("webshop", "mode");
    const { site: na, wissel } = pasOntwerpToe(site, mode, opzetVoor(mode, site.bedrijf, nieuwId), AT);

    // elk eigen blok staat er nog, ongewijzigd en in dezelfde volgorde
    for (const p of voor.pages) {
      const nu = na.pages.find((x) => x.id === p.id);
      expect(nu, p.slug).toBeDefined();
      const eigen = nu!.blocks.filter((b) => p.blocks.some((x) => x.id === b.id));
      expect(eigen).toEqual(p.blocks);
      expect({ ...nu, blocks: [] }).toEqual({ ...p, blocks: [] });
    }
    const home = na.pages.find((p) => p.slug === "");
    expect(home?.blocks.find((b) => b.type === "hero")?.props).toMatchObject({ kop: "Mijn eigen kop", foto: "mabcdef12" });
    // de redenen om te kopen kwamen terug, op hun plek: na de producten
    expect(typen(home)).toEqual(["hero", "producten", "usps", "tekstFoto", "reviews", "cta"]);
    // de ontbrekende pagina kwam erbij, op de plek uit het ontwerp; de eigen pagina bleef
    expect(na.pages.map((p) => p.slug)).toEqual(["", "over-ons", "verzenden-en-retourneren", "voorwaarden", "contact", "nieuws"]);
    expect(na.pages.find((p) => p.slug === "over-ons")?.blocks[0]?.props).toMatchObject({ kop: "Over Studio Linde" });
    expect(wissel.paginas.map((p) => p.slug)).toEqual(["over-ons"]);
    expect(wissel.blokken.map((b) => b.blok.type)).toEqual(["usps"]);
    expect(wissel.blokken[0]?.paginaId).toBe(home?.id);
    // de stijl wisselde ook, en het geheel is een geldige site
    expect(na.theme.kleur).toBe(mode.thema.kleur);
    expect(() => siteSaveSchema.parse({ theme: na.theme, bedrijf: na.bedrijf, pages: na.pages })).not.toThrow();
  });

  it("zet nooit een verzonnen review op een bestaande site", () => {
    const site = eigenWebshop();
    site.pages = site.pages.map((p) => ({ ...p, blocks: p.blocks.filter((b) => b.type !== "reviews") }));
    const { site: na } = pasOntwerpToe(site, ontwerp("webshop", "wonen"), opzetVoor(ontwerp("webshop", "wonen"), site.bedrijf, nieuwId), AT);
    expect(na.pages.flatMap((p) => p.blocks).some((b) => b.type === "reviews")).toBe(false);
  });

  it("houdt zich aan het grootste aantal pagina's en blokken", () => {
    const vol: Page = { id: "bvol00001", slug: "", titel: "Home", seoTitel: "", seoOmschrijving: "", blocks: Array.from({ length: MAX_BLOKKEN }, (_, i) => newBlock("tekst", `bt${i}`)) };
    const extra = Array.from({ length: MAX_PAGINAS - 1 }, (_, i): Page => ({ id: `bp${i}`, slug: `eigen-${i}`, titel: `Eigen ${i}`, seoTitel: "", seoOmschrijving: "", blocks: [] }));
    const uit = voegOpzetToe([vol, ...extra], opzetVoor(ontwerp("website", "horeca"), bedrijf, nieuwId));
    expect(uit.pages).toHaveLength(MAX_PAGINAS);
    expect(uit.pages[0]?.blocks).toHaveLength(MAX_BLOKKEN);
    expect(uit.paginas).toEqual([]);
    expect(uit.blokken).toEqual([]);
  });

  it("weet welk ontwerp de site nu gebruikt", () => {
    const mode = ontwerp("webshop", "mode");
    expect(isHuidigOntwerp({ ...mode.thema, kleur: mode.thema.kleur.toLowerCase(), logo: "mlogo1234" }, mode.thema)).toBe(true);
    expect(isHuidigOntwerp({ ...mode.thema, stijl: "luxe" }, mode.thema)).toBe(false);
    // een oude site zonder stijl is "standaard"
    expect(isHuidigOntwerp({ kleur: mode.thema.kleur, accent: mode.thema.accent, lettertype: "modern", hoeken: "rond" }, { ...mode.thema, stijl: "standaard" })).toBe(true);
  });
});

describe("Ongedaan maken", () => {
  it("zet de vorige stijl terug en haalt weg wat erbij kwam", () => {
    const voor = eigenWebshop();
    const mode = ontwerp("webshop", "mode");
    const { site: na, wissel } = pasOntwerpToe(voor, mode, opzetVoor(mode, voor.bedrijf, nieuwId), AT);
    // zoals de server het opslaat: door het schema (andere volgorde van velden) en de KV (JSON)
    const opgeslagen = { ...na, ...siteSaveSchema.parse({ theme: na.theme, bedrijf: na.bedrijf, pages: na.pages }) } as SiteDoc;
    const w = JSON.parse(JSON.stringify(zoalsOpgeslagen(wissel, opgeslagen.pages))) as typeof wissel;
    const { site: terug, bleven } = maakOngedaan(opgeslagen, w);
    expect(bleven).toBe(0);
    expect(terug.theme).toEqual(eigenWebshop().theme);
    expect(terug.pages.map((p) => p.slug)).toEqual(eigenWebshop().pages.map((p) => p.slug));
    expect(terug.pages.map(typen)).toEqual(eigenWebshop().pages.map(typen));
    expect(terug.winkel).toEqual(voor.winkel);
  });

  it("wat het bedrijf intussen zelf aanpaste, blijft staan; het logo van nu ook", () => {
    const voor = eigenWebshop();
    const mode = ontwerp("webshop", "mode");
    const { site: na, wissel } = pasOntwerpToe(voor, mode, opzetVoor(mode, voor.bedrijf, nieuwId), AT);
    // het bedrijf schreef een eigen tekst op de nieuwe pagina "Over ons" en koos daarna een ander logo
    const aangepast: SiteDoc = {
      ...na,
      theme: { ...na.theme, logo: "mabcdef12" },
      pages: na.pages.map((p) => (p.slug === "over-ons" ? { ...p, blocks: p.blocks.map((b) => (b.type === "tekst" ? ({ ...b, props: { ...b.props, tekst: "Ons eigen verhaal." } } as Block) : b)) } : p)),
    };
    const { site: terug, bleven } = maakOngedaan(aangepast, wissel);
    expect(bleven).toBe(1);
    expect(terug.pages.find((p) => p.slug === "over-ons")?.blocks[0]?.props).toMatchObject({ tekst: "Ons eigen verhaal." });
    // het toegevoegde blok dat niemand aanraakte, is weg
    expect(typen(terug.pages.find((p) => p.slug === ""))).toEqual(typen(voor.pages.find((p) => p.slug === "")));
    expect(terug.theme).toEqual({ ...voor.theme, logo: "mabcdef12" });
  });

  it("alleen de stijl gewisseld: ongedaan maken geeft precies de oude site terug", () => {
    const voor = eigenWebshop();
    const { site: na, wissel } = pasOntwerpToe(voor, ontwerp("webshop", "beauty"), null, AT);
    const { site: terug, bleven } = maakOngedaan(na, wissel);
    expect(bleven).toBe(0);
    expect(terug).toEqual(voor);
  });
});

describe("beginnen met een ontwerp uit de galerij", () => {
  const by = { userId: "u1", name: "Jan" };

  it("een nieuwe website krijgt de stijl van het gekozen ontwerp, zoals op de voorbeeldsite", async () => {
    const site = await createSite("t1", by, { templateId: "horeca", bedrijf, ontwerp: true });
    expect(site.theme).toEqual(ontwerp("website", "horeca").thema);
    expect(site.theme.kleur).toBe("#5C2E22");
  });

  it("zonder keuze uit de galerij blijft de start zoals hij was", async () => {
    const site = await createSite("t2", by, { templateId: "horeca", bedrijf });
    expect(site.theme).toEqual({ kleur: "#9B1D3A", accent: "#F5C04E", lettertype: "modern", hoeken: "rond", stijl: "beleving" });
    const shop = await createSite("t2", by, { templateId: "mode", bedrijf, soort: "webshop", ontwerp: true });
    expect(shop.theme).toEqual(ontwerp("webshop", "mode").thema);
  });
});
