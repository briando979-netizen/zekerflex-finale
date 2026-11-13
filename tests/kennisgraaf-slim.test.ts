import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { benoemThemas, inproduct, kiesK, normaliseer, ontdekThemas, synapsen, type Vector } from "@/lib/rag/brein-slim";

// Het slimme deel van het Brein (lib/rag/brein-slim.ts), puur: synapsen (echte betekenisverwanten), zelf ontdekte thema's
// (k-means, deterministisch) en hun namen (TF-IDF over de thema's). Plus de afspraken van de componenten.

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

/** Vectoren rond drie richtingen, met een vaste kleine afwijking: drie duidelijke groepen. */
function proef(): Vector[] {
  const basis: number[][] = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
  ];
  const uit: Vector[] = [];
  basis.forEach((b, g) => {
    for (let i = 0; i < 6; i++) {
      const afw = ((i * 7919) % 13) / 100;
      uit.push({ id: `g${g}-${i}`, v: b.map((x, k) => x + (k === 3 ? afw : 0) + (k === (g + 1) % 3 ? afw / 3 : 0)) });
    }
  });
  return uit;
}

describe("normaliseer en inproduct", () => {
  it("lengte 1 en de cosinus van gelijke richtingen is 1", () => {
    const n = normaliseer([3, 4]);
    expect(Math.hypot(...n)).toBeCloseTo(1, 9);
    expect(inproduct(normaliseer([2, 0]), normaliseer([5, 0]))).toBeCloseTo(1, 9);
    expect(inproduct(normaliseer([1, 0]), normaliseer([0, 1]))).toBeCloseTo(0, 9);
    expect(Math.hypot(...normaliseer([0, 0]))).toBe(0);
  });
});

describe("synapsen", () => {
  it("per stuk hooguit k verwanten boven de drempel, als unieke paren, sterkste eerst", () => {
    const v = proef();
    const s = synapsen(v, 2, 0.5);
    expect(s.length).toBeGreaterThan(0);
    const gezien = new Set(s.map(([a, b]) => `${a}|${b}`));
    expect(gezien.size).toBe(s.length);
    for (const [a, b, score] of s) {
      expect(a < b).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0.5);
      // alleen binnen de eigen groep: andere groepen staan haaks op elkaar (cosinus ≈ 0)
      expect(a.slice(0, 2)).toBe(b.slice(0, 2));
    }
    for (let i = 1; i < s.length; i++) expect(s[i - 1]![2]).toBeGreaterThanOrEqual(s[i]![2]);
    // elk stuk komt in hooguit k + (k van anderen) paren voor, en minstens één
    const tel = new Map<string, number>();
    for (const [a, b] of s) {
      tel.set(a, (tel.get(a) ?? 0) + 1);
      tel.set(b, (tel.get(b) ?? 0) + 1);
    }
    for (const x of v) expect(tel.get(x.id) ?? 0).toBeGreaterThanOrEqual(1);
    expect(synapsen([], 4, 0.5)).toEqual([]);
    expect(synapsen(v, 4, 0.999999)).toEqual([]);
  });
});

describe("ontdekThemas (k-means)", () => {
  it("vindt de drie groepen, deterministisch, grootste eerst en zonder lege thema's", () => {
    const v = proef();
    const a = ontdekThemas(v, 3);
    const b = ontdekThemas(v, 3);
    expect(a).toEqual(b);
    expect(a.k).toBe(3);
    expect(a.groottes).toEqual([6, 6, 6]);
    for (let g = 0; g < 3; g++) {
      const themas = new Set(Array.from({ length: 6 }, (_, i) => a.per[`g${g}-${i}`]));
      expect(themas.size, `groep ${g} in één thema`).toBe(1);
    }
    expect(new Set(Object.values(a.per)).size).toBe(3);
    expect(a.rondes).toBeGreaterThanOrEqual(1);
  });

  it("kiesK groeit met de wortel van het aantal, tussen 6 en 16; k-means is netjes leeg zonder invoer", () => {
    expect(kiesK(0)).toBe(0);
    expect(kiesK(10)).toBe(5);
    expect(kiesK(500)).toBe(6);
    expect(kiesK(2028)).toBe(10);
    expect(kiesK(100000)).toBe(16);
    expect(ontdekThemas([], 3)).toEqual({ per: {}, groottes: [], k: 0, rondes: 0 });
    // meer thema's dan stukken: elk stuk zijn eigen thema, lege vallen weg
    const klein = ontdekThemas(proef().slice(0, 2), 5);
    expect(klein.k).toBeLessThanOrEqual(2);
  });
});

describe("benoemThemas", () => {
  it("geeft elk thema de woorden die er eigen aan zijn, niet de woorden die overal staan", () => {
    const namen = benoemThemas([
      "Pensioen pensioen pensioen via StiPP voor uitzendkrachten. Loonstrook en vakantiegeld. Platform platform.",
      "Website website website laten maken met domeinnaam en certificaat. Platform platform.",
      "Factuur factuur factuur betalen via iDEAL, btw en incasso. Platform platform.",
    ]);
    expect(namen).toHaveLength(3);
    expect(namen[0]?.[0]?.toLowerCase().startsWith("pensioen")).toBe(true);
    expect(namen[1]?.[0]?.toLowerCase().startsWith("website")).toBe(true);
    expect(namen[2]?.[0]?.toLowerCase().startsWith("factu")).toBe(true);
    for (const n of namen) expect(n.map((x) => x.toLowerCase())).not.toContain("platform");
    expect(benoemThemas([])).toEqual([]);
  });
});

describe("de slimme componenten", () => {
  const brein = lees("components/admin/Brein.tsx");
  const scene = lees("components/admin/brein/scene.ts");
  const slim = lees("lib/rag/slim.ts");

  it("vragen gaan door hetzelfde geheugen als Jarvis en de gebruikte neuronen lichten op; de uitleg komt alleen uit echte stukken", () => {
    expect(brein).toContain("/api/admin/rag/ask");
    expect(brein).toContain("setOplichten");
    expect(scene).toContain("setOplichten");
    expect(brein).toContain("?uitleg=");
    expect(slim).toContain("UITSLUITEND wat in de stukken staat");
    expect(slim).toContain("geen taalmodel beschikbaar");
  });

  it("twee indelingen: bron/thema en de zelf ontdekte betekenis, met zweven ertussen; three.js blijft lazy", () => {
    expect(brein).toContain('"betekenis"');
    expect(scene).toContain("setIndeling");
    expect(scene).toContain("ZWEEF_MS");
    expect(brein).not.toMatch(/from ["']three/);
    expect(brein).toContain('import("@/components/admin/brein/scene")');
  });
});
