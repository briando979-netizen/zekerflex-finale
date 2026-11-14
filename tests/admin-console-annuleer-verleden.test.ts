import { afterEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

// De beheeractie cancel_past_due_open_shifts annuleerde ook uitgevoerde klussen met werkers erop (14 nov).
// Nu pakt hij alleen klussen zonder actieve inschrijving en noemt hij hoeveel er bleven staan.
const { tellingen, count, findMany, updateMany } = vi.hoisted(() => {
  const tellingen = { zonder: 4, met: 3 };
  return {
    tellingen,
    count: vi.fn(async ({ where }: { where: Prisma.ShiftWhereInput }) =>
      (where.assignments as { some?: unknown } | undefined)?.some ? tellingen.met : tellingen.zonder,
    ),
    findMany: vi.fn(async (_a: { where: Prisma.ShiftWhereInput }) => [
      { title: "Bediening", startsAt: new Date("2026-11-10T16:00:00+01:00"), branch: { name: "Centrum" } },
    ]),
    updateMany: vi.fn(async (_a: { where: Prisma.ShiftWhereInput; data: unknown }) => ({ count: tellingen.zonder })),
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: { shift: { count, findMany, updateMany } } }));

import { MUTATIONS } from "@/lib/admin-console/mutations";

const actie = MUTATIONS["cancel_past_due_open_shifts"]!;

afterEach(() => {
  vi.clearAllMocks();
  tellingen.zonder = 4;
  tellingen.met = 3;
});

describe("cancel_past_due_open_shifts: alleen klussen waar niemand op staat", () => {
  it("annuleert alleen klussen zonder actieve inschrijving", async () => {
    const r = await actie.execute({}, {});
    const where = updateMany.mock.calls[0]![0].where;
    expect(where.assignments).toEqual({ none: { cancelledAt: null } });
    expect(updateMany.mock.calls[0]![0].data).toEqual({ status: "CANCELLED" });
    expect(r.affectedCount).toBe(4);
    expect(r.detail).toContain("4 klus(sen) geannuleerd.");
    expect(r.detail).toContain("3 verlopen klus(sen) met iemand erop blijven staan");
  });

  it("de telling vooraf noemt wat er geannuleerd wordt en wat er blijft staan, en waarom", async () => {
    const impact = await actie.dryRun({}, {});
    expect(impact.affectedCount).toBe(4);
    expect(impact.summary).toBe("4 verlopen open klus(sen) zonder iemand erop worden op CANCELLED gezet; 3 met iemand erop blijven staan.");
    expect(impact.warnings.some((w) => w.includes("uitgevoerd of nog bezig"))).toBe(true);
    expect(impact.sample).toHaveLength(1);
    // het voorbeeld en de telling gebruiken dezelfde voorwaarde als het annuleren
    expect(findMany.mock.calls[0]![0].where.assignments).toEqual({ none: { cancelledAt: null } });
  });

  it("niemand blijft staan: geen waarschuwing daarover en een korte uitslag", async () => {
    tellingen.met = 0;
    const impact = await actie.dryRun({}, {});
    expect(impact.warnings.some((w) => w.includes("blijven staan"))).toBe(false);
    const r = await actie.execute({}, {});
    expect(r.detail).toBe("4 klus(sen) geannuleerd.");
  });
});
