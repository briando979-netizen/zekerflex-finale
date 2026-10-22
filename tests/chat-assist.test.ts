import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/client", () => ({
  ensureAiNode: async () => undefined, llmConfigProblem: () => "geen model", chat: vi.fn() }));

import { rewrite, ruleSuggestions, suggestReplies } from "@/lib/chat/assist";

describe("chat AI help without a model", () => {
  it("suggests replies that fit the last message", () => {
    expect(ruleSuggestions("Hoe laat moet ik er zijn?")[0]).toContain("afgesproken tijd");
    expect(ruleSuggestions("Ik ben ziek vandaag")[0]).toContain("beterschap");
    expect(ruleSuggestions("Wat moet ik aan?")[0]).toContain("meenemen");
    expect(ruleSuggestions("ok")).toHaveLength(3);
  });

  it("uses rules when no model is connected", async () => {
    expect(await suggestReplies("Waar is de ingang?", "flexwerker")).toMatchObject({ mode: "rules" });
  });

  it("says plainly that rewriting needs the model", async () => {
    expect(await rewrite("hoi", "kort")).toEqual({ error: expect.stringContaining("taalmodel") });
  });
});
