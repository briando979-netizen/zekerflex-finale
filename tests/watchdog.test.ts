import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockStore, mockRedis, mockAnnounce, mockHealth } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    mockStore: store,
    mockRedis: {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: string) => {
        store.set(k, v);
        return "OK";
      },
    },
    mockAnnounce: vi.fn().mockResolvedValue(null),
    mockHealth: vi.fn(),
  };
});

vi.mock("@/lib/redis", () => ({ redis: mockRedis }));
vi.mock("@/lib/voice/announce", () => ({ announce: mockAnnounce }));
vi.mock("@/lib/ai/client", () => ({ llmHealth: mockHealth }));

import { checkLlm } from "@/lib/ai/watchdog";

beforeEach(() => {
  mockStore.clear();
  vi.clearAllMocks();
});
afterEach(() => vi.clearAllMocks());

describe("llm watchdog", () => {
  it("reports up without a transition on first check", async () => {
    mockHealth.mockResolvedValue({ ok: true, model: "m", baseUrl: "http://localhost" });
    const s = await checkLlm();
    expect(s).toMatchObject({ up: true, changed: false });
    expect(mockAnnounce).not.toHaveBeenCalled();
  });

  it("announces recovery on a down -> up transition", async () => {
    mockStore.set("ai:watchdog:state", "down");
    mockStore.set("ai:watchdog:since", String(Date.now() - 8000));
    mockHealth.mockResolvedValue({ ok: true, model: "m", baseUrl: "http://localhost" });

    const s = await checkLlm();
    expect(s.changed).toBe(true);
    expect(s.up).toBe(true);
    expect(mockAnnounce).toHaveBeenCalledOnce();
    expect(mockAnnounce.mock.calls[0]![0].text).toMatch(/weer online/i);
  });

  it("marks down and does not announce on up -> down", async () => {
    mockStore.set("ai:watchdog:state", "up");
    mockHealth.mockResolvedValue({ ok: false, model: "m", baseUrl: "http://localhost", detail: "refused" });
    const s = await checkLlm();
    expect(s).toMatchObject({ up: false, changed: true });
    expect(mockAnnounce).not.toHaveBeenCalled();
  });
});
