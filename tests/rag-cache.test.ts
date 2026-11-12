import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// De kandidaten van de zoekfunctie in het geheugen (lib/rag/store.ts, 12 nov 2026): één keer per dimensie uit Postgres,
// hooguit 10 minuten oud, leeg na elke schrijfactie, en dezelfde uitkomst als de query per zoekvraag (filter op soort,
// nieuwste eerst, maximum).

const findMany = vi.fn();
const upsert = vi.fn();
const deleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ragChunk: {
      findMany: (...a: unknown[]) => findMany(...a),
      upsert: (...a: unknown[]) => upsert(...a),
      deleteMany: (...a: unknown[]) => deleteMany(...a),
    },
  },
}));

import { leegRagCache, replaceSource, search, upsertChunk } from "@/lib/rag/store";

const rij = (id: string, sourceType: string, embedding: number[]) => ({ id, sourceType, sourceRef: `${id}.ts`, title: id, content: id, embedding });
// nieuwste eerst, zoals de query (orderBy indexedAt desc) ze teruggeeft
const RIJEN = [rij("a", "CODE", [1, 0, 0]), rij("b", "DOCS", [0.9, 0.1, 0]), rij("c", "CODE", [0, 1, 0])];

beforeEach(() => {
  leegRagCache();
  findMany.mockResolvedValue(RIJEN);
  upsert.mockResolvedValue({});
  deleteMany.mockResolvedValue({ count: 0 });
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("kandidaten in het geheugen", () => {
  it("laadt één keer per dimensie, ook bij gelijktijdige zoekvragen", async () => {
    await Promise.all([search([1, 0, 0]), search([1, 0, 0]), search([0, 1, 0])]);
    await search([1, 0, 0], { sourceTypes: ["CODE"] });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]![0]).toMatchObject({ where: { embedDim: 3 }, orderBy: { indexedAt: "desc" } });
  });

  it("filtert op soort zoals de query deed", async () => {
    const hits = await search([1, 0, 0], { sourceTypes: ["CODE"], minScore: 0 });
    expect(hits.map((h) => h.id)).toEqual(["a", "c"]);
    const alle = await search([1, 0, 0], { minScore: 0.5 });
    expect(alle.map((h) => h.id)).toEqual(["a", "b"]);
  });

  it("is leeg na een schrijfactie (upsert en replaceSource)", async () => {
    await search([1, 0, 0]);
    await upsertChunk({ sourceType: "CODE" as never, sourceRef: "x.ts", title: "x", chunkIndex: 0, content: "x", embedding: [1, 0, 0] });
    await search([1, 0, 0]);
    expect(findMany).toHaveBeenCalledTimes(2);
    // replaceSource vraagt eerst de oude stukken op (ook findMany) en leegt daarna de cache
    findMany.mockResolvedValueOnce([{ id: "oud", contentHash: "h" }]).mockResolvedValue(RIJEN);
    await replaceSource("CODE" as never, []);
    await search([1, 0, 0]);
    expect(findMany).toHaveBeenCalledTimes(4);
  });

  it("is hooguit 10 minuten oud", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-12T17:00:00+01:00"));
    await search([1, 0, 0]);
    vi.setSystemTime(new Date("2026-11-12T17:09:00+01:00"));
    await search([1, 0, 0]);
    expect(findMany).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-11-12T17:11:00+01:00"));
    await search([1, 0, 0]);
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it("een mislukte lading wordt niet bewaard: de volgende zoekvraag probeert opnieuw", async () => {
    findMany.mockRejectedValueOnce(new Error("db weg"));
    await expect(search([1, 0, 0])).rejects.toThrow("db weg");
    const hits = await search([1, 0, 0], { minScore: 0.5 });
    expect(hits.map((h) => h.id)).toEqual(["a", "b"]);
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
