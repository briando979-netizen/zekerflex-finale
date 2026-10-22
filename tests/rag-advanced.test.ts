import { afterEach, describe, expect, it, vi } from "vitest";

const llmConfigProblem = vi.fn<() => string | null>(() => "geen model");
const chatJson = vi.fn();
vi.mock("@/lib/ai/client", () => ({
  ensureAiNode: async () => undefined,
  chat: vi.fn(),
  chatJson: (...a: unknown[]) => chatJson(...a),
  fastModel: () => "fast",
  llmConfigProblem: () => llmConfigProblem(),
}));
vi.mock("@/lib/rag/embed", () => ({ isRagEnabled: () => false, embedOne: vi.fn() }));
vi.mock("@/lib/rag/store", () => ({ search: vi.fn(async () => []) }));
const kv: Record<string, unknown> = {};
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv[k] ?? null,
  kvSet: async (k: string, v: unknown) => void (kv[k] = v),
}));

import { sentences, smartChunk } from "@/lib/rag/smart-chunk";
import { crossScore, rerank } from "@/lib/rag/rerank";
import { advancedRecall, compress, expandQuery, standalone } from "@/lib/rag/advanced";
import { agenticRecall, reformulate, splitQuestion } from "@/lib/rag/agentic";
import { cacheLookup, cacheStore, knowledgePack, packMessage, PACK_MAX_CHARS } from "@/lib/rag/cag";
import { denseRetrieve, naiveRag } from "@/lib/rag/naive";
import { brainVectorIndex } from "@/lib/rag/recall";

afterEach(() => {
  vi.clearAllMocks();
  llmConfigProblem.mockReturnValue("geen model");
  for (const k of Object.keys(kv)) delete kv[k];
});

describe("smart chunking", () => {
  const doc = "# Uitbetaling\n\nIntro over geld.\n\n## Voorschot\n\nJe kunt een voorschot aanvragen. Dat kost 3%. Bijv. bij een grote klus.\n\n## Snel betaald\n\n" + "Dit is een zin over snel betalen. ".repeat(40);

  it("keeps the heading path on every chunk", () => {
    const chunks = smartChunk(doc, { maxChars: 300 });
    expect(chunks[0]!.heading).toBe("Uitbetaling");
    expect(chunks.find((c) => c.body.includes("voorschot"))!.heading).toBe("Uitbetaling › Voorschot");
    expect(chunks.every((c) => c.text.startsWith(c.heading))).toBe(true);
  });

  it("never cuts a sentence in half and overlaps by whole sentences", () => {
    const chunks = smartChunk(doc, { maxChars: 300 }).filter((c) => c.heading.endsWith("Snel betaald"));
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.body.trim().endsWith(".")).toBe(true);
    expect(chunks[1]!.body.startsWith("Dit is een zin over snel betalen.")).toBe(true);
  });

  it("does not split on abbreviations", () => {
    expect(sentences("Neem mee: bijv. schoenen. Daarna start je.")).toEqual(["Neem mee: bijv. schoenen.", "Daarna start je."]);
  });

  it("recognises ALL-CAPS headings from whitepaper plain text", () => {
    expect(smartChunk("INLEIDING\nTekst hier.\n\nTWEEDE DEEL\nMeer tekst.", { title: "WP" }).map((c) => c.heading)).toEqual(["WP › INLEIDING", "WP › TWEEDE DEEL"]);
  });
});

describe("reranking", () => {
  const P = (id: string, title: string, text: string) => ({ id, title, text, source: "t", audience: ["public" as const], score: 0 });

  it("cross-score prefers the passage that covers the question", () => {
    const good = crossScore("iban wijzigen", P("a", "Hoe wijzig ik mijn IBAN?", "Onder fiscaal wijzig je je IBAN."), 0);
    const bad = crossScore("iban wijzigen", P("b", "Wat kost het?", "€ 3,50 per uur."), 1);
    expect(good.total!).toBeGreaterThan(bad.total!);
  });

  it("reorders candidates and keeps near-duplicates out of the top (MMR)", async () => {
    const items = [
      P("x", "Wat kost het?", "Geen abonnement."),
      P("a", "Hoe wijzig ik mijn IBAN?", "Onder fiscaal wijzig je je IBAN en bevestig je opnieuw."),
      P("a2", "Hoe wijzig ik mijn IBAN?", "Onder fiscaal wijzig je je IBAN en bevestig je opnieuw!"),
      P("c", "IBAN bevestigen", "Na een wijziging bevestig je de nieuwe IBAN via je bank."),
    ];
    const out = await rerank("iban wijzigen", items, { k: 2, vIdx: brainVectorIndex(), lambda: 0.5 });
    expect(out[0]!.item.title).toContain("IBAN");
    expect(out.map((o) => o.item.id)).not.toEqual(["a", "a2"]);
  });

  it("blends in the model's listwise order when connected", async () => {
    llmConfigProblem.mockReturnValue(null);
    chatJson.mockResolvedValue({ order: [2, 1] });
    const out = await rerank("vraag", [P("a", "A", "tekst"), P("b", "B", "tekst")], { k: 2 });
    expect(out[0]!.item.id).toBe("b");
    expect(out[0]!.features.model).toBe(1);
  });
});

