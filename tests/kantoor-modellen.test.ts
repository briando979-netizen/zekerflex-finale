import { readFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { makeKit } from "@/components/admin/city/parts";
import { armVorm, asAfstand, autoMaten, beenVorm, glasVorm, jasVorm, kruinVorm, naaldboomVorm, rompVorm, WIEL_R } from "@/components/admin/city/vormen";

// 13 nov 2026, eigenaar: "ja doe volgende stap" (echte modellen voor mensen, auto's en bomen in Beheer → Kantoor).
// Gratis modellen waren niet automatisch te halen of veel te zwaar, dus de vormen zijn zelf getekend (vormen.ts).
// Hier: de maten kloppen, het blijft licht, en de eenvoudige weergave is niet veranderd.

const doos = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox();
  return g.boundingBox ?? new THREE.Box3();
};
const driehoeken = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute("position").count) / 3;
const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

const SOORTEN = [
  ["car", 2.1, 1.1, 0.55],
  ["van", 2.6, 1.25, 1.35],
  ["bus", 4.4, 1.4, 1.5],
] as const;

describe("auto's, busjes en de bus", () => {
  it("de carrosserie is zo lang, breed en hoog als het voertuig, en staat vrij van de weg", () => {
    for (const [soort, len, wid, hgt] of SOORTEN) {
      const b = doos(rompVorm(soort, len, wid, hgt));
      expect(b.max.z - b.min.z).toBeCloseTo(len, 1);
      expect(b.max.z).toBeCloseTo(len / 2, 1);
      expect(b.max.x - b.min.x).toBeCloseTo(wid, 1);
      expect(b.max.y).toBeCloseTo(autoMaten(soort, hgt).boven, 1);
      expect(b.min.y).toBeGreaterThan(0.1);
    }
  });

  it("de wielkasten laten de wielen vrij: geen hoek van de carrosserie binnen een wiel", () => {
    for (const [soort, len, wid, hgt] of SOORTEN) {
      const p = rompVorm(soort, len, wid, hgt).getAttribute("position");
      const as = asAfstand(soort, len);
      for (let i = 0; i < p.count; i++) {
        for (const z of [-as, as]) expect(Math.hypot(p.getZ(i) - z, p.getY(i) - WIEL_R)).toBeGreaterThan(WIEL_R);
      }
    }
  });

  it("ruiten: bij een auto smaller dan de lak (een kap), bij een busje er net buiten; een bus heeft een ruitenband", () => {
    const auto = doos(glasVorm("car", 2.1, 1.1, 0.55) ?? new THREE.BufferGeometry());
    expect(auto.max.x - auto.min.x).toBeLessThan(1.1);
    expect(auto.max.y).toBeCloseTo(autoMaten("car", 0.55).dak - 0.05, 1);
    const bus = doos(glasVorm("van", 2.6, 1.25, 1.35) ?? new THREE.BufferGeometry());
    expect(bus.max.x - bus.min.x).toBeGreaterThan(1.25);
    expect(glasVorm("bus", 4.4, 1.4, 1.5)).toBeNull();
  });

  it("blijft licht: honderden driehoeken per voertuig, geen duizenden", () => {
    for (const [soort, len, wid, hgt] of SOORTEN) expect(driehoeken(rompVorm(soort, len, wid, hgt))).toBeLessThan(800);
  });
});

describe("bomen", () => {
  it("de kruin past op de plek van de oude (straal 0,95) en is licht genoeg voor duizend bomen", () => {
    const b = doos(kruinVorm());
    expect(b.max.x - b.min.x).toBeGreaterThan(1.5);
    expect(b.max.x - b.min.x).toBeLessThan(2.6);
    expect(b.max.y).toBeLessThan(1.3);
    expect(driehoeken(kruinVorm())).toBeLessThanOrEqual(130);
  });

  it("is elke keer dezelfde boom (geen toeval in de vorm)", () => {
    expect(Array.from(kruinVorm().getAttribute("position").array)).toEqual(Array.from(kruinVorm().getAttribute("position").array));
  });

  it("de den staat met zijn onderste takken boven de grond van de stam", () => {
    const b = doos(naaldboomVorm());
    expect(b.min.y).toBeCloseTo(-0.45, 2);
    expect(b.max.y).toBeCloseTo(1.95, 2);
  });
});

describe("mensen", () => {
  it("armen en benen draaien bovenaan (heup en schouder), even lang als de blokjes", () => {
    const been = doos(beenVorm());
    expect(been.max.y).toBeCloseTo(0, 3);
    expect(been.min.y).toBeCloseTo(-0.8, 3);
    expect(doos(armVorm()).min.y).toBeCloseTo(-0.62, 3);
  });

  it("de jas loopt van de knie tot de schouders; het hoofd (1,38) zit erop", () => {
    const b = doos(jasVorm());
    expect(b.min.y).toBeCloseTo(0.4, 2);
    expect(b.max.y).toBeCloseTo(1.22, 2);
    expect(b.max.z - b.min.z).toBeLessThan(b.max.x - b.min.x);
  });
});

describe("de weergave", () => {
  it("de kit weet of hij realistisch tekent, en een laag-kit erft dat", () => {
    expect(makeKit().echt).toBe(false);
    expect(makeKit(undefined, true).scope().echt).toBe(true);
    expect(bron("components/admin/city/scene.ts")).toContain("const kit = makeKit(undefined, echt);");
  });

  it("de eenvoudige weergave houdt precies de oude vormen", () => {
    expect(bron("components/admin/city/vehicles.ts")).toContain("g.add(kit.box(wid, hgt, len, bodyMat, 0, base + hgt / 2, 0, false));");
    expect(bron("components/admin/city/world.ts")).toContain('kit.geo("crown", () => new THREE.IcosahedronGeometry(0.95, 0))');
    expect(bron("components/admin/city/world.ts")).toContain("(kit.echt && far && rnd() < 0.4 ? bos : trees)");
    expect(bron("components/admin/city/life.ts")).toContain('kit.geo("p-leg", () => pivotTop(new THREE.BoxGeometry(0.16, 0.8, 0.18), 0.8))');
    expect(bron("components/admin/city/nederland.ts")).toContain('kit.geo("nl-lijf", () => new THREE.CylinderGeometry(0.22, 0.26, 1.15, 8))');
  });

  it("laadt niets van buiten", () => {
    expect(bron("components/admin/city/vormen.ts")).not.toMatch(/https?:\/\//);
  });
});
