import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
}));

const p = await import("@/lib/messaging/thread-prefs");

beforeEach(() => kv.clear());

describe("per-user chat settings", () => {
  it("archives, favourites and lists only for the user who did it", async () => {
    await p.applyThreadAction("jan", "t1", { action: "archive" });
    await p.applyThreadAction("jan", "t1", { action: "favorite" });
    await p.applyThreadAction("jan", "t1", { action: "list-add", list: "Werk" });
    const jan = await p.getChatPrefs("jan");
    expect(jan.archived).toEqual(["t1"]);
    expect(jan.favorites).toEqual(["t1"]);
    expect(jan.lists).toEqual({ Werk: ["t1"] });
    expect((await p.getChatPrefs("briando")).archived).toEqual([]);
  });

  it("mutes until a time or for ever", async () => {
    await p.applyThreadAction("jan", "t1", { action: "mute", hours: 8 });
    await p.applyThreadAction("jan", "t2", { action: "mute", hours: null });
    const prefs = await p.getChatPrefs("jan");
    expect(p.isMuted(prefs, "t1")).toBe(true);
    expect(p.isMuted(prefs, "t1", Date.now() + 9 * 3_600_000)).toBe(false);
    expect(p.isMuted(prefs, "t2", Date.now() + 365 * 86_400_000)).toBe(true);
  });

  it("locking needs a PIN, and the PIN is checked", async () => {
    await expect(p.applyThreadAction("jan", "t1", { action: "lock" })).rejects.toThrow(/pincode/);
    await p.setChatPin("jan", "1234");
    await p.applyThreadAction("jan", "t1", { action: "lock" });
    expect(await p.checkChatPin("jan", "1234")).toBe(true);
    expect(await p.checkChatPin("jan", "9999")).toBe(false);
    await expect(p.setChatPin("jan", "5678", "0000")).rejects.toThrow(/huidige/);
  });

  it("blocking works both ways and clear/delete hide old messages", async () => {
    await p.setBlocked("jan", "piet", true);
    expect(await p.blockedBetween("jan", "piet")).toBe("me");
    expect(await p.blockedBetween("piet", "jan")).toBe("them");
    await p.applyThreadAction("jan", "t1", { action: "delete" });
    expect(p.visibleFrom(await p.getChatPrefs("jan"), "t1")).not.toBeNull();
  });
});