describe("advanced RAG", () => {
  it("expands with domain synonyms and rewrites short follow-ups", () => {
    expect(expandQuery("wanneer krijg ik mijn loon")[0]).toMatch(/uitbetaling/);
    expect(standalone("en morgen?", [{ role: "user", content: "wanneer is mijn klus" }])).toBe("wanneer is mijn klus en morgen?");
  });

  it("compresses a passage to the sentences that matter", () => {
    const text = "Inleiding over alles. " + "Iets anders. ".repeat(60) + "Je IBAN wijzig je onder fiscaal.";
    const c = compress("iban wijzigen", text, 120);
    expect(c).toContain("IBAN wijzig je onder fiscaal");
    expect(c.length).toBeLessThan(200);
  });

  it("runs the whole pipeline without a model and records a trace", async () => {
    const r = await advancedRecall("wanneer wordt mijn loon uitbetaald", { role: "werknemer", k: 3 });
    expect(r.hits[0]!.title).toBe("Wanneer krijg ik betaald?");
    expect(r.trace.queries.map((q) => q.kind)).toEqual(["origineel", "synoniemen"]);
    expect(r.trace.modelSteps).toBe(false);
    expect(r.hits[0]!.excerpt.length).toBeGreaterThan(0);
  });

  it("adds model variants and HyDE as extra queries when connected", async () => {
    llmConfigProblem.mockReturnValue(null);
    chatJson.mockResolvedValueOnce({ standalone: "uitbetaling werknemer", variants: ["wanneer betaalt zekerflex"], hyde: "Na goedkeuring van je uren wordt uitbetaald." }).mockResolvedValue({ order: [1] });
    const r = await advancedRecall("geld?", { role: "werknemer", k: 3 });
    expect(r.trace.queries.map((q) => q.kind)).toEqual(expect.arrayContaining(["variant", "hyde"]));
  });
});

describe("agentic RAG", () => {
  it("splits compound questions into sub-questions", () => {
    expect(splitQuestion("Hoe vul ik mijn uren in en wanneer krijg ik betaald?")).toEqual(["Hoe vul ik mijn uren in", "wanneer krijg ik betaald"]);
    expect(splitQuestion("Heb ik een KVK nodig?")).toEqual(["Heb ik een KVK nodig?"]);
  });

  it("answers each sub-question and logs plan/search/check steps", async () => {
    const r = await agenticRecall("Hoe vul ik mijn uren in en wanneer krijg ik betaald?", { role: "werknemer", k: 4 });
    expect(r.subQuestions).toHaveLength(2);
    const titles = r.hits.map((h) => h.title);
    expect(titles).toContain("Hoe vul ik mijn uren in?");
    expect(titles).toContain("Wanneer krijg ik betaald?");
    expect(r.steps[0]!.action).toBe("plan");
    expect(r.steps.some((s) => s.action === "controleer")).toBe(true);
  });

  it("reformulates and searches again when the first round is thin", async () => {
    const r = await agenticRecall("ehm dingetje met dat geld ofzo", { role: "werknemer" });
    expect(r.steps.some((s) => s.action === "herformuleer")).toBe(true);
    expect(reformulate("ehm dingetje met dat geld ofzo")).toMatch(/geld/);
  });
});

describe("CAG", () => {
  it("builds a byte-stable knowledge pack per role within budget", () => {
    const a = packMessage("werknemer").content;
    expect(packMessage("werknemer").content).toBe(a);
    expect(knowledgePack("werknemer").text.length).toBeLessThanOrEqual(PACK_MAX_CHARS);
    expect(a).toContain("Hoe wijzig ik mijn IBAN?");
    expect(a).not.toContain("Hoe keur ik uren goed?"); // employer how-to
    expect(knowledgePack("public").text).not.toContain("Hulp in de app");
  });

  it("serves a similar question from the answer cache, per role", async () => {
    await cacheStore("werknemer", "Wanneer krijg ik betaald?", "Na goedkeuring.", []);
    expect((await cacheLookup("werknemer", "wanneer krijg ik betaald"))?.a).toBe("Na goedkeuring.");
    expect(await cacheLookup("opdrachtgever", "wanneer krijg ik betaald")).toBeNull();
    expect(await cacheLookup("werknemer", "hoe zet ik een klus uit")).toBeNull();
  });
});

describe("naive RAG (baseline)", () => {
  it("is dense-only top-k and answers with the best passage without a model", async () => {
    expect(denseRetrieve("iban wijzigen", "werknemer", 3)).toHaveLength(3);
    const r = await naiveRag("hoe wijzig ik mijn iban", "werknemer");
    expect(r.mode).toBe("rules");
    expect(r.hits[0]!.title).toBe("Hoe wijzig ik mijn IBAN?");
  });
});
