import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { gezondModelUit } from "@/lib/ai/gezond-model";

// 15 nov 2026: de beheer-AI zei "ai=granite-embedding:278m". Met "alles gratis" stond LLM_MODEL (Gemini) niet in de lijst van de
// eigen server, en de gezondheidscontrole nam het eerste model: het embedding-model.

describe("welk model de gezondheidscontrole noemt", () => {
  const OLLAMA = ["granite-embedding:278m", "gemma3:4b", "qwen2.5:3b"];

  it("het verwachte model als de server het heeft", () => {
    expect(gezondModelUit(OLLAMA, "gemma3:4b")).toBe("gemma3:4b");
    expect(gezondModelUit(["models/gemini-2.5-flash", "models/text-embedding-004"], "gemini-2.5-flash")).toBe("gemini-2.5-flash");
  });

  it("anders het eerste model dat kan praten, nooit een embedding-model", () => {
    expect(gezondModelUit(OLLAMA, "gemini-2.5-flash")).toBe("gemma3:4b");
    expect(gezondModelUit(["nomic-embed-text", "text-embedding-3-small", "llama3"], "x")).toBe("llama3");
  });

  it("alleen embedding-modellen of een lege lijst: dan wat er is, of het verwachte", () => {
    expect(gezondModelUit(["granite-embedding:278m"], "gemma3:4b")).toBe("granite-embedding:278m");
    expect(gezondModelUit([], "gemma3:4b")).toBe("gemma3:4b");
    expect(gezondModelUit(undefined, "gemma3:4b")).toBe("gemma3:4b");
  });

  it("llmHealth verwacht met alles gratis het eigen model", () => {
    const bron = readFileSync(path.join(process.cwd(), "lib/ai/client.ts"), "utf8");
    expect(bron).toContain("const verwacht = gratisAan() ? gratisModel() : env.LLM_MODEL;");
    expect(bron).toContain("gezondModelUit(served, verwacht)");
  });
});
