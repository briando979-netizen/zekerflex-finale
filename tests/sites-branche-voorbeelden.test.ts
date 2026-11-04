import { describe, expect, it, vi } from "vitest";

// Voorbeeldwebsites per branche (4 nov 2026): voor elke branche een complete site in
// de stijl van schwarzwald.zekerflex.com. Ze moeten door dezelfde controle als een
// opslag in de bouwer, elke foto bestaan, en niets van een echt bedrijf bevatten.

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { BRANCHE_VOORBEELDEN, brancheVoorbeeldPaginas, brancheVoorbeeldVoorSlug, pexelsUrl } = await import("@/lib/sites/branche-voorbeelden");
const { SECTOR_TEMPLATES, slugify } = await import("@/lib/sites/types");
const { siteSaveSchema } = await import("@/lib/sites/schema");
const { renderPage, renderFunctiesPagina } = await import("@/lib/sites/render");
type SiteDoc = import("@/lib/sites/types").SiteDoc;
type BrancheVoorbeeld = import("@/lib/sites/branche-voorbeelden").BrancheVoorbeeld;

const opts = { root: "/site/x/", origin: "https://zekerflex.com", version: "v1", noindex: true };

function site(v: BrancheVoorbeeld): SiteDoc {
  const keys = Object.keys(v.fotos);
  const media = keys.map((k, i) => ({ id: `mfoto${String(i).padStart(5, "0")}`, file: `mfoto${String(i).padStart(5, "0")}.webp`, width: 1600, height: 1000, alt: v.fotos[k]!.alt, bron: "internet" as const }));
  const id = (k: string) => media[keys.indexOf(k)]?.id ?? null;
  return { id: "svoorbeeld1", tenantId: `voorbeeld:${v.id}`, slug: v.slug, theme: v.theme, bedrijf: v.bedrijf, pages: brancheVoorbeeldPaginas(v, id), media, liveBuild: null, builds: [], createdAt: "", updatedAt: "", voorbeeld: true };
}

describe("voorbeeldsites per branche", () => {
  it("dekt elke branche van de websitebouwer, elk op een eigen adres", () => {
    expect(BRANCHE_VOORBEELDEN.map((v) => v.id).sort()).toEqual(SECTOR_TEMPLATES.map((t) => t.id).sort());
    for (const v of BRANCHE_VOORBEELDEN) {
      expect(slugify(v.bedrijf.naam)).toBe(v.slug);
      expect(brancheVoorbeeldVoorSlug(v.slug)).toBe(v);
    }
    expect(new Set(BRANCHE_VOORBEELDEN.map((v) => v.slug)).size).toBe(BRANCHE_VOORBEELDEN.length);
    expect(pexelsUrl(123)).toBe("https://images.pexels.com/photos/123/pexels-photo-123.jpeg?auto=compress&cs=tinysrgb&w=2000");
  });

  it.each(BRANCHE_VOORBEELDEN.map((v) => [v.id, v] as const))("%s: gaat door de controle van de bouwer en elke foto bestaat", (_, v) => {
    const used = [v.hero.foto, v.over.foto, ...v.aanbod.items.map((i) => i.foto), ...v.galerij.fotos];
    for (const k of used) expect(v.fotos[k], `foto ${k}`).toBeDefined();
    expect(new Set(Object.values(v.fotos).map((f) => f.pexels)).size).toBe(Object.keys(v.fotos).length);
    const s = site(v);
    const parsed = siteSaveSchema.safeParse({ theme: s.theme, bedrijf: s.bedrijf, pages: s.pages });
    expect(parsed.success, JSON.stringify(parsed.error?.issues?.slice(0, 2))).toBe(true);
    // niets van een echt bedrijf: geen telefoon of e-mail, reviews als voorbeeld
    expect(v.bedrijf.telefoon).toBe("");
    expect(v.bedrijf.email).toBe("");
    for (const p of s.pages) for (const b of p.blocks) if (b.type === "reviews") expect(b.props.kop).toContain("(voorbeeld)");
    expect(v.theme.stijl).toBe("beleving");
  });

  it.each(BRANCHE_VOORBEELDEN.map((v) => [v.id, v] as const))("%s: een complete site zoals Schwarzwald, met de balk en de rondleiding", (_, v) => {
    const s = site(v);
    const home = renderPage(s, s.pages[0]!, opts);
    for (const bit of ['class="hero bel"', 'class="ticker"', 'class="tegels"', 'class="paneel"', 'class="steps bel"', 'class="rev"', 'class="uren-kaart"', 'class="band bel"', "Bekijk wat deze site kan"]) {
      expect(home, bit).toContain(bit);
    }
    const tour = renderFunctiesPagina(s, opts)!;
    expect(tour).toContain("Een bericht of aanvraag sturen");
    expect(tour).toContain("Antwoord op veelgestelde vragen");
    if (v.werken) expect(tour).toContain("Vacatures die vanzelf kloppen");
    expect(tour).not.toContain("Online bestellen");
  });
});
