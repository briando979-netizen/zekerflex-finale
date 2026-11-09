import { beforeEach, describe, expect, it, vi } from "vitest";

// Werkgever → Uren: "Keur alle briefjes zonder signaal goed". Alleen ingediende
// briefjes zonder signaal en zonder extra kosten, binnen de eigen vestigingen,
// en elk briefje gaat door dezelfde approveTimesheet() als de knop per rij,
// zonder GPS-uitzondering. Eén mislukking houdt de rest niet tegen.

type Rij = { id: string; status: string; extraCostsCents: number | null; branchOk: boolean };
const h = vi.hoisted(() => ({
  rijen: [] as Rij[],
  signalen: new Map<string, { severity: string }[]>(),
  goedgekeurd: [] as unknown[],
  faalt: new Set<string>(),
  where: null as unknown,
  rollen: ["LOCAL_MANAGER"] as string[],
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth", async () => {
  const { AppError: E } = await import("@/lib/errors");
  return {
    requirePrincipal: async () => ({ userId: "m1", grants: h.rollen.map((role) => ({ role, organizationId: "t1", locationIds: [] })) }),
    requireRole: (p: { grants: { role: string }[] }, ...roles: string[]) => {
      if (!p.grants.some((g) => roles.includes(g.role))) throw E.forbidden("geen rechten");
    },
  };
});
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: async () => ({ tenantIds: ["t1"], branchIds: ["b1"] }) }));
vi.mock("@/lib/disputes/raise", () => ({ raiseManagerReviewDispute: async () => undefined, proposeHoursCorrection: async () => undefined }));
vi.mock("@/lib/fraud/timesheet", () => ({
  fraudForTimesheets: async (rows: { id: string }[]) => new Map(rows.map((r) => [r.id, h.signalen.get(r.id) ?? []])),
}));
vi.mock("@/lib/timesheets/approve", () => ({
  approveTimesheet: async (input: { timesheetId: string }) => {
    if (h.faalt.has(input.timesheetId)) throw new Error("IBAN ontbreekt");
    h.goedgekeurd.push(input);
    return {};
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    timesheet: {
      findMany: async ({ where }: { where: { id: { in: string[] }; status: string } }) => {
        h.where = where;
        // de database levert in eigen volgorde: de actie zet ze terug in die van het scherm
        return h.rijen.filter((r) => where.id.in.includes(r.id) && r.branchOk && r.status === where.status).reverse();
      },
    },
  },
}));

import { approveCleanTimesheetsAction } from "@/app/werkgever/uren/actions";
import { BULK_MAX, bulkBericht, schoneUren } from "@/lib/timesheets/bulk-goedkeuren";

const rij = (id: string, extra: Partial<Rij> = {}): Rij => ({ id, status: "SUBMITTED", extraCostsCents: null, branchOk: true, ...extra });

beforeEach(() => {
  h.rijen = [];
  h.signalen = new Map();
  h.goedgekeurd = [];
  h.faalt = new Set();
  h.where = null;
  h.rollen = ["LOCAL_MANAGER"];
});

describe("schoneUren", () => {
  it("kiest alleen ingediende briefjes zonder signaal en zonder extra kosten", () => {
    const rijen = [rij("a"), rij("b", { status: "DISPUTED" }), rij("c", { extraCostsCents: 1500 }), rij("d"), rij("e"), rij("f")];
    const signalen = new Map([
      ["d", [{ severity: "warning" }]],
      ["e", [{ severity: "info" }]],
      ["f", [{ severity: "critical" }]],
    ]);
    expect(schoneUren(rijen, signalen)).toEqual(["a", "e"]);
  });

  it("neemt er hoogstens BULK_MAX per keer", () => {
    const veel = Array.from({ length: BULK_MAX + 5 }, (_, i) => rij(`t${i}`));
    expect(schoneUren(veel, new Map())).toHaveLength(BULK_MAX);
    expect(schoneUren(veel, new Map(), 2)).toEqual(["t0", "t1"]);
  });
});

