import { afterEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const groupBy = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ragChunk: {
      findMany: (...a: unknown[]) => findMany(...a),
      groupBy: (...a: unknown[]) => groupBy(...a),
    },
  },
}));

import { chunkText, estimateTokens } from "@/lib/rag/chunk";
import { cosine, search } from "@/lib/rag/store";

afterEach(() => vi.clearAllMocks());

describe("cosine similarity", () => {
  it("is 1 for identical vectors", () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });
  it("is 0 for orthogonal vectors", () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it("is -1 for opposite vectors", () => {
    expect(cosine([1, 1], [-1, -1])).toBeCloseTo(-1);
  });
  it("is 0 when a vector is all zeros", () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe("chunkText", () => {
  it("returns one chunk for short text", () => {
    expect(chunkText("kort stukje tekst")).toEqual(["kort stukje tekst"]);
  });
  it("returns nothing for empty input", () => {
    expect(chunkText("   ")).toEqual([]);
  });
  it("splits long text into bounded chunks", () => {
    const para = "zin. ".repeat(200); // 1000 chars
    const text = `${para}\n\n${para}\n\n${para}`;
    const chunks = chunkText(text, { maxChars: 800, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1000);
  });
  it("estimateTokens scales with length", () => {
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });
});

describe("vector search", () => {
  it("ranks candidates by cosine and honours minScore", async () => {
    groupBy.mockResolvedValue([]);
    findMany.mockResolvedValue([
      { id: "near", sourceType: "CODE", sourceRef: "a.ts", title: "a", content: "a", embedding: [1, 0, 0] },
      { id: "mid", sourceType: "CODE", sourceRef: "b.ts", title: "b", content: "b", embedding: [1, 1, 0] },
      { id: "far", sourceType: "CODE", sourceRef: "c.ts", title: "c", content: "c", embedding: [0, 0, 1] },
    ]);

    const hits = await search([1, 0, 0], { limit: 5, minScore: 0.5 });
    expect(hits.map((h) => h.id)).toEqual(["near", "mid"]); // "far" (score 0) filtered
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
  });

  it("filters by embedding dimension", async () => {
    groupBy.mockResolvedValue([]);
    findMany.mockResolvedValue([]);
    await search([1, 2, 3, 4]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ embedDim: 4 }),
      }),
    );
  });
});
