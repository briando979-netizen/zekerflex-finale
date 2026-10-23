import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const kv: Record<string, unknown> = {};
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv[k] ?? null,
  kvSet: async (k: string, v: unknown) => void (kv[k] = v),
}));

const listRuns = vi.fn();
const getRun = vi.fn();
vi.mock("@/lib/payroll/store", () => ({ listRuns: (...a: unknown[]) => listRuns(...a), getRun: (...a: unknown[]) => getRun(...a) }));

const getFiscal = vi.fn();
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: (...a: unknown[]) => getFiscal(...a) }));

const alertOwner = vi.fn(async (..._a: unknown[]) => "sent" as const);
vi.mock("@/lib/ops/alert", () => ({ alertOwner: (...a: unknown[]) => alertOwner(...a) }));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { buildPensioenAangifte, monthOfWeek, previousMonth, savePensioenAangifte } from "@/lib/pensioen/aangifte";
import { deliverPensioenAangifte } from "@/lib/pensioen/delivery";

function payslip(userId: string, naam: string, over: { gross?: number; pw?: number; pg?: number; regeling?: "geen" | "basis" | "plus"; weken?: number; kind?: string; uren?: number } = {}) {
  return {
    userId,
    freelancerId: `f_${userId}`,
    workerName: naam,
    workerEmail: `${userId}@x.nl`,
    workerKind: over.kind ?? "uitzendkracht",
    isoWeek: "2026-W42",
    weeksWorked: over.weken ?? 12,
    fiscalComplete: true,
    computed: {
      totalHours: over.uren ?? 40,
      breakdown: { kind: "payroll", grossCents: over.gross ?? 100000, pensionEmployeeCents: over.pw ?? 1000, pensionEmployerCents: over.pg ?? 2600, pensionRegeling: over.regeling ?? "basis", phase: "A" },
    },
  };
}

beforeEach(() => {
  // two finalised weeks in October 2026 (W41, W42), one worker across both + one plus worker + one non-pension
  listRuns.mockResolvedValue([
    { isoWeek: "2026-W41", status: "finalised" },
    { isoWeek: "2026-W42", status: "finalised" },
    { isoWeek: "2026-W40", status: "draft" }, // ignored (not finalised)
  ]);
  getRun.mockImplementation(async (w: string) => {
    if (w === "2026-W41") return { payslips: [payslip("u1", "Alice", { gross: 100000, pw: 1000, pg: 2600, weken: 40 })] };
    if (w === "2026-W42")
      return {
        payslips: [
          payslip("u1", "Alice", { gross: 120000, pw: 1200, pg: 3120, weken: 41 }),
          payslip("u2", "Bob", { gross: 90000, pw: 0, pg: 7200, regeling: "plus", weken: 80 }),
          payslip("u3", "Z-zzp", { kind: "zzp", regeling: "geen" }),
        ],
      };
    return null;
  });
  getFiscal.mockImplementation(async (userId: string) =>
    userId === "u2"
      ? { bsnHash: null, bsnLast4: null, birthDate: "1990-01-01" } // Bob misses BSN
      : { bsnHash: "h", bsnLast4: "6789", birthDate: "1988-05-05" },
  );
});

afterEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(kv)) delete kv[k];
});

describe("week → aangiftetijdvak", () => {
  it("maps ISO weeks to the calendar month of their midpoint", () => {
    expect(monthOfWeek("2026-W42")).toBe("2026-10");
    expect(previousMonth(new Date("2026-11-03T00:00:00Z"))).toBe("2026-10");
  });
});

describe("buildPensioenAangifte", () => {
  it("aggregates uitzend pension across the month's finalised runs, skips zzp/geen", async () => {
    const a = await buildPensioenAangifte("2026-10");
    expect(a.lines.map((l) => l.naam)).toEqual(["Alice", "Bob"]); // no zzp
    const alice = a.lines.find((l) => l.naam === "Alice")!;
    // W41 + W42 summed
    expect(alice.pensioengevendLoonCents).toBe(220000);
    expect(alice.werknemerPremieCents).toBe(2200);
    expect(alice.werkgeverPremieCents).toBe(5720);
    expect(alice.wekenGewerkt).toBe(41); // latest week wins
    expect(alice.compleet).toBe(true);
  });

  it("flags a worker without a BSN as incomplete", async () => {
    const a = await buildPensioenAangifte("2026-10");
    const bob = a.lines.find((l) => l.naam === "Bob")!;
    expect(bob.regeling).toBe("plus");
    expect(bob.compleet).toBe(false);
    expect(bob.ontbreekt).toContain("BSN");
    expect(a.totals.incompleet).toBe(1);
  });

  it("totals premium across everyone", async () => {
    const a = await buildPensioenAangifte("2026-10");
    expect(a.totals.werkgeverPremieCents).toBe(5720 + 7200);
    expect(a.totals.totaalPremieCents).toBe(2200 + 5720 + 7200);
  });
});

describe("deliverPensioenAangifte", () => {
  it("refuses to transmit while a line is incomplete (missing BSN)", async () => {
    const a = await buildPensioenAangifte("2026-10");
    a.aansluitnummer = "12345"; // aansluitnummer present, so BSN is the only blocker
    await savePensioenAangifte(a);
    const res = await deliverPensioenAangifte("2026-10");
    expect(res.ok).toBe(false);
    expect(res.detail).toMatch(/ontbrekende gegevens|BSN/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to export when no channel is configured even if complete", async () => {
    getFiscal.mockResolvedValue({ bsnHash: "h", bsnLast4: "6789", birthDate: "1990-01-01" });
    const a = await buildPensioenAangifte("2026-10");
    a.aansluitnummer = "12345"; // pretend configured aansluitnummer
    await savePensioenAangifte(a);
    const res = await deliverPensioenAangifte("2026-10");
    expect(res.ok).toBe(false);
    expect(res.detail).toMatch(/leverkanaal/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
