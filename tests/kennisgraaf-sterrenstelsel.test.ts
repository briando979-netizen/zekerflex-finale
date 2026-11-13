import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { fibonacciBol, hashVan, layout3D, rondesVoor, toeval } from "@/lib/rag/graph-layout3d";
import { THEMA_KLEUREN, themaKleur } from "@/components/admin/sterrenstelsel/kleuren";
import { knowledgeGraph } from "@/lib/rag/graph";

// De weergave Sterrenstelsel (3D) van de Kennisgraaf: de vooraf berekende 3D-layout (puur, deterministisch) en de
// afspraken van de componenten (three.js alleen lazy, de keuze in localStorage in try/catch, Nederlands).

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

const KNOPEN = [
  { id: "a", thema: 1, size: 3, group: "kennisbank" },
  { id: "b", thema: 1, size: 2, group: "kennisbank" },
  { id: "c", thema: 1, size: 1, group: "blog" },
  { id: "d", thema: 2, size: 4, group: "intern" },
  { id: "e", thema: 2, size: 1, group: "intern" },
  { id: "f", thema: 2, size: 2, group: "faq" },
  { id: "begrip:x", thema: 1, size: 2, group: "begrip" },
  { id: "los", size: 1, group: "overig" },
];
const LIJNEN = [
  { source: "a", target: "b", weight: 1 },
  { source: "b", target: "c", weight: 0.6 },
  { source: "d", target: "e", weight: 1 },
  { source: "e", target: "f", weight: 0.8 },
  { source: "c", target: "d", weight: 0.2 },
  { source: "begrip:x", target: "a", weight: 0.5 },
];

