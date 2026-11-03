import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: vi.fn(), invoiceModeFor: vi.fn() }));
vi.mock("@/lib/payroll/uitzend-status", () => ({ getUitzendStatus: vi.fn() }));

import { amsterdamYearQuarter, btwDeadline } from "@/lib/worker/milestones";

describe("amsterdamYearQuarter", () => {
  it("volgt de Nederlandse kalender, niet UTC", () => {
    // 31 maart 22:30 UTC = 1 april 00:30 in Amsterdam (zomertijd) → Q2
    expect(amsterdamYearQuarter(new Date("2026-03-31T22:30:00Z"))).toEqual({ year: 2026, quarter: 2 });
    // 31 december 23:30 UTC = 1 januari in Amsterdam → nieuw jaar, Q1
    expect(amsterdamYearQuarter(new Date("2026-12-31T23:30:00Z"))).toEqual({ year: 2027, quarter: 1 });
    expect(amsterdamYearQuarter(new Date("2026-11-03T10:00:00Z"))).toEqual({ year: 2026, quarter: 4 });
  });
});

describe("btwDeadline", () => {
  it("is het eind van de laatste dag van de maand na het kwartaal, Nederlandse tijd", () => {
    // Q1 → 30 april 23:59:59 zomertijd = 21:59:59 UTC
    expect(btwDeadline(2026, 1).toISOString()).toBe("2026-04-30T21:59:59.000Z");
    // Q3 → 31 oktober 23:59:59 wintertijd = 22:59:59 UTC
    expect(btwDeadline(2026, 3).toISOString()).toBe("2026-10-31T22:59:59.000Z");
    // Q4 → 31 januari van het volgende jaar
    expect(btwDeadline(2026, 4).toISOString()).toBe("2027-01-31T22:59:59.000Z");
  });
});
