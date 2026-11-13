import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// De volledige Kennisgraaf zonder database (de semantische laag valt stil weg) en de nachtelijke momentopnamen (groei):
// één KV-sleutel per Amsterdamse dag met alleen id's, lijnsleutels en aantallen. Bevroren klok (de controle draait in UTC).

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
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ragChunk: {
      findMany: async () => {
        throw new Error("geen database in de test");
      },
      groupBy: async () => {
        throw new Error("geen database in de test");
      },
    },
  },
}));

import { bewaarSnapshot, groei, kennisgraaf, leesSnapshot, padTussen, buurtVan, SNAPSHOT_PREFIX } from "@/lib/rag/graph";
import { lijnSleutel } from "@/lib/rag/graph-analyse";

const DAG1 = new Date("2026-11-13T02:10:00+01:00");
const DAG2 = new Date("2026-11-14T02:10:00+01:00");

beforeEach(() => {
  h.kv.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(DAG1);
});
afterEach(() => vi.useRealTimers());

describe("kennisgraaf zonder database", () => {
  it("heeft thema's op elke documentknoop, maten per document, cijfers en bruggen die bij de knopen horen", async () => {
    const g = await kennisgraaf(true);
    const docs = g.nodes.filter((n) => n.group !== "begrip");
    expect(docs.length).toBeGreaterThan(10);
    expect(g.semantisch).toBe(0);
    for (const d of docs) {
      expect(d.thema, d.id).toBeGreaterThanOrEqual(1);
      expect(g.maten[d.id], d.id).toBeDefined();
    }
    expect(g.themas.length).toBeGreaterThan(1);
    expect(g.themas.reduce((s, t) => s + t.grootte, 0)).toBe(docs.length);
    for (const t of g.themas) expect(t.leden.every((id) => g.nodes.find((n) => n.id === id)?.thema === t.id), `thema ${t.id}`).toBe(true);
    expect(g.cijfers.knopen).toBe(docs.length);
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const b of g.bruggen) expect(ids.has(b.id)).toBe(true);
    expect(g.modulariteit).toBeGreaterThanOrEqual(-0.5);
    expect(g.modulariteit).toBeLessThanOrEqual(1);
    // een begrip krijgt het thema van de meeste van zijn documenten
    const begrip = g.nodes.find((n) => n.group === "begrip" && n.thema !== undefined);
    expect(begrip).toBeDefined();
  });

  it("het kortste pad en de buurt werken op de echte graaf", async () => {
    const g = await kennisgraaf();
    const lijn = g.edges.find((e) => e.soort !== "begrip")!;
    const pad = await padTussen(lijn.source, lijn.target);
    // begin en eind kloppen, elke stap is een echte lijn (een sterke omweg via een begrip mag korter zijn dan de zwakke rechte lijn)
    expect(pad.knopen[0]?.id).toBe(lijn.source);
    expect(pad.knopen[pad.knopen.length - 1]?.id).toBe(lijn.target);
    expect(pad.lijnen).toHaveLength(pad.knopen.length - 1);
    const sleutels = new Set(g.edges.map((e) => lijnSleutel(e.source, e.target)));
    for (let i = 1; i < pad.knopen.length; i++) expect(sleutels.has(lijnSleutel(pad.knopen[i - 1]!.id, pad.knopen[i]!.id))).toBe(true);
    const geen = await padTussen(lijn.source, "bestaat-niet");
    expect(geen.knopen).toEqual([]);
    const b = await buurtVan(lijn.source, 1);
    expect(b.knopen[0]).toBe(lijn.source);
    expect(b.knopen).toContain(lijn.target);
    expect((await buurtVan(lijn.source, 7)).diepte).toBe(2);
  });
});

describe("momentopnamen (groei)", () => {
  it("bewaart per dag één sleutel zonder persoonsgegevens en leest de reeks met het verschil terug", async () => {
    expect(await groei()).toEqual({ reeks: [], verschil: null, laatste: null });

    const s1 = await bewaarSnapshot(DAG1);
    expect([...h.kv.keys()]).toEqual([`${SNAPSHOT_PREFIX}2026-11-13`]);
    expect(s1.knopen.length).toBe(s1.cijfers.documenten + s1.cijfers.begrippen);
    expect(s1.lijnen.length).toBe(s1.cijfers.lijnen);
    expect(JSON.stringify(s1)).not.toMatch(/@|usr_|userId/);
    expect(await leesSnapshot("2026-11-13")).toEqual(s1);

    const na1 = await groei();
    expect(na1.reeks).toHaveLength(1);
    expect(na1.verschil).toBeNull();
    expect(na1.laatste).toBe("2026-11-13");

    vi.setSystemTime(DAG2);
    await bewaarSnapshot(DAG2);
    const na2 = await groei();
    expect(na2.reeks.map((r) => r.dag)).toEqual(["2026-11-13", "2026-11-14"]);
    expect(na2.verschil).toEqual({ nieuweKnopen: [], wegKnopen: [], nieuweLijnen: [], wegLijnen: [] });
    expect(na2.reeks[1]).toMatchObject({ documenten: s1.cijfers.documenten, lijnen: s1.cijfers.lijnen });
  });

  it("de dag volgt de Amsterdamse klok: vlak voor middernacht UTC is het al de volgende dag", async () => {
    await bewaarSnapshot(new Date("2026-11-13T23:30:00Z"));
    expect([...h.kv.keys()]).toEqual([`${SNAPSHOT_PREFIX}2026-11-14`]);
  });

  it("een storing in de opslag geeft een lege reeks, geen fout", async () => {
    h.storing = true;
    expect(await groei()).toEqual({ reeks: [], verschil: null, laatste: null });
    h.storing = false;
  });
});
