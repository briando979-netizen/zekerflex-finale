import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Overbooking-race regression.
//
// Two freelancers accepting the last seat of a shift at the same moment used to
// both read `taken = positions - 1`, both pass the check and both get an
// assignment. `lockShiftSeats` (a Postgres transaction-scoped advisory lock)
// serialises them. This test drives `recordOfferResponse` concurrently against
// an in-memory Prisma stand-in whose `$transaction` honours that advisory lock,
// and asserts only one assignment is ever created. Remove the lock call and the
// second assertion fails.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => {
  // A tiny FIFO mutex keyed by lock id - the stand-in for pg_advisory_xact_lock.
  const tails = new Map<string, Promise<void>>();
  async function acquire(key: string): Promise<() => void> {
    const prev = tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((r) => (release = r));
    tails.set(
      key,
      prev.then(() => mine),
    );
    await prev;
    return release;
  }

  const seat = { positions: 1, assignments: [] as { id: string }[] };

  function makeTx() {
    const tx: Record<string, unknown> & { __release?: () => void } = {};
    tx.$executeRaw = async (
      strings: TemplateStringsArray,
      ...vals: unknown[]
    ) => {
      const sql = strings.join(" ? ");
      if (sql.includes("pg_advisory_xact_lock")) {
        tx.__release = await acquire(`seat:${String(vals[0])}`);
      }
      return 1;
    };
    tx.shiftMatch = {
      findUnique: async () => ({ id: "m", status: "NOTIFIED", expiresAt: null }),
      update: async () => ({}),
      updateMany: async () => ({ count: 0 }),
    };
    tx.shift = {
      findUniqueOrThrow: async () => ({
        id: "shift1",
        positions: seat.positions,
        branchId: "b1",
        title: "Bediening",
        startsAt: new Date("2026-10-01T09:00:00Z"),
        endsAt: new Date("2026-10-01T17:00:00Z"),
        breakMinutes: 30,
        hourlyRateCents: 3000,
        branch: { tenantId: "t1" },
      }),
      update: async () => ({}),
    };
    tx.shiftAssignment = {
      count: async () =>
        seat.assignments.filter(Boolean).length,
      create: async () => {
        const row = { id: `a${seat.assignments.length + 1}` };
        seat.assignments.push(row);
        return row;
      },
    };
    tx.timesheet = { create: async () => ({}) };
    tx.freelancerProfile = { findUnique: async () => ({ userId: "u1" }) };
    return tx;
  }

  const prisma = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = makeTx();
      try {
        return await fn(tx);
      } finally {
        tx.__release?.();
      }
    },
    shiftMatch: { updateMany: async () => ({ count: 0 }) },
  };

  const redis = {
    del: async () => 1,
    hset: async () => 1,
  };

  return { seat, prisma, redis, acquire };
});

vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }));
vi.mock("@/lib/redis", () => ({ redis: h.redis }));
vi.mock("@/lib/engagement/events", () => ({ recordEngagement: () => undefined }));
vi.mock("@/lib/offers/store", () => ({ myOfferForShift: async () => null }));
vi.mock("@/lib/agreements/model-agreement", () => ({
  ensureModelAgreement: async () => ({}),
}));

import { lockShiftSeats } from "@/lib/shifts/seat-lock";
import { recordOfferResponse } from "@/lib/notifications/dispatcher";

beforeEach(() => {
  h.seat.positions = 1;
  h.seat.assignments.length = 0;
});
afterEach(() => vi.clearAllMocks());

describe("lockShiftSeats", () => {
  it("takes a namespaced transaction-scoped advisory lock on the shift", async () => {
    const calls: string[] = [];
    const tx = {
      // must be $executeRaw, not $queryRaw: pg_advisory_xact_lock returns void
      $executeRaw: async (strings: TemplateStringsArray, ...vals: unknown[]) => {
        calls.push(strings.join("?") + " :: " + JSON.stringify(vals));
        return 1;
      },
    };
    await lockShiftSeats(tx as never, "shift-abc");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("pg_advisory_xact_lock");
    expect(calls[0]).toContain("hashtext");
    expect(calls[0]).toContain('"zf:seat:shift-abc"');
  });
});

describe("recordOfferResponse — last-seat race", () => {
  it("creates exactly one assignment when two freelancers accept at once", async () => {
    const results = await Promise.allSettled([
      recordOfferResponse("shift1", "freelancerA", "ACCEPTED"),
      recordOfferResponse("shift1", "freelancerB", "ACCEPTED"),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(h.seat.assignments).toHaveLength(1);
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      message: expect.stringContaining("fully staffed"),
    });
  });

  it("still fills a 2-seat shift for both", async () => {
    h.seat.positions = 2;
    const results = await Promise.allSettled([
      recordOfferResponse("shift1", "freelancerA", "ACCEPTED"),
      recordOfferResponse("shift1", "freelancerB", "ACCEPTED"),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(h.seat.assignments).toHaveLength(2);
  });
});
