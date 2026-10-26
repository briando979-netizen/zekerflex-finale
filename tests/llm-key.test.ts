import { beforeEach, describe, expect, it, vi } from "vitest";

// Vergrendelt de AI-node-sleutelresolutie: KV-waarde wint, env is fallback,
// een KV-fout mag nooit gooien, en er wordt gecachet.

const kvGet = vi.fn();
const kvSet = vi.fn();
const env: { LLM_API_KEY?: string } = {};

vi.mock("@/lib/storage/kv", () => ({
  kvGet: (...a: unknown[]) => kvGet(...a),
  kvSet: (...a: unknown[]) => kvSet(...a),
}));
vi.mock("@/lib/env", () => ({ env }));

// Verse module-import per test zodat de 60s-cache schoon begint.
async function fresh() {
  vi.resetModules();
  return import("@/lib/ai/llm-key");
}

beforeEach(() => {
  kvGet.mockReset();
  kvSet.mockReset();
  delete env.LLM_API_KEY;
});

describe("getLlmApiKey", () => {
  it("de KV-waarde wint", async () => {
    kvGet.mockResolvedValue("kv-key");
    const { getLlmApiKey } = await fresh();
    expect(await getLlmApiKey()).toBe("kv-key");
  });

  it("valt terug op env als KV leeg is", async () => {
    kvGet.mockResolvedValue(null);
    env.LLM_API_KEY = "env-key";
    const { getLlmApiKey } = await fresh();
    expect(await getLlmApiKey()).toBe("env-key");
  });

  it("valt terug op env als KV gooit — zonder zelf te gooien", async () => {
    kvGet.mockRejectedValue(new Error("KV down"));
    env.LLM_API_KEY = "env-key";
    const { getLlmApiKey } = await fresh();
    await expect(getLlmApiKey()).resolves.toBe("env-key");
  });

  it("geeft null als er niets is", async () => {
    kvGet.mockResolvedValue(null);
    const { getLlmApiKey } = await fresh();
    expect(await getLlmApiKey()).toBeNull();
  });

  it("cachet: een tweede call raadpleegt KV niet opnieuw", async () => {
    kvGet.mockResolvedValue("kv-key");
    const { getLlmApiKey } = await fresh();
    await getLlmApiKey();
    await getLlmApiKey();
    expect(kvGet).toHaveBeenCalledTimes(1);
  });
});

describe("setLlmApiKey", () => {
  it("schrijft naar KV en levert daarna uit cache (geen KV-read)", async () => {
    const mod = await fresh();
    await mod.setLlmApiKey("nieuwe-sleutel");
    expect(kvSet).toHaveBeenCalledWith("ai-node:key", "nieuwe-sleutel");
    expect(await mod.getLlmApiKey()).toBe("nieuwe-sleutel");
    expect(kvGet).not.toHaveBeenCalled();
  });

  it("een lege waarde wist de sleutel (kvSet met null, env blijft fallback)", async () => {
    env.LLM_API_KEY = "env-key";
    const mod = await fresh();
    await mod.setLlmApiKey("   ");
    expect(kvSet).toHaveBeenCalledWith("ai-node:key", null);
    expect(await mod.getLlmApiKey()).toBe("env-key");
  });
});