const afstand = (p: [number, number, number], q: [number, number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

describe("hulpjes", () => {
  it("hashVan en toeval zijn deterministisch en verschillen per invoer", () => {
    expect(hashVan("a")).toBe(hashVan("a"));
    expect(hashVan("a")).not.toBe(hashVan("b"));
    const r1 = toeval(42);
    const r2 = toeval(42);
    const reeks1 = [r1(), r1(), r1()];
    expect(reeks1).toEqual([r2(), r2(), r2()]);
    for (const v of reeks1) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("fibonacciBol verdeelt punten over een bol met de gevraagde straal", () => {
    expect(fibonacciBol(1, 50)).toEqual([[0, 0, 0]]);
    const punten = fibonacciBol(12, 50);
    expect(punten).toHaveLength(12);
    for (const p of punten) expect(Math.hypot(...p)).toBeCloseTo(50, 0);
    // geen twee punten op elkaar
    for (let i = 0; i < punten.length; i++) for (let j = i + 1; j < punten.length; j++) expect(afstand(punten[i]!, punten[j]!)).toBeGreaterThan(10);
  });

  it("minder rondes bij veel knopen", () => {
    expect(rondesVoor(50)).toBe(250);
    expect(rondesVoor(800)).toBe(120);
    expect(rondesVoor(3000)).toBe(60);
  });
});

describe("layout3D", () => {
  it("geeft elke knoop een positie zonder NaN, deterministisch, en een zon per thema", () => {
    const l1 = layout3D(KNOPEN, LIJNEN);
    const l2 = layout3D(KNOPEN, LIJNEN);
    expect(l1).toEqual(l2);
    expect(Object.keys(l1.posities).sort()).toEqual(KNOPEN.map((k) => k.id).sort());
    for (const p of Object.values(l1.posities)) for (const v of p) expect(Number.isFinite(v)).toBe(true);
    expect(Object.keys(l1.centra).map(Number).sort()).toEqual([1, 2]);
    expect(l1.straal).toBeGreaterThan(60);
    expect(l1.rondes).toBe(250);
  });

  it("de leden van een thema liggen dichter bij hun eigen zon dan bij de andere", () => {
    const l = layout3D(KNOPEN, LIJNEN);
    for (const k of KNOPEN) {
      if (k.thema === undefined) continue;
      const eigen = afstand(l.posities[k.id]!, l.centra[k.thema]!);
      const ander = afstand(l.posities[k.id]!, l.centra[k.thema === 1 ? 2 : 1]!);
      expect(eigen, k.id).toBeLessThan(ander);
    }
    // twee verbonden knopen in hetzelfde thema liggen dichter bij elkaar dan twee onverbonden uit verschillende thema's
    expect(afstand(l.posities.a!, l.posities.b!)).toBeLessThan(afstand(l.posities.a!, l.posities.f!));
  });

  it("is leeg zonder knopen en blijft gezond met één thema of zonder lijnen", () => {
    expect(layout3D([], [])).toEqual({ posities: {}, centra: {}, straal: 0, rondes: 0 });
    const een = layout3D(KNOPEN.filter((k) => k.thema === 1), []);
    expect(een.centra[1]).toEqual([0, 0, 0]);
    expect(Object.keys(een.posities)).toHaveLength(4);
  });

  it("werkt op de echte corpusgraaf, met het aantal rondes dat bij de omvang hoort", () => {
    const g = knowledgeGraph();
    const l = layout3D(g.nodes.map((n, i) => ({ ...n, thema: (i % 3) + 1 })), g.edges, { rondes: 20 });
    expect(Object.keys(l.posities)).toHaveLength(g.nodes.length);
    expect(l.rondes).toBe(20);
  });
});

describe("kleuren van de thema's", () => {
  it("twaalf tinten, cyclisch, en grijs zonder thema", () => {
    expect(THEMA_KLEUREN).toHaveLength(12);
    expect(themaKleur(1)).toBe(THEMA_KLEUREN[0]);
    expect(themaKleur(13)).toBe(THEMA_KLEUREN[0]);
    expect(themaKleur(undefined)).toBe("#8A938C");
  });
});

describe("de componenten", () => {
  const ster = lees("components/admin/Sterrenstelsel.tsx");
  const scene = lees("components/admin/sterrenstelsel/scene.ts");
  const weergave = lees("components/admin/KennisgraafWeergave.tsx");
  const pagina = lees("app/admin/kennisgraaf/page.tsx");

  it("three.js wordt alleen lazy geladen: niet in de React-componenten of de pagina, wel in de scène", () => {
    expect(ster).not.toMatch(/from ["']three/);
    expect(weergave).not.toMatch(/from ["']three/);
    expect(pagina).not.toMatch(/from ["']three/);
    expect(ster).toContain('import("@/components/admin/sterrenstelsel/scene")');
    expect(scene).toMatch(/from "three"/);
    expect(scene).toContain("InstancedMesh");
    expect(scene).toContain("UnrealBloomPass");
    expect(scene).toContain("OrbitControls");
  });

  it("de layout komt vooraf berekend van de server en de keuze blijft per apparaat bewaard, in try/catch", () => {
    expect(ster).toContain("/api/admin/kennisgraaf?layout=3d");
    expect(weergave).toMatch(/try \{[\s\S]*localStorage\.getItem[\s\S]*\} catch/);
    expect(weergave).toMatch(/try \{[\s\S]*localStorage\.setItem[\s\S]*\} catch/);
    expect(pagina).toContain("KennisgraafWeergave");
  });

  it("lichte stand en minder beweging worden gehonoreerd; zonder WebGL een weg terug", () => {
    expect(ster).toContain("prefers-reduced-motion");
    expect(scene).toContain("minderBeweging");
    expect(ster).toContain("geen-webgl");
    expect(ster).toContain("Naar de vlakke weergave");
  });

  it("een useEffect geeft niets terug behalve een opruimfunctie", () => {
    for (const tekst of [ster, weergave]) expect(tekst).not.toMatch(/useEffect\(\s*\(\)\s*=>\s*(?![\s{])/);
  });
});
