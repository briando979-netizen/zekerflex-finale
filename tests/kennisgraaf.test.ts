import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  brugsuggesties,
  buurt,
  conceptenUit,
  gemeenschappen,
  graafCijfers,
  hiaten,
  kortstePad,
  modulariteit,
  naarCSV,
  naarDOT,
  naarGraphML,
  pagerank,
  rapportMarkdown,
  snapshotVerschil,
  themaNaam,
  tussenligging,
  verbondenDelen,
  type Begrip,
} from "@/lib/rag/graph-analyse";
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

// twee dichte groepjes (a b c) en (d e f) met één dunne brug c—d
const HALTER_IDS = ["a", "b", "c", "d", "e", "f", "los"];
const HALTER = [
  { source: "a", target: "b", weight: 1 },
  { source: "b", target: "c", weight: 1 },
  { source: "a", target: "c", weight: 1 },
  { source: "d", target: "e", weight: 1 },
  { source: "e", target: "f", weight: 1 },
  { source: "d", target: "f", weight: 1 },
  { source: "c", target: "d", weight: 0.2 },
];

describe("gemeenschappen (thema's) en modulariteit", () => {
  it("splitst één samenhangend deel in twee dichte groepen; een losse knoop is zijn eigen groep", () => {
    expect(verbondenDelen(HALTER_IDS, HALTER)).toEqual([["a", "b", "c", "d", "e", "f"], ["los"]]);
    const g = gemeenschappen(HALTER_IDS, HALTER);
    expect(g.map((x) => [...x].sort())).toEqual([["a", "b", "c"], ["d", "e", "f"], ["los"]]);
  });

  it("is deterministisch: dezelfde invoer in een andere volgorde geeft dezelfde indeling", () => {
    const sorteer = (g: string[][]) => g.map((x) => [...x].sort());
    const a = gemeenschappen(HALTER_IDS, HALTER);
    const b = gemeenschappen([...HALTER_IDS].reverse(), [...HALTER].reverse());
    expect(sorteer(a)).toEqual(sorteer(b));
  });

  it("modulariteit: de echte indeling scoort hoog, alles in één groep scoort 0, zonder lijnen 0", () => {
    const echt = modulariteit(HALTER_IDS, HALTER, [["a", "b", "c"], ["d", "e", "f"], ["los"]]);
    expect(echt).toBeGreaterThan(0.3);
    expect(modulariteit(HALTER_IDS, HALTER, [HALTER_IDS])).toBeCloseTo(0, 5);
    expect(modulariteit(HALTER_IDS, [], [["a"], ["b"]])).toBe(0);
    // de verkeerde indeling scoort lager dan de echte
    expect(modulariteit(HALTER_IDS, HALTER, [["a", "d"], ["b", "e"], ["c", "f"], ["los"]])).toBeLessThan(echt);
  });
});

describe("tussenligging (bruggen)", () => {
  it("de twee knopen aan de brug liggen op de meeste kortste paden; een losse knoop op geen enkel", () => {
    const t = tussenligging(HALTER_IDS, HALTER);
    expect(t.get("c")!).toBeGreaterThan(t.get("a")!);
    expect(t.get("d")!).toBeGreaterThan(t.get("f")!);
    expect(t.get("c")).toBeCloseTo(t.get("d")!, 6);
    expect(t.get("los")).toBe(0);
    for (const v of t.values()) expect(v).toBeGreaterThanOrEqual(0);
    for (const v of t.values()) expect(v).toBeLessThanOrEqual(1);
  });

  it("op een lijn ligt het midden op alle paden (genormaliseerd 1), de uiteinden op geen", () => {
    const t = tussenligging(["x", "m", "y"], [{ source: "x", target: "m", weight: 1 }, { source: "m", target: "y", weight: 1 }]);
    expect(t.get("m")).toBe(1);
    expect(t.get("x")).toBe(0);
  });
});

