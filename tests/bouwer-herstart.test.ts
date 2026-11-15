import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Een herstart van de Bouwer (elke uitrol doet dat) breekt lopend werk af. Een opdracht waar nog niets aan veranderd is, moet
// daarna niets blokkeren: anders staat "Niet gelukt" open en kan de eigenaar niets nieuws beginnen (15 nov 2026).

const bron = readFileSync("deploy/bouwer/werker/server.mjs", "utf8").split("\r\n").join("\n");
const blok = bron.slice(bron.indexOf("// Een herstart breekt lopend werk af"), bron.indexOf("server.listen(POORT"));

describe("de Bouwer na een herstart", () => {
  it("het blok bestaat en staat voor het luisteren", () => {
    expect(blok.length).toBeGreaterThan(200);
  });

  it("werk dat onderweg was, wordt mislukt (met de uitleg)", () => {
    expect(blok).toContain('t.staat = "mislukt"');
    expect(blok).toContain("De Bouwer werd herstart tijdens het werk.");
  });

  it("zonder veranderde bestanden gaat de opdracht vanzelf naar weggegooid", () => {
    expect(blok).toContain("gewijzigdeBestanden()");
    expect(blok).toMatch(/b\.length === 0/);
    expect(blok).toContain('t.staat = "weggegooid"');
  });

  it("een leesfout of een onbekende werkkopie laat de opdracht mislukt (geen werk vernietigen op een gok)", () => {
    expect(blok).toMatch(/\(\) => false\)/);
  });
});
