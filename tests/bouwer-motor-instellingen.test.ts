import { beforeEach, describe, expect, it, vi } from "vitest";

// De motor van de Bouwer kiezen (lib/bouwer/werker.ts, 15 nov 2026): de eigen lus of Claude Code met de sleutel van de
// eigenaar. De sleutel staat versleuteld in de KV en gaat alleen per opdracht naar de werker.

const h = vi.hoisted(() => ({ kv: new Map<string, unknown>() }));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
}));
vi.mock("@/lib/security/sealed-secret", () => ({
  sealSecret: (v: string, doel: string) => `verzegeld:${doel}:${v}`,
  openSecret: (v: string, doel: string) => {
    if (!v.startsWith(`verzegeld:${doel}:`)) throw new Error("verkeerd doel");
    return v.slice(`verzegeld:${doel}:`.length);
  },
}));
vi.mock("@/lib/ai/llm-key", () => ({ getLlmApiKey: async () => "gemini-sleutel" }));
vi.mock("@/lib/ai/llm-model", () => ({ primeMainModel: async () => undefined }));
vi.mock("@/lib/ai/models", () => ({ modelFor: () => "gemini-3.5-flash" }));
vi.mock("@/lib/ai/governor", () => ({ isLocalInference: () => false }));
vi.mock("@/lib/env", async (orig) => {
  const mod = await orig<typeof import("@/lib/env")>();
  return { ...mod, env: { ...mod.env, AI_ALLOW_REMOTE: true, LLM_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/openai", LLM_MODEL: "gemini-3.5-flash" } };
});

import { env } from "@/lib/env";
import { bouwerInstellingen, bouwerLlm, bouwerMotor, zetBouwerInstellingen } from "@/lib/bouwer/werker";

const SLEUTEL = `sk-ant-oat01-${"b".repeat(40)}`;

beforeEach(() => {
  h.kv.clear();
  (env as { AI_ALLOW_REMOTE: boolean }).AI_ALLOW_REMOTE = true;
});

describe("de motor van de Bouwer", () => {
  it("zonder keuze de eigen lus op het taalmodel uit de AI-instellingen", async () => {
    expect((await bouwerInstellingen()).motor).toBe("eigen");
    const llm = await bouwerLlm();
    expect("motor" in llm).toBe(false);
    expect(llm).toMatchObject({ baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: "gemini-sleutel" });
  });

  it("Claude Code met de sleutel: versleuteld bewaard, alleen per opdracht open", async () => {
    await zetBouwerInstellingen({ claudeToken: SLEUTEL, motor: "claude-code" });
    const bewaard = h.kv.get("bouwer:instellingen") as { claudeToken: string };
    expect(bewaard.claudeToken).toBe(`verzegeld:bouwer-claude:${SLEUTEL}`);
    expect(await bouwerInstellingen()).toMatchObject({ motor: "claude-code", claudeSleutel: true, claudeModel: "opus" });
    // de instellingen geven de sleutel zelf nooit terug
    expect(JSON.stringify(await bouwerInstellingen())).not.toContain(SLEUTEL);
    expect(await bouwerLlm()).toEqual({ motor: "claude-code", apiKey: SLEUTEL, model: "opus" });
    await zetBouwerInstellingen({ claudeModel: "sonnet" });
    expect(await bouwerLlm()).toMatchObject({ model: "sonnet" });
  });

  it("Claude Code gekozen maar geen sleutel, of de sleutel weg: terug naar de eigen lus", async () => {
    expect(bouwerMotor({ motor: "claude-code" })).toBe("eigen");
    await zetBouwerInstellingen({ claudeToken: SLEUTEL, motor: "claude-code" });
    await zetBouwerInstellingen({ claudeToken: null });
    expect((await bouwerInstellingen()).motor).toBe("eigen");
    expect("motor" in (await bouwerLlm())).toBe(false);
  });

  it("geen code naar Claude als code niet naar buiten mag", async () => {
    await zetBouwerInstellingen({ claudeToken: SLEUTEL, motor: "claude-code" });
    (env as { AI_ALLOW_REMOTE: boolean }).AI_ALLOW_REMOTE = false;
    await expect(bouwerLlm()).rejects.toThrow("AI_ALLOW_REMOTE staat uit");
  });
});
