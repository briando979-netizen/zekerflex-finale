import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// De sector- en stadspagina's (components/marketing/SectorLanding.tsx, 5 sectoren × 21 steden, werkgever- en
// werkerkant) hadden geen <h1>: de grote kop bovenaan was een h2 uit SectionHead (gemeten op live, 12 nov).
// Elke pagina heeft precies één kop="h1"; het beeld blijft gelijk (zelfde klassen).

const bron = readFileSync("components/marketing/SectorLanding.tsx", "utf8").replace(/\r\n/g, "\n");
const primitives = readFileSync("components/marketing/primitives.tsx", "utf8");

function component(naam: string): string {
  const start = bron.indexOf(`export function ${naam}(`);
  expect(start, naam).toBeGreaterThan(-1);
  const volgende = bron.indexOf("\nexport function ", start + 1);
  return bron.slice(start, volgende === -1 ? undefined : volgende);
}

describe("sectorpagina's hebben precies één h1", () => {
  it.each(["SectorHub", "SectorCity", "SectorWorkerHub", "SectorWorkerCity"])("%s", (naam) => {
    const stuk = component(naam);
    expect(stuk.match(/kop="h1"/g) ?? []).toHaveLength(1);
    expect(stuk).not.toMatch(/<h1[\s>]/);
  });

  it("SectionHead kan een h1 zijn en blijft standaard een h2", () => {
    expect(primitives).toMatch(/kop: Kop = "h2"/);
    expect(primitives).toMatch(/kop\?: "h1" \| "h2"/);
  });
});
