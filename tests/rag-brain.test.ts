import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rag/embed", () => ({ isRagEnabled: () => false, embedOne: vi.fn() }));
vi.mock("@/lib/rag/store", () => ({ search: vi.fn(async () => []) }));

import { bm25, buildIndex, stem, tokenize } from "@/lib/rag/lexical";
import { buildVectorIndex, embedLocal, nearest } from "@/lib/rag/vector-local";
import { reciprocalRankFusion } from "@/lib/rag/fusion";
import { canRead, corpus } from "@/lib/rag/corpus";
import { recall } from "@/lib/rag/recall";

describe("lexical (BM25)", () => {
  it("stems Dutch inflections to one form", () => {
    expect(stem("betaald")).toBe(stem("betalen"));
    expect(tokenize("Uitbetalingen")).toEqual(tokenize("uitbetaling"));
  });

  it("ranks the matching title first and reports coverage", () => {
    const idx = buildIndex([
      { id: "a", title: "Hoe wijzig ik mijn IBAN?", text: "Onder fiscaal." },
      { id: "b", title: "Wat kost het?", text: "€ 3,50 per uur." },
    ]);
    const [hit] = bm25(idx, "iban wijzigen", 2);
    expect(hit!.doc.id).toBe("a");
    expect(hit!.coverage).toBe(1);
  });
});

describe("brain vector", () => {
  it("finds a passage despite a typo that BM25 misses", () => {
    const texts = ["Uitbetaling, facturen en sneller je geld", "Hoe log ik in?", "Wat kost het per uur?"];
    const vi = buildVectorIndex(texts);
    expect(bm25(buildIndex(texts.map((t, i) => ({ id: String(i), title: t, text: "" }))), "uitbtaling", 1)).toHaveLength(0);
    expect(nearest(vi, embedLocal(vi, "uitbtaling"), 1)[0]!.i).toBe(0);
  });
});

describe("reciprocal rank fusion", () => {
  it("lifts an item found by several retrievers above single-list winners", () => {
    const fused = reciprocalRankFusion(
      [
        { name: "lexical", items: ["x", "shared"] },
        { name: "brein", items: ["y", "shared"] },
      ],
      (s) => s,
    );
    expect(fused[0]!.item).toBe("shared");
    expect(fused[0]!.via).toEqual(["lexical", "brein"]);
  });

  it("applies list weights", () => {
    const fused = reciprocalRankFusion([{ name: "a", items: ["p"] }, { name: "b", items: ["q"], weight: 2 }], (s) => s);
    expect(fused[0]!.item).toBe("q");
  });
});

describe("recall (hybrid, audience-safe)", () => {
  it("answers a worker question from the in-app how-to, via both retrievers", async () => {
    const r = await recall("hoe wijzig ik mijn iban", { role: "werknemer", k: 3 });
    expect(r.hits[0]!.title).toBe("Hoe wijzig ik mijn IBAN?");
    expect(r.hits[0]!.via).toEqual(expect.arrayContaining(["lexical", "brein"]));
    expect(r.confident).toBe(true);
    expect(r.retrievers).toEqual(["lexical", "brein"]);
  });

  it("is not confident about off-topic questions", async () => {
    expect((await recall("wat is het weer morgen", { role: "werknemer" })).confident).toBe(false);
  });

  it("never gives internal docs or another role's how-tos to a worker or visitor", async () => {
    for (const role of ["werknemer", "public"] as const) {
      const r = await recall("hoe werkt de AI governor ollama daemon", { role, k: 10 });
      expect(r.hits.every((h) => !h.audience.includes("admin") || h.audience.includes("public"))).toBe(true);
    }
    const w = await recall("hoe keur ik uren goed", { role: "werknemer", k: 10 });
    expect(w.hits.some((h) => h.title === "Hoe keur ik uren goed?")).toBe(false);
    expect(corpus().filter((p) => canRead(p, "public")).every((p) => p.audience.includes("public"))).toBe(true);
  });
});
