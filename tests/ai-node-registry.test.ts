import { afterEach, describe, expect, it, vi } from "vitest";

const kv: Record<string, unknown> = {};
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv[k] ?? null,
  kvSet: async (k: string, v: unknown) => void (kv[k] = v),
}));

import { _setNodeCacheForTest, allowedNodeUrl, NODE_FRESH_MS, primeNode, registeredNodeUrl, saveNode } from "@/lib/ai/node-registry";

afterEach(() => {
  _setNodeCacheForTest(null);
  for (const k of Object.keys(kv)) delete kv[k];
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("allowedNodeUrl", () => {
  it("accepts only https Cloudflare tunnel hosts, normalised to the origin", () => {
    expect(allowedNodeUrl("https://abc-def.trycloudflare.com/")).toBe("https://abc-def.trycloudflare.com");
    expect(allowedNodeUrl("https://abc.trycloudflare.com/v1/models?x=1")).toBe("https://abc.trycloudflare.com");
  });

  it("rejects http, internal hosts, credentials, ports and look-alikes", () => {
    for (const bad of ["http://abc.trycloudflare.com", "https://169.254.169.254", "https://localhost", "https://u:p@abc.trycloudflare.com", "https://abc.trycloudflare.com:8443", "https://trycloudflare.com.evil.nl", "https://eviltrycloudflare.com", "not a url"]) {
      expect(allowedNodeUrl(bad)).toBeNull();
    }
  });

  it("allows extra suffixes for a named tunnel later", () => {
    expect(allowedNodeUrl("https://ai.zekerflex.com", ["zekerflex.com"])).toBe("https://ai.zekerflex.com");
  });
});

describe("registry freshness", () => {
  it("is online right after a heartbeat and offline after three missed beats", async () => {
    await saveNode({ url: "https://a.trycloudflare.com", at: new Date().toISOString(), models: [] });
    expect(registeredNodeUrl()).toBe("https://a.trycloudflare.com");
    _setNodeCacheForTest({ url: "https://a.trycloudflare.com", at: new Date(Date.now() - NODE_FRESH_MS - 1000).toISOString(), models: [] });
    expect(registeredNodeUrl()).toBeNull();
  });

  it("another instance picks up the node from the database", async () => {
    kv["ai-node:registered"] = { url: "https://b.trycloudflare.com", at: new Date().toISOString(), models: [] };
    expect(registeredNodeUrl()).toBeNull();
    await primeNode(true);
    expect(registeredNodeUrl()).toBe("https://b.trycloudflare.com");
  });
});

describe("client on a serverless deploy with LLM_BASE_URL=localhost", () => {
  it("uses the registered laptop when it is online, and explains when it is offline", async () => {
    vi.stubEnv("VERCEL", "1");
    const client = await import("@/lib/ai/client");
    const reg = await import("@/lib/ai/node-registry");
    reg._setNodeCacheForTest(null);
    expect(client.llmConfigProblem()).toMatch(/nog geen taalmodel gekoppeld/);
    reg._setNodeCacheForTest({ url: "https://c.trycloudflare.com", at: new Date().toISOString(), models: [] });
    expect(client.llmConfigProblem()).toBeNull();
    expect(client.viaRegisteredNode()).toBe(true);
    reg._setNodeCacheForTest({ url: "https://c.trycloudflare.com", at: new Date(Date.now() - 10 * 60_000).toISOString(), models: [] });
    expect(client.llmConfigProblem()).toMatch(/AI-laptop is offline/);
  });
});
