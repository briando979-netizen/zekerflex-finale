import { describe, expect, it } from "vitest";
import { CITIES, type City } from "@/lib/seo-cities";
import { SECTORS } from "@/lib/seo-sectors";
import { gelijkenis, woorden } from "@/lib/seo-stad";
import { paginaTekst, sectorStadPagina, sectorWerkStadPagina } from "@/lib/seo-stad-pagina";
import { bijbaanStad, bijbaanStadTekst } from "@/lib/seo-bijbaan";

// Meting 22 nov 2026: de stadspagina's van één branche waren voor 64–70% gelijk (Jaccard over 5-woordstukjes van de eerste
// 400 woorden zichtbare tekst, zonder menu, kop en voettekst), en Google koos voor de kleinere steden een andere canonieke.
// De tekst van die pagina's komt nu uit config en CBS-cijfers (lib/seo-stad-pagina.ts, lib/seo-bijbaan.ts), dus hier is
// hij zonder browser te meten. Doel: elk paar steden van dezelfde soort pagina onder de 40%.
// Faalt deze test na een tekstwijziging: zet algemene uitleg op het overzicht van de branche, niet op elke stadspagina.

const GRENS = 0.4;

function slechtstePaar(maak: (c: City) => string): { g: number; paar: string } {
  const teksten = CITIES.map((c) => [c.slug, maak(c)] as const);
  let slechtst = { g: 0, paar: "" };
  for (let i = 0; i < teksten.length; i++) {
    for (let j = i + 1; j < teksten.length; j++) {
      const a = teksten[i]!;
      const b = teksten[j]!;
      const g = gelijkenis(a[1], b[1]);
      if (g > slechtst.g) slechtst = { g, paar: `${a[0]}/${b[0]}` };
    }
  }
  return slechtst;
}

describe("gelijkenis: Jaccard over 5-woordstukjes van de eerste 400 woorden", () => {
  it("rekent zoals de meting", () => {
    expect(gelijkenis("een twee drie vier vijf zes", "een twee drie vier vijf zes")).toBe(1);
    expect(gelijkenis("een twee drie vier vijf", "zes zeven acht negen tien")).toBe(0);
    // 3 stukjes aan elke kant, waarvan 2 gelijk: 2 gedeeld door 4 verschillende
    expect(gelijkenis("a b c d e f g", "a b c d e f x")).toBeCloseTo(2 / 4);
    // alleen de eerste 400 woorden tellen
    const begin = Array.from({ length: 400 }, (_, i) => `w${i}`).join(" ");
    expect(gelijkenis(`${begin} anders een`, `${begin} heel ander slot`)).toBe(1);
    // een getal blijft één woord, leestekens tellen niet
    expect(woorden("Er zijn 4.210 horecazaken: 6,2 per 1.000!")).toEqual(["er", "zijn", "4210", "horecazaken", "62", "per", "1000"]);
  });

  it.each(SECTORS)("$key: werkgevers- en werkerkant, elk paar steden onder de 40%", (s) => {
    const bedrijf = slechtstePaar((c) => paginaTekst(sectorStadPagina(s, c)));
    const werker = slechtstePaar((c) => paginaTekst(sectorWerkStadPagina(s, c)));
    expect(bedrijf.g, `/${s.slug}: ${bedrijf.paar}`).toBeLessThan(GRENS);
    expect(werker.g, `/${s.workerSlug}: ${werker.paar}`).toBeLessThan(GRENS);
  });

  it("/bijbaan/<stad>: elk paar steden onder de 40%", () => {
    const r = slechtstePaar((c) => bijbaanStadTekst(bijbaanStad(c)));
    expect(r.g, r.paar).toBeLessThan(GRENS);
  });

  it("de pagina's hebben genoeg tekst om te meten (anders zegt de gelijkenis niets)", () => {
    for (const c of CITIES) {
      expect(woorden(paginaTekst(sectorWerkStadPagina(SECTORS[0]!, c))).length, c.slug).toBeGreaterThan(400);
      expect(woorden(bijbaanStadTekst(bijbaanStad(c))).length, c.slug).toBeGreaterThan(400);
    }
  });
});
