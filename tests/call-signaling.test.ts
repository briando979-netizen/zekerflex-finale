import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (task: () => unknown) => void task() };
});

const requirePrincipal = vi.fn();
vi.mock("@/lib/auth", () => ({ requirePrincipal: () => requirePrincipal() }));

// minimal in-memory stand-in for the ioredis calls the route makes
const kv = new Map<string, string>();
const claimed = new Set<string>();
vi.mock("@/lib/redis", () => ({
  redis: {
    rpush: async () => 1,
    expire: async () => 1,
    set: async (k: string, v: string) => {
      kv.set(k, v);
      return "OK";
    },
    get: async (k: string) => kv.get(k) ?? null,
    del: async (k: string) => (kv.delete(k) ? 1 : 0),
    lrange: async () => [],
  },
  claimIdempotency: async (key: string) => {
    if (claimed.has(key)) return false;
    claimed.add(key);
    return true;
  },
}));

const postMessage = vi.fn();
const THREAD = { id: "t1", kind: "direct", participants: ["caller", "callee"], meta: {}, reads: {} };
vi.mock("@/lib/messaging/store", () => ({
  getThread: async () => THREAD,
  canAccess: () => true,
  postMessage: (...a: unknown[]) => postMessage(...a),
}));
vi.mock("@/lib/messaging/contacts", () => ({ isPlatformAdmin: async () => false }));

const notifyIncomingCall = vi.fn();
const notifyMissedCall = vi.fn();
vi.mock("@/lib/messaging/notify", () => ({
  notifyIncomingCall: (...a: unknown[]) => notifyIncomingCall(...a),
  notifyMissedCall: (...a: unknown[]) => notifyMissedCall(...a),
}));

import { POST } from "@/app/api/inbox/[threadId]/call/route";

const params = { params: Promise.resolve({ threadId: "t1" }) };
function signal(as: "caller" | "callee", body: Record<string, unknown>) {
  requirePrincipal.mockResolvedValue({ userId: as });
  return POST(
    new Request("http://localhost/api/inbox/t1/call", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ callId: "call_42", mode: "audio", ...body }),
    }),
    params,
  );
}

beforeEach(async () => {
  kv.clear();
  claimed.clear();
  postMessage.mockResolvedValue({});
  await signal("caller", { type: "ring" });
});
afterEach(() => vi.clearAllMocks());

describe("call signaling → notifications + transcript", () => {
  it("pushes the ring to the callee", () => {
    expect(notifyIncomingCall).toHaveBeenCalledWith(THREAD, "caller", "call_42", "audio");
  });

  it("caller giving up before an answer logs a missed call and pushes it", async () => {
    await signal("caller", { type: "end", data: { durationSec: 0 } });
    expect(postMessage).toHaveBeenCalledWith("t1", "caller", "", "call", { call: { mode: "audio", status: "missed" } });
    expect(notifyMissedCall).toHaveBeenCalledWith(THREAD, "caller", "call_42", "audio");
  });

  it("a decline by the callee is logged (it used to leave no trace)", async () => {
    await signal("callee", { type: "decline" });
    expect(postMessage).toHaveBeenCalledWith("t1", "caller", "", "call", { call: { mode: "audio", status: "declined" } });
    expect(notifyMissedCall).not.toHaveBeenCalled();
  });

  it("the callee hanging up an answered call logs it once, with its duration", async () => {
    await signal("callee", { type: "end", data: { durationSec: 125 } });
    await signal("caller", { type: "end", data: { durationSec: 126 } });
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith("t1", "caller", "", "call", {
      call: { mode: "audio", status: "ended", durationSec: 125 },
    });
    expect(notifyMissedCall).not.toHaveBeenCalled();
  });
});
