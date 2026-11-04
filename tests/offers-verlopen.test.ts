import { beforeEach, describe, expect, it, vi } from "vitest";

const H = 3_600_000;
const NU = new Date("2026-11-04T12:00:00Z");

const h = vi.hoisted(() => ({
  offers: [] as { id: string; userId: string; shiftId: string; status: string; proposedRateCents: number; listedRateCents: number }[],
  shifts: [] as { id: string; title: string; startsAt: Date; status: string }[],
  vervangingen: [] as { id: string; status: string; startsAt: string }[],
  kv: new Map<string, unknown>(),
  pushes: [] as { userIds: string[]; title: string; body: string }[],
  gezet: [] as [string, string][],
  geannuleerd: [] as string[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { shift: { findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => h.shifts.filter((s) => where.id.in.includes(s.id))) } },
}));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async (k: string) => h.kv.get(k) ?? null),
  kvSet: vi.fn(async (k: string, v: unknown) => void h.kv.set(k, v)),
}));
vi.mock("@/lib/offers/store", () => ({
  listCounterOffers: vi.fn(async () => h.offers),
  setOfferStatus: vi.fn(async (id: string, status: string) => {
    h.gezet.push([id, status]);
    const o = h.offers.find((x) => x.id === id);
    if (o) o.status = status;
    return o ?? null;
  }),
}));
vi.mock("@/lib/replacements/store", () => ({
  listReplacementRequests: vi.fn(async () => h.vervangingen),
  cancelReplacementRequest: vi.fn(async (id: string) => {
    h.geannuleerd.push(id);
    const r = h.vervangingen.find((x) => x.id === id);
    if (r) r.status = "cancelled";
    return r ?? null;
  }),
}));
vi.mock("@/lib/notifications/localized-push", async () => {
  const { WORKER_PUSH } = await import("@/lib/i18n/worker-push");
  return {
    sendLocalizedPush: vi.fn(async (userIds: string[], build: (t: (typeof WORKER_PUSH)["nl"], l: "nl") => { title: string; body: string }) => {
      h.pushes.push({ userIds, ...build(WORKER_PUSH.nl, "nl") });
      return 1;
    }),
  };
});

import { reactieVervalt, vervangingVervalt } from "@/lib/offers/verval";
import { ruimVerlopenReactiesOp } from "@/lib/offers/expire";

const reactie = (id: string, shiftId: string, status = "pending") => ({ id, userId: `u-${id}`, shiftId, status, proposedRateCents: 1500, listedRateCents: 1500 });

beforeEach(() => {
  h.offers = [];
  h.shifts = [];
  h.vervangingen = [];
  h.kv.clear();
  h.pushes = [];
  h.gezet = [];
  h.geannuleerd = [];
});

describe("reactieVervalt", () => {
  it("vervalt pas 2 uur na de start, bij annulering of als de klus weg is", () => {
    expect(reactieVervalt({ startsAt: new Date(NU.getTime() - 1 * H), status: "OPEN" }, NU)).toBeNull();
    expect(reactieVervalt({ startsAt: new Date(NU.getTime() - 3 * H), status: "OPEN" }, NU)).toBe("begonnen");
    expect(reactieVervalt({ startsAt: new Date(NU.getTime() + 24 * H), status: "CANCELLED" }, NU)).toBe("geannuleerd");
    expect(reactieVervalt(null, NU)).toBe("weg");
    expect(reactieVervalt({ startsAt: new Date(NU.getTime() + 24 * H), status: "FILLED" }, NU)).toBeNull();
  });
  it("een vervangingsverzoek vervalt bij de start", () => {
    expect(vervangingVervalt(new Date(NU.getTime() - 60_000).toISOString(), NU)).toBe(true);
    expect(vervangingVervalt(new Date(NU.getTime() + 60_000), NU)).toBe(false);
  });
});

describe("ruimVerlopenReactiesOp", () => {
  it("zet verlopen reacties op niet uitgekozen en stuurt alleen bij een recente klus één seintje", async () => {
    h.shifts = [
      { id: "s-recent", title: "Afwassen Zwolle", startsAt: new Date(NU.getTime() - 3 * H), status: "OPEN" },
      { id: "s-oud", title: "Oude klus", startsAt: new Date(NU.getTime() - 5 * 24 * H), status: "OPEN" },
      { id: "s-straks", title: "Morgen", startsAt: new Date(NU.getTime() + 20 * H), status: "OPEN" },
      { id: "s-weg", title: "Geannuleerd", startsAt: new Date(NU.getTime() + 20 * H), status: "CANCELLED" },
    ];
    h.offers = [reactie("a", "s-recent"), reactie("b", "s-oud"), reactie("c", "s-straks"), reactie("d", "s-weg"), reactie("e", "s-recent", "accepted"), reactie("f", "bestaat-niet")];
    const uit = await ruimVerlopenReactiesOp(NU);
    expect(uit).toEqual({ reacties: 4, seintjes: 1, vervangingen: 0 });
    expect(h.gezet.map(([id]) => id).sort()).toEqual(["a", "b", "d", "f"]);
    expect(h.offers.find((o) => o.id === "c")?.status).toBe("pending");
    expect(h.pushes).toHaveLength(1);
    expect(h.pushes[0]).toMatchObject({ userIds: ["u-a"], title: "Helaas niet uitgekozen", body: expect.stringContaining('Voor "Afwassen Zwolle" ben je deze keer niet gekozen'), data: { url: "/dashboard/klussen" } });
  });

  it("stuurt nooit twee keer hetzelfde seintje", async () => {
    h.shifts = [{ id: "s1", title: "Klus", startsAt: new Date(NU.getTime() - 3 * H), status: "OPEN" }];
    h.offers = [reactie("a", "s1")];
    await ruimVerlopenReactiesOp(NU);
    h.offers[0]!.status = "pending"; // bijvoorbeeld een dubbele ronde vóór het wegschrijven
    await ruimVerlopenReactiesOp(NU);
    expect(h.pushes).toHaveLength(1);
  });

  it("sluit open vervangingsverzoeken voor klussen die al begonnen", async () => {
    h.vervangingen = [
      { id: "r-oud", status: "open", startsAt: new Date(NU.getTime() - H).toISOString() },
      { id: "r-straks", status: "open", startsAt: new Date(NU.getTime() + H).toISOString() },
      { id: "r-klaar", status: "resolved", startsAt: new Date(NU.getTime() - H).toISOString() },
    ];
    const uit = await ruimVerlopenReactiesOp(NU);
    expect(uit.vervangingen).toBe(1);
    expect(h.geannuleerd).toEqual(["r-oud"]);
  });
});
