import { beforeEach, describe, expect, it, vi } from "vitest";

// Standby-modus: werd opgeslagen maar nergens gebruikt. Nu krijgen werkers op
// standby een push bij een spoeddienst (binnen 24 uur, nog plek), binnen hun
// eigen voorkeuren, niet bij een opdrachtgever die hen blokkeerde en niet als
// ze op dat moment al werken.

const h = vi.hoisted(() => ({
  shift: null as unknown,
  rows: [] as { key: string; value: unknown }[],
  busyUsers: new Set<string>(),
  blocked: new Set<string>(),
  pushes: [] as { ids: string[]; push: { title: string; body: string } }[],
  intern: [] as string[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    shift: { findUnique: async () => h.shift },
    $queryRaw: async () => h.rows,
    // de interne accounts die een testklus wél krijgen (lib/shifts/testklus-db.ts)
    freelancerProfile: { findMany: async () => h.intern.map((userId) => ({ id: `f-${userId}`, userId })) },
    shiftAssignment: {
      count: async (args: { where: { freelancer: { userId: string } } }) => (h.busyUsers.has(args.where.freelancer.userId) ? 1 : 0),
    },
  },
}));
vi.mock("@/lib/notifications/push", () => ({
  sendUserPush: async (ids: string[], push: { title: string; body: string }) => (h.pushes.push({ ids, push }), ids.length),
}));
vi.mock("@/lib/employer/relations", () => ({ isBlockedByAny: async (_t: string[], userId: string) => h.blocked.has(userId) }));
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: async () => ({}), invoiceModeFor: () => "invoice" }));

import { isUrgent, notifyStandby } from "@/lib/matching/standby";

const NOW = new Date("2026-11-05T12:00:00Z");
const shiftAt = (startsAt: string, taken = 0) => ({
  id: "s1",
  title: "Afwasser",
  startsAt: new Date(startsAt),
  endsAt: new Date(new Date(startsAt).getTime() + 6 * 3_600_000),
  hourlyRateCents: 1900,
  positions: 1,
  status: "OPEN",
  visibility: "PUBLIC",
  viaUitzendbureau: false,
  branch: { city: "Utrecht", tenantId: "t1" },
  _count: { assignments: taken },
});

beforeEach(() => {
  h.pushes.length = 0;
  h.busyUsers.clear();
  h.blocked.clear();
  h.intern = [];
  h.rows = [
    { key: "prefs:u1", value: { standby: true } },
    { key: "prefs:u2", value: { standby: true, minHourlyRateCents: 2500 } }, // tarief te laag voor hem
    { key: "prefs:u3", value: { standby: true } },
  ];
});

describe("isUrgent", () => {
  it("binnen 24 uur en nog niet begonnen", () => {
    expect(isUrgent(new Date("2026-11-05T18:00:00Z"), NOW)).toBe(true);
    expect(isUrgent(new Date("2026-11-07T18:00:00Z"), NOW)).toBe(false);
    expect(isUrgent(new Date("2026-11-05T11:00:00Z"), NOW)).toBe(false);
  });
});

describe("notifyStandby", () => {
  it("een testklus alleen naar interne accounts op standby (13 nov)", async () => {
    h.shift = { ...shiftAt("2026-11-05T18:00:00Z"), branch: { city: "Utrecht", tenantId: "t-test", tenant: { name: "Test bedrijven" } } };
    h.intern = ["u3"];
    const r = await notifyStandby("s1", NOW);
    expect(r.notified).toBe(1);
    expect(h.pushes[0]?.ids).toEqual(["u3"]);
    // zonder interne accounts: niemand
    h.intern = [];
    h.pushes.length = 0;
    expect((await notifyStandby("s1", NOW)).notified).toBe(0);
  });

  it("stuurt standby-werkers binnen hun voorkeuren, niet wie al werkt of geblokkeerd is", async () => {
    h.shift = shiftAt("2026-11-05T18:00:00Z");
    h.busyUsers.add("u3");
    const r = await notifyStandby("s1", NOW);
    expect(r.notified).toBe(1);
    expect(h.pushes[0]?.ids).toEqual(["u1"]);
    expect(h.pushes[0]?.push.title).toBe("⚡ Spoeddienst: Afwasser");
    expect(h.pushes[0]?.push.body).toMatch(/^do 5\/11 19:00 · Utrecht · € 19,00\/u\./);

    h.blocked.add("u1");
    h.pushes.length = 0;
    expect((await notifyStandby("s1", NOW)).notified).toBe(0);
  });

  it("niets als de dienst niet spoedig is of al vol", async () => {
    h.shift = shiftAt("2026-11-08T18:00:00Z");
    expect((await notifyStandby("s1", NOW)).notified).toBe(0);
    h.shift = shiftAt("2026-11-05T18:00:00Z", 1);
    expect((await notifyStandby("s1", NOW)).notified).toBe(0);
    expect(h.pushes).toHaveLength(0);
  });
});
