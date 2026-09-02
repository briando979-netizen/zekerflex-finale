import { afterEach, describe, expect, it, vi } from "vitest";

const { mockRedis, mockStore, createMany, findMany, count, groupBy } = vi.hoisted(() => {
  const store = new Map<string, number>();
  return {
    mockStore: store,
    mockRedis: {
      incr: async (k: string) => {
        const n = (store.get(k) ?? 0) + 1;
        store.set(k, n);
        return n;
      },
      expire: async () => 1,
    },
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    findMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  };
});

vi.mock("@/lib/redis", () => ({ redis: mockRedis }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    analyticsEvent: {
      createMany: (...a: unknown[]) => createMany(...a),
      findMany: (...a: unknown[]) => findMany(...a),
      count: (...a: unknown[]) => count(...a),
      groupBy: (...a: unknown[]) => groupBy(...a),
    },
  },
}));

import { trackEvents } from "@/lib/analytics/track";
import { liveTraffic } from "@/lib/analytics/report";

afterEach(() => {
  vi.clearAllMocks();
  mockStore.clear();
});

describe("trackEvents", () => {
  it("normalises path + referrer host and hashes the UA", async () => {
    const res = await trackEvents(
      [
        { type: "PAGEVIEW", path: "admin/jarvis", referrer: "https://news.ycombinator.com/x" },
        { type: "CLICK", path: "/admin", label: "Verstuur" },
      ],
      { sessionId: "sess-abc123", userAgent: "Mozilla/5.0 test" },
    );
    expect(res.accepted).toBe(2);
    const rows = createMany.mock.calls[0]![0].data;
    expect(rows[0].path).toBe("/admin/jarvis");
    expect(rows[0].referrerHost).toBe("news.ycombinator.com");
    expect(rows[0].uaHash).toMatch(/^[0-9a-f]{16}$/);
    expect(rows[1].label).toBe("Verstuur");
  });

  it("drops events once the per-session rate limit is hit", async () => {
    for (let i = 0; i < 260; i += 1) {
      await mockRedis.incr(`analytics:rate:${Math.floor(Date.now() / 60_000)}:sess-x`);
    }
    const res = await trackEvents([{ type: "PAGEVIEW", path: "/" }], { sessionId: "sess-x" });
    expect(res.accepted).toBe(0);
  });

  it("ignores a call with no session id", async () => {
    const res = await trackEvents([{ type: "PAGEVIEW", path: "/" }], { sessionId: "" });
    expect(res.accepted).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });
});

describe("liveTraffic", () => {
  it("counts distinct sessions as active visitors", async () => {
    findMany.mockImplementation(async ({ distinct }: { distinct?: string[] }) => {
      if (distinct?.includes("sessionId")) {
        return [{ sessionId: "a" }, { sessionId: "b" }, { sessionId: "c" }];
      }
      return [{ path: "/x", label: "btn", createdAt: new Date() }];
    });
    count.mockResolvedValue(42);
    groupBy.mockResolvedValue([{ path: "/admin", _count: { _all: 5 } }]);

    const t = await liveTraffic();
    expect(t.activeVisitors).toBe(3);
    expect(t.pageviewsLast5m).toBe(42);
    expect(t.activePages[0]).toEqual({ path: "/admin", visitors: 5 });
  });
});
