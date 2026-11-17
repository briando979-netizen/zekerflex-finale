import { beforeEach, describe, expect, it, vi } from "vitest";

// Reservebank in de KV (lib/reservebank/store.ts): op de bank zetten en eraf halen, wat de kluspagina en de werker
// zien, en het seintje aan de reserves na een afzegging: één keer per afzegging, nooit na de start, en bij een
// testklus nooit naar een echte werker.

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  /** zo vaak weigert het atomisch vervangen nog (alsof een ander net schreef) */
  casWeigert: 0,
  kvFout: false,
  shift: null as null | Record<string, unknown>,
  afzegging: null as null | { id: string },
  offers: [] as { id: string; userId: string; shiftId: string; status: string }[],
  pushes: [] as { ids: string[]; title: string; body: string; url: string }[],
  intern: new Set<string>(),
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => {
    if (h.kvFout) throw new Error("kv weg");
    return h.kv.has(k) ? structuredClone(h.kv.get(k)) : null;
  },
  kvGetMany: async (keys: string[]) => {
    if (h.kvFout) throw new Error("kv weg");
    return new Map(keys.filter((k) => h.kv.has(k)).map((k) => [k, structuredClone(h.kv.get(k))]));
  },
  kvSetIfAbsent: async (k: string, v: unknown) => {
    if (h.kv.has(k)) return false;
    h.kv.set(k, structuredClone(v));
    return true;
  },
  kvVervangAlsVeld: async (k: string, veld: string, oud: string | null, nieuw: unknown) => {
    if (h.casWeigert > 0) {
      h.casWeigert -= 1;
      return false;
    }
    const nu = h.kv.get(k) as Record<string, unknown> | undefined;
    if (!nu) return false;
    const waarde = nu[veld];
    if ((waarde === undefined || waarde === null ? null : String(waarde)) !== oud) return false;
    h.kv.set(k, structuredClone(nieuw));
    return true;
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shift: { findUnique: async () => h.shift },
    shiftAssignment: { findFirst: async () => h.afzegging },
  },
}));
vi.mock("@/lib/offers/store", () => ({ listCounterOffers: async () => h.offers }));
vi.mock("@/lib/shifts/testklus-db", () => {
  const isTest = (k: { title: string }) => /testklus/i.test(k.title);
  return {
    klusKenmerk: (s: { title: string; createdAt?: Date; branch: { tenantId: string; tenant?: { name: string } } }) => ({
      title: s.title,
      tenantId: s.branch.tenantId,
      bedrijf: s.branch.tenant?.name ?? null,
      createdAt: s.createdAt ?? null,
    }),
    testklusMeldfilter: async () => ({ isTest, mag: async (k: { title: string }, userId: string) => !isTest(k) || h.intern.has(userId) }),
  };
});
vi.mock("@/lib/notifications/localized-push", async () => {
  const { WORKER_PUSH } = await import("@/lib/i18n/worker-push");
  return {
    sendLocalizedPush: async (ids: string[], build: (t: (typeof WORKER_PUSH)["nl"], locale: "nl") => { title: string; body: string; data?: { url?: string } }) => {
      const p = build(WORKER_PUSH.nl, "nl");
      h.pushes.push({ ids, title: p.title, body: p.body, url: p.data?.url ?? "" });
      return ids.length;
    },
  };
});

import { haalVanReservebank, meldReservesVrijePlek, reservebankSleutel, reservebankVoorPagina, reserveReactieIds, zetOpReservebank } from "@/lib/reservebank/store";

const START = new Date("2026-11-20T09:00:00+01:00");
const VOOR = new Date("2026-11-19T15:00:00+01:00");
const NA = new Date("2026-11-20T09:30:00+01:00");
const KLUS = { id: "sh1", tenantId: "t1" };
const PAGINA_KLUS = { id: "sh1", tenantId: "t1", branchId: "b1", startsAt: START, status: "PARTIALLY_FILLED" };
const HQ = [{ role: "HQ_ADMIN", organizationId: "t1", locationIds: [] as string[] }];

function zetKlus(over: Record<string, unknown> = {}) {
  h.shift = {
    id: "sh1",
    title: "Magazijn",
    startsAt: START,
    status: "PARTIALLY_FILLED",
    positions: 2,
    createdAt: new Date("2026-11-10T10:00:00+01:00"),
    branch: { tenantId: "t1", tenant: { name: "Hal BV" } },
    _count: { assignments: 1 },
    ...over,
  };
}

beforeEach(() => {
  h.kv.clear();
  h.casWeigert = 0;
  h.kvFout = false;
  h.afzegging = null;
  h.pushes.length = 0;
  h.intern.clear();
  h.offers = [
    { id: "o1", userId: "u1", shiftId: "sh1", status: "pending" },
    { id: "o2", userId: "u2", shiftId: "sh1", status: "pending" },
    { id: "o3", userId: "u3", shiftId: "sh1", status: "accepted" },
  ];
  zetKlus();
});

