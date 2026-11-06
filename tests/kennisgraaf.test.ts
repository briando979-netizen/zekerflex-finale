import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { conceptenUit, hiaten, naarGraphML, pagerank, verbondenDelen } from "@/lib/rag/graph-analyse";
import { knowledgeGraph } from "@/lib/rag/graph";

// De Kennisgraaf (lib/rag/graph-analyse.ts + graph.ts): rekenwerk zonder database.

describe("conceptenUit", () => {
  it("vindt begrippen die in minstens twee documenten zwaar wegen, met een leesbare vorm", () => {
    const docs = [
      { id: "a", text: "Uitzendkrachten krijgen een loonstrook. De loonstrook toont vakantiegeld en pensioen voor uitzendkrachten." },
      { id: "b", text: "Pensioen via StiPP: elke uitzendkracht bouwt pensioen op. De loonstrook laat het pensioen zien." },
      { id: "c", text: "Een website laten maken met een eigen domeinnaam en certificaat; de website is snel." },
    ];
    const b = conceptenUit(docs, 10, 8);
    const labels = b.map((x) => x.label);
    expect(labels.some((l) => l.startsWith("pensioen"))).toBe(true);
    expect(labels.some((l) => l.startsWith("loonstrook"))).toBe(true);
    // "website" staat maar in één document zwaar: geen begrip
    expect(labels).not.toContain("website");
    const pensioen = b.find((x) => x.label.startsWith("pensioen"))!;
    expect(pensioen.docs.map((d) => d.docId).sort()).toEqual(["a", "b"]);
    expect(pensioen.id).toMatch(/^begrip:/);
  });

  it("is leeg zonder documenten", () => {
    expect(conceptenUit([])).toEqual([]);
  });
});

describe("verbondenDelen en pagerank", () => {
  const ids = ["a", "b", "c", "d", "e"];
  const lijnen = [
    { source: "a", target: "b", weight: 1 },
    { source: "b", target: "c", weight: 1 },
    { source: "d", target: "e", weight: 0.5 },
  ];

  it("splitst de graaf in samenhangende delen, grootste eerst", () => {
    expect(verbondenDelen(ids, lijnen)).toEqual([["a", "b", "c"], ["d", "e"]]);
    expect(verbondenDelen(["x"], [])).toEqual([["x"]]);
  });

  it("geeft het knooppunt in het midden de hoogste score en telt op tot 1", () => {
    const pr = pagerank(ids, lijnen);
    const som = [...pr.values()].reduce((s, v) => s + v, 0);
    expect(som).toBeCloseTo(1, 5);
    expect(pr.get("b")!).toBeGreaterThan(pr.get("a")!);
    expect(pr.get("b")!).toBeGreaterThan(pr.get("d")!);
  });
});

describe("hiaten", () => {
  it("noemt losse documenten, dun gedekte begrippen en eilandjes van twee", () => {
    const knopen = [
      { id: "a", label: "A", group: "kennisbank", size: 1 },
      { id: "b", label: "B", group: "kennisbank", size: 1 },
      { id: "c", label: "C", group: "blog", size: 1 },
      { id: "begrip:x", label: "x", group: "begrip", size: 2 },
    ];
    const lijnen = [
      { source: "a", target: "b", weight: 0.2, soort: "begrippen" as const },
      { source: "begrip:x", target: "c", weight: 0.3, soort: "begrip" as const },
    ];
    const h = hiaten(knopen, lijnen, [{ id: "begrip:x", label: "x", gewicht: 1, docs: [{ docId: "a", gewicht: 1 }, { docId: "c", gewicht: 1 }] }]);
    expect(h.los).toEqual(["c"]);
    expect(h.dunneBegrippen).toEqual(["x"]);
    expect(h.eilandjes).toEqual([["a", "b"]]);
  });
});

describe("naarGraphML", () => {
  it("schrijft geldige GraphML met ontsnapte tekens", () => {
    const xml = naarGraphML([{ id: "a&b", label: 'Wet <DBA> "test"', group: "wet-dba", size: 3 }], [{ source: "a&b", target: "a&b", weight: 0.5, soort: "semantisch" }]);
    expect(xml).toContain('<node id="a&amp;b">');
    expect(xml).toContain("Wet &lt;DBA&gt; &quot;test&quot;");
    expect(xml).toContain('<data key="soort">semantisch</data>');
    expect(xml.trim().endsWith("</graphml>")).toBe(true);
  });
});

describe("knowledgeGraph (corpus uit de code, zonder database)", () => {
  it("levert documenten met lijnen die alleen bestaande knopen verbinden", () => {
    const g = knowledgeGraph();
    expect(g.nodes.length).toBeGreaterThan(10);
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const e of g.edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
      expect(e.weight).toBeGreaterThanOrEqual(0.05);
    }
    expect(g.nodes.find((n) => n.id === "dba")?.group).toBe("wet-dba");
  });
});
