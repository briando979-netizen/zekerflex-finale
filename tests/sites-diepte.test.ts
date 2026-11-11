import { describe, expect, it, vi } from "vitest";

// De stijl "3D" (id "diepte", 11 nov 2026): beleving met een echte 3D-ruimte,
// zonder scripts. De opening is een vlucht door de eigen foto's, koppen hebben
// diepte, de galerij is een draaiende ring. Alles beweegt alleen bij het scrollen.

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { renderPage, siteCss } = await import("@/lib/sites/render");
const d3 = await import("@/lib/sites/diepte-render");
const { themeSchema } = await import("@/lib/sites/schema");
const { STIJL_KEUZES, isStijlKeuze } = await import("@/lib/website-check/stijl-keuze");
const { SECTOR_TEMPLATES, pagesFromTemplate, newBlock } = await import("@/lib/sites/types");
type SiteDoc = import("@/lib/sites/types").SiteDoc;
type Block = import("@/lib/sites/types").Block;
type Theme = import("@/lib/sites/types").Theme;

const company = { naam: "Brasserie Proef", kvk: "", straat: "", postcode: "", plaats: "Zonnedorp", telefoon: "", email: "" };
let n = 0;
const id = () => `b${(n++).toString(36).padStart(6, "0")}`;
const FOTOS = ["mhero00001", "mover00001", "mfoto00001", "mfoto00002", "mfoto00003", "mfoto00004", "mfoto00005"];
const media = FOTOS.map((m, i) => ({ id: m, file: `${m}.webp`, width: 1600, height: 1000, alt: `Foto ${i + 1}`, bron: "upload" as const }));

function site(stijl: NonNullable<Theme["stijl"]>, fotos = FOTOS): SiteDoc {
  const pages = pagesFromTemplate(SECTOR_TEMPLATES.find((t) => t.id === "horeca")!, company, id);
  const home = pages[0]!;
  const hero = home.blocks.find((b) => b.type === "hero");
  if (hero?.type === "hero") hero.props = { ...hero.props, kop: "Lekker eten, goed gezelschap.", foto: fotos[0] ?? null };
  const galerij: Block = { ...newBlock("galerij", id()), props: { kop: "Sfeer", fotos: fotos.slice(1) } } as Block;
  const stappen: Block = { ...newBlock("stappen", id()), props: { kop: "Zo werkt het", items: [{ titel: "Kies", tekst: "Een dag" }, { titel: "Kom", tekst: "En eet" }] } } as Block;
  const cta: Block = { ...newBlock("cta", id()), props: { kop: "Tot snel!", tekst: "We zien je graag.", knop: "Reserveer", knopLink: "#contact" } } as Block;
  home.blocks.splice(1, 0, galerij, stappen, cta);
  return {
    id: "sdiepte001",
    tenantId: "t1",
    slug: "proef",
    theme: { kleur: "#2B1A12", accent: "#F2A33A", lettertype: "modern", hoeken: "rond", stijl },
    bedrijf: company,
    pages,
    media,
    liveBuild: null,
    builds: [],
    createdAt: "2026-11-11T12:00:00Z",
    updatedAt: "2026-11-11T12:00:00Z",
  };
}
const opts = { root: "/site/proef/", origin: "https://zekerflex.com", version: "v1", noindex: true };

