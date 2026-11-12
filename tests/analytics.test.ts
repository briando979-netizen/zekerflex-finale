import { afterEach, describe, expect, it, vi } from "vitest";

const { mockRedis, mockStore, create, createMany, findMany, count, groupBy } = vi.hoisted(() => {
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
      ttl: async () => -1,
    },
    create: vi.fn().mockResolvedValue({ id: "evt_1" }),
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
      create: (...a: unknown[]) => create(...a),
      createMany: (...a: unknown[]) => createMany(...a),
      findMany: (...a: unknown[]) => findMany(...a),
      count: (...a: unknown[]) => count(...a),
      groupBy: (...a: unknown[]) => groupBy(...a),
    },
  },
}));

import { heleTekens, recordServerEvent, trackEvents } from "@/lib/analytics/track";
import { liveTraffic, trafficSummary } from "@/lib/analytics/report";

afterEach(() => {
  vi.clearAllMocks();
  mockStore.clear();
});

describe("trackEvents", () => {
  it("een doormidden geknipte emoji breekt de batch niet meer (foutenlogboek 10 nov: unexpected end of hex escape)", async () => {
    const half = "Klik \uD83D"; // eerste helft van een emoji, zoals een slice in de browser achterlaat
    expect(heleTekens(half)).toBe("Klik ");
    expect(heleTekens("los \uDE00 eind")).toBe("los  eind");
    expect(heleTekens("hele 😀 blijft")).toBe("hele 😀 blijft");
    expect(heleTekens("nul\u0000teken")).toBe("nulteken");
    // een label van 201 tekens met een emoji op de grens: de slice laat geen halve emoji achter
    const grens = `${"a".repeat(199)}😀`;
    await trackEvents([{ type: "CLICK", path: `/x${half}`, label: grens, meta: { [`k${half}`]: [half, { diep: half }], n: 3 } }], { sessionId: "sess-emoji" });
    const row = createMany.mock.calls[0]![0].data[0];
    expect(row.path).toBe("/xKlik ");
    expect(row.label).toBe("a".repeat(199));
    expect(row.meta).toEqual({ "kKlik ": ["Klik ", { diep: "Klik " }], n: 3 });
    expect(JSON.stringify(createMany.mock.calls[0]![0])).not.toMatch(/\\ud83d"/i);
  });

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

describe("recordServerEvent — marketing conversions", () => {
  it("writes a CUSTOM event with a fixed sessionId and never throws", async () => {
    await recordServerEvent({ path: "/demo", label: "demo-request", meta: { company: "Acme" } });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "CUSTOM",
        path: "/demo",
        label: "demo-request",
        sessionId: "server",
        meta: { company: "Acme" },
      }),
    });
  });

  it("swallows a DB failure", async () => {
    create.mockRejectedValueOnce(new Error("db down"));
    await expect(
      recordServerEvent({ path: "/x", label: "whitepaper-download" }),
    ).resolves.toBeUndefined();
  });
});

describe("trafficSummary — inbound block", () => {
  it("splits CUSTOM conversion events into demo / application / whitepaper counts", async () => {
    findMany.mockImplementation(async ({ where }: { where: { type: string } }) => {
      if (where.type === "PAGEVIEW") return [];
      return [
        { label: "demo-request", meta: {} },
        { label: "demo-request", meta: {} },
        { label: "open-application", meta: {} },
        { label: "whitepaper-download", meta: { slug: "omzetbelasting" } },
        { label: "whitepaper-download", meta: { slug: "omzetbelasting" } },
        { label: "whitepaper-download", meta: { slug: "werken-via-zekerflex" } },
      ];
    });

    const s = await trafficSummary(7);
    expect(s.inbound.demoRequests).toBe(2);
    expect(s.inbound.jobApplications).toBe(1);
    expect(s.inbound.whitepaperDownloads).toBe(3);
    expect(s.inbound.topWhitepapers[0]).toEqual({ slug: "omzetbelasting", downloads: 2 });
  });
});
