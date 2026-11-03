import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AANBOD, aanbodHref, aanbodVan, eigenPaginas, PIJLERS, prijsTekst, WERK_ZOEKEN } from "@/lib/marketing/aanbod";

const ROOT = join(__dirname, "..");
// een openbare pagina in app/(marketing) of app/<map>
const paginaBestaat = (href: string) => {
  const pad = href.split(/[?#]/)[0]!.replace(/^\//, "");
  return [join(ROOT, "app", "(marketing)", pad, "page.tsx"), join(ROOT, "app", pad, "page.tsx")].some((f) => existsSync(f));
};

describe("aanbod (lib/marketing/aanbod.ts)", () => {
  it("elke pijler heeft aanbod en elk item hoort bij een bestaande pijler", () => {
    for (const p of PIJLERS) expect(AANBOD.some((a) => a.pijler === p.sleutel), p.naam).toBe(true);
    for (const a of AANBOD) expect(PIJLERS.map((p) => p.sleutel)).toContain(a.pijler);
  });

  it("slugs zijn uniek en netjes", () => {
    const slugs = AANBOD.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("elke link wijst naar een bestaande pagina", () => {
    for (const a of AANBOD) {
      if (a.pagina) expect(paginaBestaat(a.pagina), `${a.naam} → ${a.pagina}`).toBe(true);
      expect(paginaBestaat(a.start.href), `${a.naam} start → ${a.start.href}`).toBe(true);
    }
    for (const w of WERK_ZOEKEN) expect(paginaBestaat(w.href), w.href).toBe(true);
  });

  it("items zonder eigen pagina krijgen /aanbod/<slug>, de rest linkt naar hun pagina", () => {
    for (const a of AANBOD) expect(aanbodHref(a)).toBe(a.pagina ?? `/aanbod/${a.slug}`);
    expect(eigenPaginas().every((a) => !a.pagina)).toBe(true);
    expect(aanbodVan("horeca")?.naam).toBe("Horecasoftware");
    // een item met een pagina elders krijgt geen dubbele /aanbod-pagina
    expect(aanbodVan("flexwerkers-inhuren")).toBeUndefined();
    expect(aanbodVan("bestaat-niet")).toBeUndefined();
  });

  it("de footer-links naar het aanbod bestaan", () => {
    const footer = readFileSync(join(ROOT, "components", "marketing", "SiteFooter.tsx"), "utf8");
    for (const m of footer.matchAll(/href: "\/aanbod\/([a-z0-9-]+)"/g)) expect(aanbodVan(m[1]!), m[1]).toBeDefined();
  });

  it("geen verzonnen prijzen: zonder prijs staat er 'Op aanvraag'", () => {
    const zonder = AANBOD.find((a) => !a.prijs);
    expect(zonder && prijsTekst(zonder)).toBe("Op aanvraag");
    // de platformfee komt overeen met de staffel in lib/pricing/tiers.ts
    expect(AANBOD.find((a) => a.slug === "flexwerkers-inhuren")?.prijs).toMatch(/€ 3,50 per gewerkt uur/);
  });

  it("teksten zijn Nederlands en kort genoeg voor kaarten", () => {
    for (const a of AANBOD) {
      expect(a.kort.length, a.naam).toBeLessThanOrEqual(110);
      expect(a.punten.length, a.naam).toBeGreaterThanOrEqual(3);
      expect(a.punten.length, a.naam).toBeLessThanOrEqual(6);
    }
  });
});
