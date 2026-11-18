import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_PAGES } from "@/lib/dev/app-pages.generated";
import { paginaFoto } from "@/lib/marketing/fotos";
import { STANDAARD_KOLOMMEN } from "@/lib/ontwerp/menu";
import { openbareRoutes } from "@/lib/ops/rondgang";
import { AANBOD_BEDRIJF, FEE_TEKST, FOUTEN_BEDRIJF, LEREN_BEDRIJF_PAD, PRIJZEN_BEDRIJF_GOEDGEKEURD, STAPPEN_BEDRIJF, VRAGEN_BEDRIJF, prijsTekstBedrijf } from "@/lib/leren/personeel-krijgen";

// De bedrijvenkant van de gids (/leren/personeel-krijgen, 18 nov 2026): zelfde regels als de werkersgids: in sitemap,
// rondgang en menu; geen "binnenkort", geen garantie dat een klus vult, geen verzekering; de fee uit één bron.

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const alleTekst = JSON.stringify([STAPPEN_BEDRIJF, FOUTEN_BEDRIJF, AANBOD_BEDRIJF, VRAGEN_BEDRIJF]) + lees("app/(marketing)/leren/personeel-krijgen/page.tsx");

describe("de gids Personeel krijgen (bedrijven)", () => {
  it("bestaat als pagina, staat in de rondgang, de sitemap en het menu, en heeft een foto", () => {
    expect(APP_PAGES.map((p) => p.route)).toContain(LEREN_BEDRIJF_PAD);
    expect(openbareRoutes()).toContain(LEREN_BEDRIJF_PAD);
    expect(lees("app/sitemap.ts")).toContain("LEREN_BEDRIJF_PAD");
    expect(STANDAARD_KOLOMMEN.flatMap((k) => k.links).some((l) => l.href === LEREN_BEDRIJF_PAD)).toBe(true);
    expect(paginaFoto("leren-bedrijven")).toBeTruthy();
  });

  it("zeven stappen met een handeling, vijf fouten, vijf vragen; de fee komt uit lib/pricing/tiers.ts", () => {
    expect(STAPPEN_BEDRIJF).toHaveLength(7);
    for (const s of STAPPEN_BEDRIJF) expect(s.doe.length).toBeGreaterThan(20);
    expect(FOUTEN_BEDRIJF).toHaveLength(5);
    expect(VRAGEN_BEDRIJF).toHaveLength(5);
    expect(FEE_TEKST).toBe("€ 3,50");
    expect(VRAGEN_BEDRIJF.find((v) => v.q === "Wat kost het?")?.a).toContain(FEE_TEKST);
  });

  it("belooft niet dat elke klus vult, noemt geen verzekering en geen datum; betaald = op aanvraag en zonder bedrag tot het akkoord", () => {
    expect(alleTekst).not.toMatch(/binnenkort|verzeker|gegarandeerd gevuld|altijd gevuld/i);
    expect(VRAGEN_BEDRIJF[0]?.a.startsWith("Nee.")).toBe(true);
    for (const a of AANBOD_BEDRIJF.filter((x) => x.prijsCents > 0)) {
      expect(a.hoe.toLowerCase()).toContain("op aanvraag");
      expect(prijsTekstBedrijf(a).bedrag).toEqual(PRIJZEN_BEDRIJF_GOEDGEKEURD ? expect.stringContaining("€") : "prijs op aanvraag");
    }
    expect(AANBOD_BEDRIJF.filter((x) => x.prijsCents === 0)).toHaveLength(2);
  });
});
