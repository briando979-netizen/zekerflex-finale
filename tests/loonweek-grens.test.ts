import { describe, expect, it, vi } from "vitest";

// De loonweek op Nederlandse tijd (12 nov 2026, lib/payroll/week.ts): maandag 00:00 Europe/Amsterdam is de grens, niet
// maandag 00:00 UTC. Alle tijdstippen hier met een zone; geen klok nodig (pure functies met een vast tijdstip).

const m = vi.hoisted(() => ({
  runs: new Map<string, unknown>(),
  timesheets: [] as unknown[],
  findMany: vi.fn(),
  lines: [] as { shiftId: string }[][],
}));

vi.mock("@/lib/redis", () => ({ acquireLock: vi.fn() }));
vi.mock("@/lib/payroll/store", () => ({
  getRun: async (id: string) => m.runs.get(id) ?? null,
  saveRun: vi.fn(),
}));
vi.mock("@/lib/payouts/advances", () => ({ payrollAdvancesForWeek: vi.fn().mockResolvedValue([]), reconcilePayrollAdvances: vi.fn() }));
vi.mock("@/lib/payroll/sepa-export", () => ({ generateSepaBatch: vi.fn() }));
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: async () => ({}), invoiceModeFor: () => "reverse-billing", isComplete: () => true }));
vi.mock("@/lib/payroll/compute", () => ({
  computePayslip: (input: { lines: { shiftId: string }[] }) => {
    m.lines.push(input.lines);
    return { headlineCents: 0, lines: [], breakdown: { kind: "invoice", servicesCents: 0 } };
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    timesheet: {
      findMany: async (a: unknown) => {
        m.findMany(a);
        return m.timesheets;
      },
    },
  },
}));

import { buurweken, isoWeekBereik, isoWeekId, isoWeekLabel, isoWeekOf, isoWeekRange } from "@/lib/payroll/week";
import { alBetaaldeRegels } from "@/lib/payroll/al-betaald";
import { buildWeeklyRun } from "@/lib/payroll/engine";

const week = (s: string) => isoWeekId(isoWeekOf(new Date(s)));

describe("isoWeekOf volgt de Nederlandse kalenderdag", () => {
  it("maandag 00:30 in Nederland is de nieuwe week (in UTC is het dan nog zondag)", () => {
    expect(week("2026-11-16T00:30:00+01:00")).toBe("2026-W47");
    expect(week("2026-06-01T01:30:00+02:00")).toBe("2026-W23"); // zomertijd: tot 02:00 verschilde het
  });

  it("zondagavond blijft de oude week, ook na 23:00", () => {
    expect(week("2026-11-15T23:30:00+01:00")).toBe("2026-W46");
    expect(week("2026-05-31T23:59:00+02:00")).toBe("2026-W22");
  });

  it("over de jaargrens: 2026 heeft 53 weken", () => {
    expect(week("2027-01-03T23:30:00+01:00")).toBe("2026-W53");
    expect(week("2027-01-04T00:30:00+01:00")).toBe("2027-W01");
  });
});

describe("isoWeekBereik: de echte tijdstippen van de loonweek", () => {
  it("van maandag 00:00 tot maandag 00:00 Nederlandse tijd", () => {
    const { start, end } = isoWeekBereik({ year: 2026, week: 47 });
    expect(start.toISOString()).toBe("2026-11-15T23:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-22T23:00:00.000Z");
  });

  it("de week van de overgang naar wintertijd duurt 7 dagen en 1 uur", () => {
    const { start, end } = isoWeekBereik({ year: 2026, week: 43 });
    expect(start.toISOString()).toBe("2026-10-18T22:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe((7 * 24 + 1) * 3600 * 1000);
  });

  it("elk tijdstip van 2026 valt in het bereik van zijn eigen week (isoWeekOf en isoWeekBereik zijn het eens)", () => {
    const begin = Date.parse("2026-01-01T00:00:00Z");
    for (let t = begin; t < begin + 366 * 24 * 3600 * 1000; t += 37 * 60 * 1000) {
      const d = new Date(t);
      const { start, end } = isoWeekBereik(isoWeekOf(d));
      expect(start.getTime() <= t && t < end.getTime(), d.toISOString()).toBe(true);
    }
  });

  it("de kalenderweek voor labels en de pensioenmaand blijft gelijk", () => {
    expect(isoWeekLabel({ year: 2026, week: 47 })).toBe("week 47 · 16-11 t/m 22-11 2026");
    expect(isoWeekRange({ year: 2026, week: 47 }).start.toISOString()).toBe("2026-11-16T00:00:00.000Z");
  });

  it("buurweken, ook over de jaargrens", () => {
    expect(buurweken({ year: 2026, week: 47 }).map(isoWeekId)).toEqual(["2026-W46", "2026-W48"]);
    expect(buurweken({ year: 2026, week: 1 }).map(isoWeekId)).toEqual(["2025-W52", "2026-W02"]);
    expect(buurweken({ year: 2026, week: 53 }).map(isoWeekId)).toEqual(["2026-W52", "2027-W01"]);
  });
});

const afgerond = (userId: string, shiftIds: string[], status: "finalised" | "draft" = "finalised") => ({
  status,
  payslips: [{ userId, computed: { lines: shiftIds.map((shiftId) => ({ shiftId })) } }],
});

describe("vangnet: niets dubbel betalen bij de overstap", () => {
  it("alleen regels uit een afgeronde loonrun tellen als al betaald", () => {
    const s = alBetaaldeRegels([afgerond("u1", ["s1"]) as never, afgerond("u2", ["s9"], "draft") as never, null]);
    expect([...s]).toEqual(["u1:s1"]);
  });

  it("buildWeeklyRun selecteert op Nederlandse tijd en slaat een dienst over die al in een afgeronde buurweek staat", async () => {
    m.runs.clear();
    m.lines.length = 0;
    m.runs.set("2026-W46", afgerond("u1", ["s1"]));
    const ts = (id: string, shiftId: string, start: string) => ({
      id, freelancerId: "f1", billableMinutes: 60, hourlyRateCents: 2000, scheduledStart: new Date(start), scheduledEnd: new Date(start),
      actualStart: null, actualEnd: null, breakMinutes: 0,
      freelancer: { id: "f1", userId: "u1", user: { fullName: "Proef", email: null } },
      assignment: { shift: { id: shiftId, title: "Dienst" } }, branch: null,
    });
    // s1 begon maandag 00:30 NL: vroeger week 46 (en daar al afgerond), nu week 47 → overslaan; s2 is gewoon week 47
    m.timesheets = [ts("t1", "s1", "2026-11-16T00:30:00+01:00"), ts("t2", "s2", "2026-11-17T09:00:00+01:00")];
    await buildWeeklyRun("2026-W47", "test");
    const eerste = m.findMany.mock.calls[0]?.[0] as { where: { scheduledStart: { gte: Date; lt: Date } } };
    expect(eerste.where.scheduledStart.gte.toISOString()).toBe("2026-11-15T23:00:00.000Z");
    expect(eerste.where.scheduledStart.lt.toISOString()).toBe("2026-11-22T23:00:00.000Z");
    expect(m.lines.flat().map((l) => l.shiftId)).toEqual(["s2"]);
  });
});