describe("kortstePad en buurt", () => {
  it("kiest de weg over sterke lijnen, ook als die meer stappen heeft", () => {
    const lijnen = [
      { source: "a", target: "z", weight: 0.05 }, // rechtstreeks maar zwak: kosten 20
      { source: "a", target: "m", weight: 1 },
      { source: "m", target: "z", weight: 1 }, // twee sterke stappen: kosten 2
    ];
    expect(kortstePad(["a", "m", "z"], lijnen, "a", "z")).toEqual(["a", "m", "z"]);
    expect(kortstePad(["a", "m", "z"], lijnen, "z", "a")).toEqual(["z", "m", "a"]);
    expect(kortstePad(["a", "m", "z"], lijnen, "a", "a")).toEqual(["a"]);
  });

  it("geeft null zonder pad of bij een onbekende knoop", () => {
    expect(kortstePad(HALTER_IDS, HALTER, "a", "los")).toBeNull();
    expect(kortstePad(HALTER_IDS, HALTER, "a", "bestaat-niet")).toBeNull();
    expect(kortstePad(HALTER_IDS, HALTER, "a", "f")).toEqual(["a", "c", "d", "f"]);
  });

  it("de buurt: eerst de knoop zelf, dan op afstand en alfabet, tot de diepte", () => {
    expect(buurt(HALTER_IDS, HALTER, "c", 1)).toEqual(["c", "a", "b", "d"]);
    expect(buurt(HALTER_IDS, HALTER, "c", 2)).toEqual(["c", "a", "b", "d", "e", "f"]);
    expect(buurt(HALTER_IDS, HALTER, "los", 2)).toEqual(["los"]);
    expect(buurt(HALTER_IDS, HALTER, "onbekend", 1)).toEqual([]);
  });
});

describe("graafCijfers", () => {
  it("telt dichtheid, graad, delen, diameter en losse knopen", () => {
    const c = graafCijfers(HALTER_IDS, HALTER);
    expect(c.knopen).toBe(7);
    expect(c.lijnen).toBe(7);
    expect(c.dichtheid).toBeCloseTo(7 / 21, 3);
    expect(c.gemiddeldeGraad).toBe(2);
    expect(c.maxGraad).toBe(3);
    expect(c.delen).toBe(2);
    expect(c.grootsteDeel).toBe(6);
    expect(c.diameter).toBe(3); // a → c → d → f
    expect(c.los).toBe(1);
  });

  it("is netjes leeg zonder knopen", () => {
    expect(graafCijfers([], [])).toEqual({ knopen: 0, lijnen: 0, dichtheid: 0, gemiddeldeGraad: 0, maxGraad: 0, delen: 0, grootsteDeel: 0, diameter: 0, los: 0 });
  });
});

const BEGRIPPEN: Begrip[] = [
  { id: "begrip:pensioen", label: "pensioen", gewicht: 3, docs: [{ docId: "a", gewicht: 1 }, { docId: "b", gewicht: 1 }, { docId: "e", gewicht: 0.5 }] },
  { id: "begrip:website", label: "website", gewicht: 2, docs: [{ docId: "d", gewicht: 1 }, { docId: "f", gewicht: 1 }] },
  { id: "begrip:loon", label: "loon", gewicht: 1, docs: [{ docId: "a", gewicht: 0.4 }, { docId: "c", gewicht: 0.4 }] },
];