describe("stijl 3D (diepte)", () => {
  it("is een geldige stijl en staat als eerste keuze bij de website-check", () => {
    expect(themeSchema.safeParse(site("diepte").theme).success).toBe(true);
    expect(isStijlKeuze("diepte")).toBe(true);
    expect(STIJL_KEUZES[0]).toMatchObject({ id: "diepte", naam: "3D" });
  });

  it("maakt van de opening een vlucht door de eigen foto's, met de kop één keer als tekst", () => {
    const s = site("diepte");
    const html = renderPage(s, s.pages[0]!, opts);
    expect(html).toContain('<section class="d3-open" style="--reis:');
    expect(html).not.toContain('class="hero bel"');
    // alle zeven foto's: het eindpunt (met beschrijving) en zes onderweg (sier)
    expect(html.match(/class="d3-f"/g)).toHaveLength(6);
    expect(html).toContain('<div class="d3-f d3-eind"');
    expect(html).toMatch(/<div class="d3-f d3-eind"[^>]*><img [^>]*alt="Foto 1"/);
    // één h1; de lagen erachter zijn leeg en verborgen voor schermlezers (de tekst komt via CSS)
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html.match(/>Lekker eten,/g)).toHaveLength(1);
    expect(html).toContain('<div class="d3-echo" aria-hidden="true" style="--e:1" data-a="Lekker eten, goed" data-b="gezelschap."></div>');
    // geen scripts (een klantsite heeft een sandbox-CSP); alleen de gegevens voor zoekmachines (JSON-LD)
    expect(html.split("<script").length).toBe(html.split('<script type="application/ld+json">').length);
  });

  it("valt terug op de opening van beleving met te weinig foto's", () => {
    const s = site("diepte", ["mhero00001", "mover00001"]);
    const html = renderPage(s, s.pages[0]!, opts);
    expect(html).toContain('class="hero bel"');
    expect(html).not.toContain("d3-open");
  });

  it("zet de galerij vanaf vijf foto's in een ring, met de cijfers en de afsluiter in 3D-letters", () => {
    const s = site("diepte");
    const html = renderPage(s, s.pages[0]!, opts);
    expect(html).toContain(`<section class="d3-ringsec" style="--n:6;--f:${d3.ringFactor(6)}">`);
    expect(html.match(/<figure class="d3-rf"/g)).toHaveLength(6);
    expect(html).toContain('<span class="stap-nr d3-nr"><span>1</span><i class="d3-nr-e" aria-hidden="true"');
    expect(html).toContain('<section class="band bel d3-band"><div class="wrap"><div class="d3-bandkop"><h2>Tot snel!</h2>');
    // vier foto's: de gewone galerij van beleving
    const weinig = site("diepte", FOTOS.slice(0, 5));
    expect(renderPage(weinig, weinig.pages[0]!, opts)).not.toContain("d3-ringsec");
  });

  it("legt de tunnel steeds dieper neer, met het eindpunt het verst en elk moment binnen de vlucht", () => {
    const plan = d3.vluchtPlan(6);
    const z = plan.gang.map((g) => g.z);
    expect(z).toEqual([...z].sort((a, b) => b - a));
    expect(plan.eindZ).toBeLessThan(Math.min(...z));
    expect(plan.reis).toBe(-plan.eindZ + 150);
    for (const g of plan.gang) {
      expect(g.w0).toBeLessThan(g.w1);
      expect(g.w1).toBeLessThanOrEqual(100);
      expect(g.mist).toBeGreaterThanOrEqual(0.3);
      expect(g.mist).toBeLessThanOrEqual(1);
    }
    // elke keer hetzelfde (geen toeval)
    expect(d3.vluchtPlan(6)).toEqual(plan);
    expect(d3.ringFactor(4)).toBe(0.5);
  });

  it("beweegt alleen bij het scrollen, en niet voor wie minder beweging wil of een browser die het niet kan", () => {
    const css = siteCss(site("diepte").theme);
    const poort = "@supports (animation-timeline:view()){@media (prefers-reduced-motion:no-preference){";
    expect(css).toContain(poort);
    const [voor, na] = css.split(poort) as [string, string];
    // vóór de poort beweegt niets; erna hoort elke animatie bij een scroll-tijdlijn
    expect(voor).not.toMatch(/animation:/);
    const blok = na.slice(0, na.indexOf("}}\n@keyframes"));
    for (const regel of blok.match(/animation:[^;}]+/g) ?? []) if (regel !== "animation:none") expect(regel).toMatch(/linear both$/);
    expect(blok.match(/animation-timeline:/g)?.length).toBe(blok.match(/animation:d3-/g)?.length);
    // niets in een lus (WCAG 2.2.2)
    expect(css).not.toContain("infinite");
  });

  it("laat beleving en andere stijlen ongemoeid", () => {
    for (const stijl of ["beleving", "premium", "luxe", "standaard"] as const) {
      expect(siteCss(site(stijl).theme)).not.toContain("d3-");
      const s = site(stijl);
      expect(renderPage(s, s.pages[0]!, opts)).not.toContain("d3-");
    }
  });
});
