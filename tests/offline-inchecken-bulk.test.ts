import { beforeEach, describe, expect, it, vi } from "vitest";

// Werkgever → Uren, "Keur alle briefjes zonder signaal goed" (ef15023b): een
// urenbriefje met een in- of uitcheck die zonder bereik is vastgelegd (bron
// "offline") gaat daar NOOIT mee. Hier met de echte signalen
// (lib/fraud/timesheet.ts) en de echte keuze (schoneUren), zodat ook een
// vergeten veld in de select van de actie opvalt.

type Ev = { type: string; mocked: boolean; withinGeofence: boolean; distanceToBranchMeters: number; recordedAt: Date; bron: string | null; ontvangenOp: Date | null };
type Rij = {
  id: string;
  status: string;
  extraCostsCents: number | null;
  scheduledStart: Date;
  scheduledEnd: Date;
  actualStart: Date | null;
  actualEnd: Date | null;
  breakMinutes: number;
  billableMinutes: number;
  freelancerId: string;
  gpsEvents: Ev[];
};
const h = vi.hoisted(() => ({ rijen: [] as Rij[], goedgekeurd: [] as string[] }));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth", () => ({
  requirePrincipal: async () => ({ userId: "m1", grants: [{ role: "LOCAL_MANAGER", organizationId: "t1", locationIds: [] }] }),
  requireRole: () => undefined,
}));
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: async () => ({ tenantIds: ["t1"], branchIds: ["b1"] }) }));
vi.mock("@/lib/disputes/raise", () => ({ raiseManagerReviewDispute: async () => undefined, proposeHoursCorrection: async () => undefined }));
vi.mock("@/lib/timesheets/approve", () => ({
  approveTimesheet: async (input: { timesheetId: string }) => {
    h.goedgekeurd.push(input.timesheetId);
    return {};
  },
}));

/** Geeft alleen terug wat de select vraagt (ook binnen gpsEvents). */
function kies<T extends Record<string, unknown>>(rij: T, select: Record<string, unknown>): Record<string, unknown> {
  const uit: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(select)) {
    if (!v) continue;
    const waarde = rij[k];
    if (v === true) uit[k] = waarde;
    else if (Array.isArray(waarde)) uit[k] = waarde.map((x) => kies(x as Record<string, unknown>, (v as { select: Record<string, unknown> }).select));
  }
  return uit;
}
vi.mock("@/lib/prisma", () => ({
  prisma: {
    timesheet: {
      findMany: async ({ where, select }: { where: { id: { in: string[] } }; select: Record<string, unknown> }) =>
        h.rijen.filter((r) => where.id.in.includes(r.id)).map((r) => kies(r, select)),
      count: async () => 0,
    },
  },
}));

import { approveCleanTimesheetsAction } from "@/app/werkgever/uren/actions";

const START = new Date("2026-11-09T09:00:00+01:00");
const EINDE = new Date("2026-11-09T13:00:00+01:00");
const incheck = (extra: Partial<Ev> = {}): Ev => ({
  type: "CHECK_IN",
  mocked: false,
  withinGeofence: true,
  distanceToBranchMeters: 15,
  recordedAt: START,
  bron: "apparaat",
  ontvangenOp: null,
  ...extra,
});
const rij = (id: string, gpsEvents: Ev[]): Rij => ({
  id,
  status: "SUBMITTED",
  extraCostsCents: null,
  scheduledStart: START,
  scheduledEnd: EINDE,
  actualStart: START,
  actualEnd: EINDE,
  breakMinutes: 0,
  billableMinutes: 240,
  freelancerId: `fl-${id}`,
  gpsEvents,
});

beforeEach(() => {
  h.rijen = [];
  h.goedgekeurd = [];
});

describe("bulk goedkeuren en offline vastgelegde tijden", () => {
  it("een briefje met een offline in- of uitcheck gaat niet mee, een schoon briefje wel", async () => {
    h.rijen = [
      rij("schoon", [incheck(), incheck({ type: "CHECK_OUT", recordedAt: EINDE })]),
      rij("offline-in", [incheck({ bron: "offline", ontvangenOp: new Date("2026-11-09T09:40:00+01:00") }), incheck({ type: "CHECK_OUT", recordedAt: EINDE })]),
      rij("offline-uit", [incheck(), incheck({ type: "CHECK_OUT", recordedAt: EINDE, bron: "offline", ontvangenOp: new Date("2026-11-09T13:01:00+01:00") })]),
      rij("schoon-2", [incheck({ bron: null })]),
    ];
    const r = await approveCleanTimesheetsAction(["schoon", "offline-in", "offline-uit", "schoon-2"]);
    expect(h.goedgekeurd).toEqual(["schoon", "schoon-2"]);
    expect(r.message).toBe("2 urenbriefjes goedgekeurd. 2 overgeslagen: al verwerkt, of er kwam een signaal bij.");
  });

  it("ook als de telefoon het binnen een minuut alsnog verstuurde: altijd een signaal", async () => {
    h.rijen = [rij("a", [incheck({ bron: "offline", ontvangenOp: new Date(START.getTime() + 30_000) })]), rij("b", [incheck()])];
    await approveCleanTimesheetsAction(["a", "b"]);
    expect(h.goedgekeurd).toEqual(["b"]);
  });
});
