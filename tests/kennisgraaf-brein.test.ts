import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Het Brein (3D) van de Kennisgraaf: de 3D-layout van de documentgraaf (puur, deterministisch), de plek en de stralen van
// de neuronen (lib/rag/brein-layout.ts), de raadpleegtelling (lib/rag/vuren.ts), de voeding (lib/rag/voeding.ts, puur deel)
// en de afspraken van de componenten (three.js alleen lazy, keuze in localStorage in try/catch, Nederlands).

const h = vi.hoisted(() => ({ kv: new Map<string, { waarde: unknown; op: number }>(), storing: false }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (h.kv.has(k) ? structuredClone(h.kv.get(k)!.waarde) : null),
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, { waarde: structuredClone(v), op: Date.now() }),
  kvDelete: async (k: string) => void h.kv.delete(k),
  kvListEntries: async (p: string) => {
    if (h.storing) throw new Error("kv weg");
    return [...h.kv].filter(([k]) => k.startsWith(p)).map(([key, r]) => ({ key, value: structuredClone(r.waarde) }));
  },
  kvDeleteStale: async (p: string, voor: Date) => {
    let n = 0;
    for (const [k, r] of h.kv) if (k.startsWith(p) && r.op < voor.getTime() && h.kv.delete(k)) n++;
    return n;
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { fibonacciBol, hashVan, layout3D, rondesVoor, toeval } from "@/lib/rag/graph-layout3d";
import { clusterCentra, neuronLijnen, neuronPosities, vuurPercentage, type BreinNeuronInvoer } from "@/lib/rag/brein-layout";
import { schrijfVuren, telVuren, VUREN_PREFIX, vuurStand } from "@/lib/rag/vuren";
import { voedingEntries, voedingTitel } from "@/lib/rag/voeding";
import { THEMA_KLEUREN, themaKleur } from "@/components/admin/brein/kleuren";
import { knowledgeGraph } from "@/lib/rag/graph";

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");
const afstand = (p: readonly number[], q: readonly number[]) => Math.hypot((p[0] ?? 0) - (q[0] ?? 0), (p[1] ?? 0) - (q[1] ?? 0), (p[2] ?? 0) - (q[2] ?? 0));

const NU = new Date("2026-11-13T15:00:00+01:00");
beforeEach(() => {
  h.kv.clear();
  h.storing = false;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
});
afterEach(() => vi.useRealTimers());

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

describe("3D-layout van de documentgraaf", () => {
  it("hashVan, toeval en fibonacciBol zijn deterministisch", () => {
    expect(hashVan("a")).toBe(hashVan("a"));
    expect(hashVan("a")).not.toBe(hashVan("b"));
    const r1 = toeval(42);
    const r2 = toeval(42);
    expect([r1(), r1()]).toEqual([r2(), r2()]);
    expect(fibonacciBol(1, 50)).toEqual([[0, 0, 0]]);
    const punten = fibonacciBol(12, 50);
    for (const p of punten) expect(Math.hypot(...p)).toBeCloseTo(50, 0);
    for (let i = 0; i < punten.length; i++) for (let j = i + 1; j < punten.length; j++) expect(afstand(punten[i]!, punten[j]!)).toBeGreaterThan(10);
    expect([rondesVoor(50), rondesVoor(800), rondesVoor(3000)]).toEqual([250, 120, 60]);
  });

  it("elke knoop krijgt een positie bij zijn eigen zon; verbonden knopen liggen dichter bij elkaar", () => {
    const l = layout3D(KNOPEN, LIJNEN);
    expect(l).toEqual(layout3D(KNOPEN, LIJNEN));
    expect(Object.keys(l.posities).sort()).toEqual(KNOPEN.map((k) => k.id).sort());
    for (const p of Object.values(l.posities)) for (const v of p) expect(Number.isFinite(v)).toBe(true);
    for (const k of KNOPEN) {
      if (k.thema === undefined) continue;
      expect(afstand(l.posities[k.id]!, l.centra[k.thema]!), k.id).toBeLessThan(afstand(l.posities[k.id]!, l.centra[k.thema === 1 ? 2 : 1]!));
    }
    expect(afstand(l.posities.a!, l.posities.b!)).toBeLessThan(afstand(l.posities.a!, l.posities.f!));
    expect(layout3D([], [])).toEqual({ posities: {}, centra: {}, straal: 0, rondes: 0 });
    const g = knowledgeGraph();
    expect(Object.keys(layout3D(g.nodes.map((n, i) => ({ ...n, thema: (i % 3) + 1 })), g.edges, { rondes: 20 }).posities)).toHaveLength(g.nodes.length);
  });
});

const NEURONEN: BreinNeuronInvoer[] = [
  { id: "n1", cluster: 0, sourceRef: "corpus:p1", chunkIndex: 0, docId: "doc-a" },
  { id: "n2", cluster: 0, sourceRef: "corpus:p1", chunkIndex: 1, docId: "doc-a" },
  { id: "n3", cluster: 0, sourceRef: "corpus:p2", chunkIndex: 0, docId: "doc-b" },
  { id: "n4", cluster: 1, sourceRef: "auditLog:1", chunkIndex: 0 },
  { id: "n5", cluster: 1, sourceRef: "auditLog:1", chunkIndex: 1 },
  { id: "n6", cluster: 1, sourceRef: "auditLog:2", chunkIndex: 0 },
  { id: "v1", cluster: 2, sourceRef: "voeding:x", chunkIndex: 0, buren: ["n1", "n4"] },
];

describe("brein-layout", () => {
  const { centra, straal } = clusterCentra(3, 2000);
  const docPos = { "doc-a": [10, 0, 0] as [number, number, number], "doc-b": [-10, 0, 0] as [number, number, number] };
  const docCentra = { "doc-a": [0, 0, 0] as [number, number, number], "doc-b": [0, 0, 0] as [number, number, number] };

  it("clusters liggen op een bol die meegroeit; neuronen rond hun cluster, voeding tussen zijn buren", () => {
    expect(centra).toHaveLength(3);
    expect(straal).toBeGreaterThan(100);
    const p = neuronPosities(NEURONEN, centra, docPos, docCentra);
    expect(Object.keys(p).sort()).toEqual(NEURONEN.map((n) => n.id).sort());
    expect(p).toEqual(neuronPosities(NEURONEN, centra, docPos, docCentra));
    // kennisbankstukken van hetzelfde document klonteren rond de plek van dat document in hun cluster
    expect(afstand(p.n1!, p.n2!)).toBeLessThan(8);
    expect(afstand(p.n1!, centra[0]!)).toBeLessThan(afstand(p.n1!, centra[1]!));
    // bronstukken: dezelfde bron dichter bij elkaar dan bij een andere bron
    expect(afstand(p.n4!, p.n5!)).toBeLessThan(afstand(p.n4!, p.n6!) + 6);
    expect(afstand(p.n4!, centra[1]!)).toBeLessThan(afstand(p.n4!, centra[0]!));
    // voeding: in het midden van zijn buren (echte verwantschap), niet in zijn eigen cluster
    const midden = [(p.n1![0] + p.n4![0]) / 2, (p.n1![1] + p.n4![1]) / 2, (p.n1![2] + p.n4![2]) / 2];
    expect(afstand(p.v1!, midden)).toBeLessThan(4);
  });

  it("stralen: opeenvolgende stukken van een bron, voeding naar zijn buren, documenten naar verbonden documenten; nooit dubbel", () => {
    const l = neuronLijnen(NEURONEN, [{ source: "doc-a", target: "doc-b" }, { source: "doc-a", target: "doc-onbekend" }]);
    const paren = l.map(([a, b]) => `${NEURONEN[a]!.id}-${NEURONEN[b]!.id}`).sort();
    expect(paren).toEqual(["n1-n2", "n1-n3", "n4-n5", "v1-n1", "v1-n4"].sort());
    expect(neuronLijnen(NEURONEN, [], 2)).toHaveLength(2);
  });

  it("vuurt: het deel van de neuronen met minstens één raadpleging, of null zonder meting", () => {
    const per = new Map([["n1", 3], ["n2", 0], ["n4", 1]]);
    expect(vuurPercentage(["n1", "n2", "n3", "n4"], per, true)).toBe(50);
    expect(vuurPercentage(["n1", "n2"], per, false)).toBeNull();
    expect(vuurPercentage([], per, true)).toBeNull();
  });
});

describe("vuren (raadpleegtelling)", () => {
  it("telt in het geheugen, schrijft per Amsterdamse dag één sleutel met alleen id's en aantallen, en leest de laatste dagen terug", async () => {
    expect(await vuurStand(7, NU)).toEqual({ perNeuron: new Map(), dagen: 7, gemeten: false });
    telVuren(["n1", "n2"]);
    telVuren(["n1"]);
    expect(await schrijfVuren(NU)).toBe(2);
    expect([...h.kv.keys()]).toEqual([`${VUREN_PREFIX}2026-11-13`]);
    expect(h.kv.get(`${VUREN_PREFIX}2026-11-13`)!.waarde).toEqual({ n1: 2, n2: 1 });
    telVuren(["n2"]);
    await schrijfVuren(NU);
    expect(h.kv.get(`${VUREN_PREFIX}2026-11-13`)!.waarde).toEqual({ n1: 2, n2: 2 });
    // een oude dag telt niet mee voor de laatste 7 dagen, maar betekent wel dat er gemeten is
    h.kv.set(`${VUREN_PREFIX}2026-10-01`, { waarde: { n9: 5 }, op: Date.now() });
    const stand = await vuurStand(7, NU);
    expect(stand.gemeten).toBe(true);
    expect([...stand.perNeuron]).toEqual([["n1", 2], ["n2", 2]]);
    // niets te schrijven = 0, zonder KV-actie
    expect(await schrijfVuren(NU)).toBe(0);
  });

  it("een storing geeft een lege, niet-gemeten stand", async () => {
    h.storing = true;
    expect((await vuurStand(7, NU)).gemeten).toBe(false);
  });
});

describe("voeding (puur deel)", () => {
  it("de titel is de eerste zin of regel, ingekort; de herindexering ziet dezelfde sourceRef, titel en tekst", () => {
    expect(voedingTitel("Uitzendkrachten krijgen vakantiegeld. Dat staat op de loonstrook.")).toBe("Uitzendkrachten krijgen vakantiegeld.");
    expect(voedingTitel("Eerste regel zonder punt\nTweede regel")).toBe("Eerste regel zonder punt");
    expect(voedingTitel("x".repeat(100))).toHaveLength(78);
    expect(voedingTitel("x".repeat(100)).endsWith("…")).toBe(true);
    expect(voedingTitel("   ")).toBe("Zonder titel");
    expect(voedingEntries([{ id: "abc", titel: "T", tekst: "tekst", op: "2026-11-13T14:00:00.000Z", door: "usr", buren: [] }])).toEqual([{ sourceRef: "voeding:abc", title: "T", text: "tekst" }]);
  });
});

describe("kleuren en componenten", () => {
  it("twaalf tinten, cyclisch, grijs zonder thema", () => {
    expect(THEMA_KLEUREN).toHaveLength(12);
    expect(themaKleur(13)).toBe(THEMA_KLEUREN[0]);
    expect(themaKleur(undefined)).toBe("#8A938C");
  });

  const brein = lees("components/admin/Brein.tsx");
  const scene = lees("components/admin/brein/scene.ts");
  const weergave = lees("components/admin/KennisgraafWeergave.tsx");
  const pagina = lees("app/admin/kennisgraaf/page.tsx");

  it("three.js alleen lazy (niet in de React-componenten of de pagina, wel in de scène), echte gegevens van de server", () => {
    for (const t of [brein, weergave, pagina]) expect(t).not.toMatch(/from ["']three/);
    expect(brein).toContain('import("@/components/admin/brein/scene")');
    expect(brein).toContain("/api/admin/kennisgraaf?brein=1");
    expect(scene).toMatch(/from "three"/);
    expect(scene).toContain("UnrealBloomPass");
    expect(scene).toContain("OrbitControls");
    expect(scene).toContain("AdditiveBlending");
    expect(scene).toContain("geen activiteit gemeten");
  });

  it("de keuze blijft per apparaat bewaard in try/catch; voeden gaat via POST; lichte stand, minder beweging en de weg terug zonder WebGL", () => {
    expect(weergave).toMatch(/try \{[\s\S]*localStorage\.getItem[\s\S]*\} catch/);
    expect(weergave).toMatch(/try \{[\s\S]*localStorage\.setItem[\s\S]*\} catch/);
    expect(pagina).toContain("KennisgraafWeergave");
    expect(brein).toContain('method: "POST"');
    expect(brein).toContain("Voed het brein");
    expect(brein).toContain("prefers-reduced-motion");
    expect(scene).toContain("minderBeweging");
    expect(brein).toContain("Naar de vlakke weergave");
  });

  it("een useEffect geeft niets terug behalve een opruimfunctie, en geen lookbehind in clientcode", () => {
    for (const t of [brein, weergave]) {
      expect(t).not.toMatch(/useEffect\(\s*\(\)\s*=>\s*(?![\s{])/);
      expect(t).not.toMatch(/\(\?<[=!]/);
    }
  });
});
