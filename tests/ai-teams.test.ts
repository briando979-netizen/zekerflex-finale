import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => new Map<string, unknown>());
const now = new Date("2026-10-18T06:00:00Z");
const day = 86_400_000;

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvAppend: async (k: string, item: unknown, keep = 2000) => {
    const arr = ((kv.get(k) as unknown[]) ?? []).concat([item]);
    kv.set(k, arr.slice(-keep));
  },
}));
vi.mock("@/lib/ai/client", () => ({ llmConfigProblem: () => "geen model", chat: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shift: {
      findMany: async ({ where }: { where: { startsAt?: unknown; createdAt?: { gte: Date; lt?: Date } } }) => {
        if (where.startsAt) return Array.from({ length: 12 }, () => ({ title: "Orderpicker magazijn", positions: 1, hourlyRateCents: 1600, _count: { assignments: 0 } }));
        if (where.createdAt?.lt) return [{ branch: { tenantId: "quiet", tenant: { name: "Stille Bakkerij" } } }];
        return [];
      },
      count: async () => 5,
    },
    webhookDelivery: { findMany: async () => [{ id: "d1", eventType: "timesheet.approved", lastError: "HTTP 500", subscription: { url: "https://x.nl/h" } }] },
    payment: { count: async () => 2 },
    timesheet: {
      findMany: async () => [{ id: "t1", branch: { tenantId: "c1", name: "Utrecht", tenant: { name: "Super BV" } }, freelancer: { user: { fullName: "Liam" } } }],
      count: async () => 3,
    },
    shopProduct: { findMany: async () => [{ name: "Hesje", imageUrl: null, description: "kort" }] },
    user: { count: async () => 4 },
    shopOrder: { count: async () => 1 },
  },
}));

import { feed, proposals, runTeams, setProposalStatus } from "@/lib/ai-teams";

beforeEach(() => kv.clear());

describe("AI-teams", () => {
  it("data teams work and report; language teams wait for the model", async () => {
    const r = await runTeams(now);
    expect(r.skipped).toEqual(["denken", "voorstellen", "leraar"]);
    const items = await feed();
    const text = items.map((i) => `${i.team}: ${i.text}`).join("\n");
    expect(text).toContain("groei: Logistiek: maar 0% van 12 plekken bezet");
    expect(text).toContain("oplossingen: 2 mislukte uitbetaling(en)");
    expect(text).toContain("stijl: 1 product(en) zonder foto");
    expect(text).toContain("updates: Afgelopen 24 uur: 4 nieuwe gebruiker(s)");
  });

  it("prepares outward actions as proposals, once per target", async () => {
    await runTeams(now);
    await runTeams(new Date(now.getTime() + day));
    const props = await proposals();
    expect(props.map((p) => p.action?.type).sort()).toEqual(["reactivation-mail", "resend-webhook", "timesheet-reminder"]);
    const done = await setProposalStatus(props[0]!.id, "done", "mail verstuurd");
    expect(done?.status).toBe("done");
  });
});
