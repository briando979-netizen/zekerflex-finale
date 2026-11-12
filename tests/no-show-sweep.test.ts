import { beforeEach, describe, expect, it, vi } from "vitest";

// De no-show-sweep (lib/claims/no-show-sweep.ts) staat niet in de cron (keuze eigenaar). Deze grenzen gelden altijd:
// alleen de laatste 7 dagen, alleen geen urenbriefje of een concept zonder check-in, en ?droog=1 verandert niets.

const m = vi.hoisted(() => ({
  findMany: vi.fn(),
  transaction: vi.fn(),
  claim: vi.fn(),
  push: vi.fn(),
  mail: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    shiftAssignment: { findMany: (a: unknown) => m.findMany(a) },
    $transaction: (...a: unknown[]) => m.transaction(...a),
  },
}));
vi.mock("@/lib/env", () => ({ env: { MAIL_ADMIN: "beheer@zekerflex.test" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => m.audit(...a) }));
vi.mock("@/lib/mail", () => ({ sendMail: (...a: unknown[]) => m.mail(...a) }));
vi.mock("@/lib/notifications/localized-push", () => ({ sendLocalizedPush: (...a: unknown[]) => m.push(...a) }));
vi.mock("@/lib/messaging/contacts", () => ({ resolveShiftContact: async () => null }));
vi.mock("@/lib/claims/store", () => ({ offerEmployerClaim: (...a: unknown[]) => m.claim(...a) }));

import { NO_SHOW_MAX_DAGEN, noShowKandidaatWaar, sweepNoShows } from "@/lib/claims/no-show-sweep";

const NU = new Date("2026-11-12T18:00:00+01:00");

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  m.findMany.mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
});

describe("welke toewijzingen als no-show gelden", () => {
  it("alleen diensten die meer dan 60 min geleden begonnen en hooguit 7 dagen oud zijn", () => {
    const w = noShowKandidaatWaar(NU) as { shift: { startsAt: { lt: Date; gte: Date } } };
    expect(w.shift.startsAt.lt.toISOString()).toBe("2026-11-12T16:00:00.000Z");
    expect(w.shift.startsAt.gte.toISOString()).toBe(new Date(NU.getTime() - NO_SHOW_MAX_DAGEN * 86_400_000).toISOString());
  });

  it("een ingediend, goedgekeurd of betaald urenbriefje (ook zonder check-in) telt nooit: alleen geen briefje of een concept", () => {
    const w = noShowKandidaatWaar(NU) as { cancelledAt: null; OR: unknown[] };
    expect(w.cancelledAt).toBeNull();
    expect(w.OR).toEqual([{ timesheet: null }, { timesheet: { actualStart: null, status: "DRAFT" } }]);
  });
});

describe("droge telling", () => {
  it("telt alleen: niets afzeggen, wissen, claimen, pushen, mailen of in de audit", async () => {
    const r = await sweepNoShows({ droog: true, now: NU });
    expect(r).toEqual({ checked: 2, flagged: 0, droog: true });
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.claim).not.toHaveBeenCalled();
    expect(m.push).not.toHaveBeenCalled();
    expect(m.mail).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
    expect(m.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: noShowKandidaatWaar(NU) }));
  });
});