describe("themaNaam en brugsuggesties", () => {
  it("noemt een thema naar de begrippen die er zwaar en eigen aan zijn", () => {
    expect(themaNaam(["a", "b", "c"], BEGRIPPEN)).toEqual(["pensioen", "loon"]);
    expect(themaNaam(["d", "e", "f"], BEGRIPPEN)).toEqual(["website", "pensioen"]);
    expect(themaNaam(["los"], BEGRIPPEN)).toEqual([]);
  });

  it("een begrip dat twee thema's deelt zonder lijn ertussen is een ontbrekende schakel; met een lijn niet", () => {
    const themas = [["a", "b", "c"], ["d", "e", "f"], ["los"]];
    // pensioen: a, b (thema 1) en e (thema 2); er is geen lijn a–e of b–e → suggestie
    expect(brugsuggesties(themas, BEGRIPPEN, HALTER)).toEqual([{ begrip: "pensioen", themas: [1, 2], docs: ["a", "b", "e"] }]);
    // met een lijn b–e is de schakel er al
    expect(brugsuggesties(themas, BEGRIPPEN, [...HALTER, { source: "b", target: "e", weight: 0.1 }])).toEqual([]);
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

describe("snapshotVerschil", () => {
  it("noemt wat erbij kwam en wat wegviel, gesorteerd", () => {
    const v = snapshotVerschil({ knopen: ["b", "a"], lijnen: ["a|b"] }, { knopen: ["a", "c", "d"], lijnen: ["a|c", "c|d"] });
    expect(v).toEqual({ nieuweKnopen: ["c", "d"], wegKnopen: ["b"], nieuweLijnen: ["a|c", "c|d"], wegLijnen: ["a|b"] });
  });
});

describe("exports", () => {
  const knopen = [
    { id: "a&b", label: 'Wet <DBA> "test"', group: "wet-dba", size: 3, thema: 2 },
    { id: "begrip:x", label: "=som()", group: "begrip", size: 2 },
  ];
  const lijnen = [{ source: "a&b", target: "begrip:x", weight: 0.5, soort: "semantisch" as const }];

  it("GraphML: geldig, met ontsnapte tekens en het thema", () => {
    const xml = naarGraphML(knopen, lijnen);
    expect(xml).toContain('<node id="a&amp;b">');
    expect(xml).toContain("Wet &lt;DBA&gt; &quot;test&quot;");
    expect(xml).toContain('<data key="thema">2</data>');
    expect(xml).toContain('<data key="soort">semantisch</data>');
    expect(xml.trim().endsWith("</graphml>")).toBe(true);
  });

  it("DOT: aanhalingstekens ontsnapt, begrippen als ruit, de lijn met gewicht", () => {
    const d = naarDOT(knopen, lijnen);
    expect(d.startsWith("graph kennisgraaf {")).toBe(true);
    expect(d).toContain('"a&b" [label="Wet <DBA> \\"test\\""');
    expect(d).toContain("shape=diamond");
    expect(d).toContain('"a&b" -- "begrip:x" [weight=0.5');
    expect(d.trim().endsWith("}")).toBe(true);
  });

  it("CSV: puntkomma's, een BOM voor Excel en geen cel die als formule start", () => {
    const c = naarCSV(knopen, lijnen);
    expect(c.knopen.startsWith("﻿id;naam;soort;grootte;thema;link")).toBe(true);
    expect(c.knopen).toContain("begrip:x;'=som();begrip;2;;");
    expect(c.knopen).toContain('"Wet <DBA> ""test"""');
    expect(c.lijnen).toContain("a&b;begrip:x;0.5;semantisch");
  });

  it("rapport: Nederlands, met alle koppen en de structuurtekst", () => {
    const r = rapportMarkdown({
      op: "2026-11-13T12:00:00.000Z",
      cijfers: graafCijfers(HALTER_IDS, HALTER),
      begrippen: 3,
      semantisch: 0,
      modulariteit: 0.42,
      themas: [{ id: 1, naam: "pensioen · loon", grootte: 3, kern: ["A", "B"] }],
      centraal: [{ label: "A", score: 210 }],
      bruggen: [{ label: "C", score: 400 }],
      hiaten: { los: ["Los document"], eilandjes: [], dunneBegrippen: ["loon"] },
      brugsuggesties: [{ begrip: "pensioen", themas: [1, 2] }],
      groei: [
        { dag: "2026-11-12", documenten: 6, lijnen: 6 },
        { dag: "2026-11-13", documenten: 7, lijnen: 7 },
      ],
    });
    for (const kop of ["# Kennisgraaf van ZekerFlex", "## In één oogopslag", "## Thema's", "## Meest centrale documenten", "## Bruggen", "## Hiaten", "## Ontbrekende schakels", "## Groei"]) {
      expect(r).toContain(kop);
    }
    expect(r).toContain("een duidelijke structuur");
    expect(r).toContain("1. **pensioen · loon** — 3 documenten; kern: A, B");
    expect(r).toContain('Het begrip "pensioen" speelt in thema 1 en 2');
    expect(r).toContain("Van 2026-11-12 (6 documenten, 6 verbanden) naar 2026-11-13 (7 documenten, 7 verbanden), 2 momentopnamen.");
    expect(r).not.toMatch(/\b(nodes|edges|cluster|community)\b/i);
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
