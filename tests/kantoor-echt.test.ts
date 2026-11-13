import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 13 nov 2026, eigenaar: "maak het kantoor realistisch zoals de werkelijke wereld". Stap 1: echte lucht (atmosfeer en
// wolken naar het weer), weerspiegelingen en tone mapping; "Eenvoudig" geeft precies de oude weergave terug.
const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("Beheer → Kantoor realistisch", () => {
  const scene = lees("components/admin/city/scene.ts");
  const kantoor = lees("components/admin/Office3D.tsx");

  it("de echte lucht, de omgeving en de tone mapping staan alleen aan in de realistische weergave", () => {
    expect(scene).toContain('import { Sky } from "three/examples/jsm/objects/Sky.js";');
    expect(scene).toContain("const echt = opts.realistisch !== false;");
    expect(scene).toMatch(/if \(echt\) \{\s*renderer\.toneMapping = THREE\.NeutralToneMapping;/);
    expect(scene).toContain("const pmrem = echt ? new THREE.PMREMGenerator(renderer) : null;");
    expect(scene).toContain("const echteLucht = echt ? new Sky() : null;");
  });

  it("ruimt alles op bij het sluiten (geen geheugenlek bij wisselen van weergave)", () => {
    for (const r of ["echteLucht?.geometry.dispose();", "echteLucht?.material.dispose();", "envRT?.dispose();", "pmrem?.dispose();"]) {
      expect(scene).toContain(r);
    }
  });

  it("de keuze staat in de browser (met try/catch) en wisselen bouwt de stad opnieuw", () => {
    expect(kantoor).toContain('const WEERGAVE_SLEUTEL = "zf_kantoor_weergave";');
    expect(kantoor).toMatch(/try \{\s*if \(window\.localStorage\.getItem\(WEERGAVE_SLEUTEL\)/);
    expect(kantoor).toContain('realistisch: weergave === "echt",');
    expect(kantoor).toContain("}, [weergave]);");
    expect(kantoor).toContain("Weergave: realistisch");
  });

  it("niets van buiten: geen modellen of texturen van een andere site", () => {
    expect(scene).not.toMatch(/https?:\/\//);
  });
});