describe("op de reservebank zetten en eraf halen", () => {
  it("de kluspagina ziet de reserve, en weet of iemand afzegde", async () => {
    await zetOpReservebank(KLUS, "o1", VOOR);
    h.afzegging = { id: "a1" };

    const stand = await reservebankVoorPagina(HQ, PAGINA_KLUS, h.offers, VOOR);

    expect(stand).toEqual({ toegang: "schrijven", open: true, reserveIds: ["o1"], afzegging: true });
  });

  it("schrijft atomisch: weigert het vervangen een keer (een ander was net), dan opnieuw lezen en toch goed", async () => {
    await zetOpReservebank(KLUS, "o1", VOOR);
    h.casWeigert = 1;
    await zetOpReservebank(KLUS, "o2", VOOR);

    const opgeslagen = h.kv.get(reservebankSleutel("sh1")) as { reserves: { offerId: string }[]; versie: number };
    expect(opgeslagen.reserves.map((r) => r.offerId)).toEqual(["o1", "o2"]);
    expect(opgeslagen.versie).toBe(2);
  });

  it("haalt een reserve eraf", async () => {
    await zetOpReservebank(KLUS, "o1", VOOR);
    await zetOpReservebank(KLUS, "o2", VOOR);
    await haalVanReservebank(KLUS, "o1");

    expect((await reservebankVoorPagina(HQ, PAGINA_KLUS, h.offers, VOOR)).reserveIds).toEqual(["o2"]);
  });

  it("een rij van een ander bedrijf telt niet en wordt niet aangevuld", async () => {
    h.kv.set(reservebankSleutel("sh1"), { shiftId: "sh1", tenantId: "t9", versie: 4, reserves: [{ offerId: "o2", at: VOOR.toISOString() }], gemeld: [] });

    expect((await reservebankVoorPagina(HQ, PAGINA_KLUS, h.offers, VOOR)).reserveIds).toEqual([]);

    await zetOpReservebank(KLUS, "o1", VOOR);
    const opgeslagen = h.kv.get(reservebankSleutel("sh1")) as { tenantId: string; reserves: { offerId: string }[] };
    expect(opgeslagen.tenantId).toBe("t1");
    expect(opgeslagen.reserves.map((r) => r.offerId)).toEqual(["o1"]);
  });

  it("geen toegang of na de start: een lege bank; een storing laat de pagina heel", async () => {
    await zetOpReservebank(KLUS, "o1", VOOR);
    expect((await reservebankVoorPagina([{ role: "HQ_ADMIN", organizationId: "t2", locationIds: [] }], PAGINA_KLUS, h.offers, VOOR)).reserveIds).toEqual([]);
    expect(await reservebankVoorPagina(HQ, PAGINA_KLUS, h.offers, NA)).toEqual({ toegang: "schrijven", open: false, reserveIds: [], afzegging: false });
    h.kvFout = true;
    expect((await reservebankVoorPagina(HQ, PAGINA_KLUS, h.offers, VOOR)).reserveIds).toEqual([]);
  });
});

describe("wat de werker ziet", () => {
  it("alleen zijn open reactie op de bank, vóór de start", async () => {
    await zetOpReservebank(KLUS, "o1", VOOR);
    const klus = { id: "sh1", tenantId: "t1", startsAt: START, status: "FILLED" };

    expect([...(await reserveReactieIds(h.offers, [klus], VOOR))]).toEqual(["o1"]);
    expect([...(await reserveReactieIds(h.offers, [klus], NA))]).toEqual([]);
    // de klus van een ander bedrijf (de bank hoort bij t1)
    expect([...(await reserveReactieIds(h.offers, [{ ...klus, tenantId: "t2" }], VOOR))]).toEqual([]);
    h.kvFout = true;
    expect([...(await reserveReactieIds(h.offers, [klus], VOOR))]).toEqual([]);
  });
});

describe("seintje aan de reserves na een afzegging", () => {
  it("één push in de taal van de werker, alleen aan de reserves, één keer per afzegging", async () => {
    await zetOpReservebank(KLUS, "o1", VOOR);
    await zetOpReservebank(KLUS, "o3", VOOR); // intussen geaccepteerd: geen reserve meer

    expect(await meldReservesVrijePlek("sh1", "a1", VOOR)).toEqual({ reserves: 1, gemeld: 1 });
    expect(h.pushes).toEqual([{ ids: ["u1"], title: "Je staat op de reservebank", body: 'Er is plek vrijgekomen bij "Magazijn"; het bedrijf kan je nu inplannen.', url: "/dashboard/klussen/sh1" }]);

    // dezelfde afzegging nog eens (een tweede ronde): geen tweede push
    expect(await meldReservesVrijePlek("sh1", "a1", VOOR)).toEqual({ reserves: 1, gemeld: 0 });
    expect(h.pushes).toHaveLength(1);

    // een andere afzegging is een nieuwe vrije plek
    expect((await meldReservesVrijePlek("sh1", "a2", VOOR)).gemeld).toBe(1);
    expect(h.pushes).toHaveLength(2);
  });

  it("geen push na de start, bij een volle klus of zonder bank", async () => {
    expect(await meldReservesVrijePlek("sh1", "a1", VOOR)).toEqual({ reserves: 0, gemeld: 0 });
    await zetOpReservebank(KLUS, "o1", VOOR);
    expect(await meldReservesVrijePlek("sh1", "a1", NA)).toEqual({ reserves: 0, gemeld: 0 });
    zetKlus({ _count: { assignments: 2 } });
    expect(await meldReservesVrijePlek("sh1", "a1", VOOR)).toEqual({ reserves: 0, gemeld: 0 });
    expect(h.pushes).toEqual([]);
  });

  it("een testklus bereikt geen echte werker, wel een intern account", async () => {
    zetKlus({ title: "Testklus magazijn" });
    await zetOpReservebank(KLUS, "o1", VOOR);
    await zetOpReservebank(KLUS, "o2", VOOR);
    h.intern.add("u2");

    expect(await meldReservesVrijePlek("sh1", "a1", VOOR)).toEqual({ reserves: 2, gemeld: 1 });
    expect(h.pushes.map((p) => p.ids)).toEqual([["u2"]]);
  });
});