describe("bulkBericht", () => {
  it("telt goedgekeurd, mislukt en overgeslagen in gewoon Nederlands", () => {
    expect(bulkBericht(3, 0, 0)).toBe("3 urenbriefjes goedgekeurd.");
    expect(bulkBericht(1, 1, 2)).toBe("1 urenbriefje goedgekeurd. 1 niet gelukt: keur dat apart goed om de reden te zien. 2 overgeslagen: al verwerkt, of er kwam een signaal bij.");
    expect(bulkBericht(0, 0, 0)).toBe("Er was niets om goed te keuren.");
  });
});

describe("approveCleanTimesheetsAction", () => {
  it("keurt elk schoon briefje apart goed via approveTimesheet, zonder GPS-uitzondering, in de volgorde van het scherm", async () => {
    h.rijen = [rij("a"), rij("b"), rij("c")];
    const r = await approveCleanTimesheetsAction(["a", "b", "c"]);
    expect(r).toEqual({ ok: true, message: "3 urenbriefjes goedgekeurd." });
    expect(h.goedgekeurd).toEqual([
      { timesheetId: "a", principal: expect.objectContaining({ userId: "m1" }) },
      { timesheetId: "b", principal: expect.objectContaining({ userId: "m1" }) },
      { timesheetId: "c", principal: expect.objectContaining({ userId: "m1" }) },
    ]);
    expect(h.goedgekeurd.every((i) => !("overrideGpsCheck" in (i as object)) && !("correctedBillableMinutes" in (i as object)))).toBe(true);
  });

  it("vraagt alleen eigen vestigingen en nog ingediende briefjes op", async () => {
    h.rijen = [rij("a"), rij("vreemd", { branchOk: false }), rij("al", { status: "APPROVED" })];
    const r = await approveCleanTimesheetsAction(["a", "vreemd", "al"]);
    expect(h.where).toMatchObject({ status: "SUBMITTED", branch: { id: { in: ["b1"] } } });
    expect(h.goedgekeurd).toHaveLength(1);
    expect(r.message).toBe("1 urenbriefje goedgekeurd. 2 overgeslagen: al verwerkt, of er kwam een signaal bij.");
  });

  it("slaat briefjes met een signaal of extra kosten over, ook als het scherm ze meestuurde", async () => {
    h.rijen = [rij("a"), rij("b", { extraCostsCents: 2500 }), rij("c")];
    h.signalen.set("c", [{ severity: "warning" }]);
    await approveCleanTimesheetsAction(["a", "b", "c"]);
    expect(h.goedgekeurd.map((i) => (i as { timesheetId: string }).timesheetId)).toEqual(["a"]);
  });

  it("één mislukking houdt de rest niet tegen", async () => {
    h.rijen = [rij("a"), rij("b"), rij("c")];
    h.faalt.add("b");
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await approveCleanTimesheetsAction(["a", "b", "c"]);
    err.mockRestore();
    expect(h.goedgekeurd).toHaveLength(2);
    expect(r).toEqual({ ok: true, message: "2 urenbriefjes goedgekeurd. 1 niet gelukt: keur dat apart goed om de reden te zien." });
  });

  it("zonder de rol van manager of beheerder gebeurt er niets", async () => {
    h.rollen = ["DISPUTE_MANAGER"];
    h.rijen = [rij("a"), rij("b")];
    const r = await approveCleanTimesheetsAction(["a", "b"]);
    expect(r.ok).toBe(false);
    expect(h.goedgekeurd).toHaveLength(0);
    expect(h.where).toBeNull();
  });

  it("neemt hoogstens BULK_MAX ids en negeert dubbele of lege", async () => {
    const ids = Array.from({ length: BULK_MAX + 10 }, (_, i) => `t${i}`);
    h.rijen = ids.map((id) => rij(id));
    await approveCleanTimesheetsAction([...ids, "t0", ""]);
    expect((h.where as { id: { in: string[] } }).id.in).toHaveLength(BULK_MAX);
    expect(h.goedgekeurd).toHaveLength(BULK_MAX);
    expect(await approveCleanTimesheetsAction([])).toEqual({ ok: false, message: "Er zijn geen uren gekozen." });
  });
});
