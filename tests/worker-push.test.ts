import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
}));
const sent: { userIds: string[]; title: string }[] = [];
vi.mock("@/lib/notifications/push", () => ({
  sendUserPush: async (userIds: string[], p: { title: string }) => {
    sent.push({ userIds, title: p.title });
    return 1;
  },
}));
let assignments: unknown[] = [];
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shiftAssignment: {
      // honour the "recently assigned" filter the real query uses for 'uitgekozen'
      findMany: async (args: { where: { acceptedAt?: { gte: Date } } }) =>
        args.where.acceptedAt
          ? (assignments as { acceptedAt: Date }[]).filter((a) => a.acceptedAt >= args.where.acceptedAt!.gte)
          : assignments,
    },
    user: { findMany: async () => [] },
  },
}));

const { sweepWorkerPushes } = await import("@/lib/notifications/worker-push");

const now = new Date("2026-10-22T08:00:00Z");
const H = 3_600_000;
function row(id: string, startsInMs: number, assignedAgoMs: number) {
  return {
    id,
    acceptedAt: new Date(now.getTime() - assignedAgoMs),
    freelancer: { userId: `u-${id}` },
    shift: { id: `s-${id}`, title: "Bediening", startsAt: new Date(now.getTime() + startsInMs), branch: { name: "Grand Café" } },
  };
}

beforeEach(() => {
  kv.clear();
  sent.length = 0;
});

describe("werknemer pushes", () => {
  it("sends the right reminder per moment, once", async () => {
    assignments = [
      row("day", 23 * H, 3 * 24 * H), // tomorrow
      row("soon", 1.5 * H, 3 * 24 * H), // in 1,5 hours
      row("start", -10 * 60_000, 3 * 24 * H), // started 10 min ago
      row("far", 3 * 24 * H, 3 * 24 * H), // in 3 days — nothing yet
    ];
    await sweepWorkerPushes(now);
    const titles = sent.map((s) => `${s.userIds[0]}:${s.title}`);
    expect(titles).toContain("u-day:📅 Morgen werken");
    expect(titles).toContain("u-soon:⏰ Over 2 uur begint je klus");
    expect(titles).toContain("u-start:▶️ Je klus begint nu");
    expect(titles.some((t) => t.startsWith("u-far:"))).toBe(false);

    const count = sent.length;
    await sweepWorkerPushes(now); // second sweep: nothing new
    expect(sent.length).toBe(count);
  });

  it("sends 'uitgekozen' for a fresh assignment and skips the 'morgen' reminder right after it", async () => {
    assignments = [row("new", 20 * H, 10 * 60_000)];
    await sweepWorkerPushes(now);
    expect(sent.map((s) => s.title)).toEqual(["🎉 Je bent uitgekozen!"]);
  });
});
