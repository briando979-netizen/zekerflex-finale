import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_PAGES } from "@/lib/dev/app-pages.generated";
import { paginaFoto } from "@/lib/marketing/fotos";
import { STANDAARD_KOLOMMEN } from "@/lib/ontwerp/menu";
import { openbareRoutes } from "@/lib/ops/rondgang";
import { AANBOD, FOUTEN, LEREN_PAD, PRIJZEN_GOEDGEKEURD, STAPPEN, VRAGEN, euro, prijsTekst } from "@/lib/leren/klussen-krijgen";

// De gids "Zo krijg je klussen via een platform" (/leren/klussen-krijgen, 18 nov 2026). Hij staat in de sitemap, de
// rondgang en het menu, belooft geen werk en geen datum ("binnenkort"), en de prijzen komen uit één bestand.

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const alleTekst = JSON.stringify([STAPPEN, FOUTEN, AANBOD, VRAGEN]) + lees("app/(marketing)/leren/klussen-krijgen/page.tsx");

describe("de gids Klussen krijgen", () => {
  it("bestaat als pagina, staat in de rondgang, de sitemap en het menu, en heeft een foto", () => {
    expect(APP_PAGES.map((p) => p.route)).toContain(LEREN_PAD);
    expect(openbareRoutes()).toContain(LEREN_PAD);
    expect(lees("app/sitemap.ts")).toContain("LEREN_PAD");
    expect(STANDAARD_KOLOMMEN.flatMap((k) => k.links).some((l) => l.href === LEREN_PAD)).toBe(true);
    expect(paginaFoto("leren")).toBeTruthy();
  });

  it("zeven stappen met elk een handeling, vijf fouten, vijf vragen", () => {
    expect(STAPPEN).toHaveLength(7);
    for (const s of STAPPEN) expect(s.doe.length).toBeGreaterThan(20);
    expect(FOUTEN).toHaveLength(5);
    expect(VRAGEN).toHaveLength(5);
  });

  it("belooft geen werk en geen datum, en het betaalde aanbod is op aanvraag", () => {
    expect(alleTekst).not.toMatch(/binnenkort|gegarandeerd werk|garantie op werk|verzekerd van werk/i);
    expect(VRAGEN[0]?.a.startsWith("Nee.")).toBe(true);
    for (const a of AANBOD.filter((x) => x.prijsCents > 0)) expect(a.hoe.toLowerCase()).toContain("op aanvraag");
    expect(AANBOD.filter((x) => x.prijsCents === 0)).toHaveLength(2);
  });

  it("toont tot het akkoord van de eigenaar geen bedrag, alleen 'prijs op aanvraag' (een prijs op de site is een belofte)", () => {
    expect(PRIJZEN_GOEDGEKEURD).toBe(false);
    const betaald = AANBOD.find((a) => a.prijsCents > 0)!;
    expect(prijsTekst(betaald)).toEqual({ bedrag: "prijs op aanvraag", toelichting: null });
    expect(prijsTekst(betaald, true)).toEqual({ bedrag: euro(betaald.prijsCents), toelichting: betaald.per });
    expect(prijsTekst({ prijsCents: 0, per: "gratis" })).toEqual({ bedrag: "gratis", toelichting: null });
    expect(lees("app/(marketing)/leren/klussen-krijgen/page.tsx")).toContain("prijsTekst(a)");
  });

  it("schrijft prijzen in euro's zoals de rest van de site", () => {
    expect(euro(0)).toBe("gratis");
    expect(euro(3900)).toBe("€ 39");
    expect(euro(14900)).toBe("€ 149");
    expect(euro(1250)).toBe("€ 12,50");
  });
});
