import { describe, expect, it } from "vitest";
import { amsterdamStartOfDay, amsterdamStartOfMonth } from "@/lib/time/amsterdam";

describe("amsterdamStartOfDay", () => {
  it("geeft middernacht Nederlandse tijd, ook kort na middernacht", () => {
    // 3 nov 00:30 in Amsterdam = 2 nov 23:30 UTC → de dag is 3 november
    expect(amsterdamStartOfDay(new Date("2026-11-02T23:30:00Z")).toISOString()).toBe("2026-11-02T23:00:00.000Z");
    expect(amsterdamStartOfDay(new Date("2026-11-03T10:00:00Z"), 1).toISOString()).toBe("2026-11-03T23:00:00.000Z");
  });

  it("klopt rond de overgang naar wintertijd (dag van 25 uur)", () => {
    // 25 okt 2026 is de wisseldag; de volgende dag begint om 23:00 UTC, niet 22:00
    expect(amsterdamStartOfDay(new Date("2026-10-25T12:00:00Z")).toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(amsterdamStartOfDay(new Date("2026-10-25T12:00:00Z"), 1).toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });
});

describe("amsterdamStartOfMonth", () => {
  it("geeft de 1e om middernacht Nederlandse tijd, ook over jaargrenzen", () => {
    expect(amsterdamStartOfMonth(new Date("2026-11-03T10:00:00Z")).toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(amsterdamStartOfMonth(new Date("2026-11-03T10:00:00Z"), 2).toISOString()).toBe("2026-12-31T23:00:00.000Z");
    expect(amsterdamStartOfMonth(new Date("2026-02-10T10:00:00Z"), -5).toISOString()).toBe("2025-08-31T22:00:00.000Z");
    // 31 okt 23:30 UTC = 1 nov 00:30 in Amsterdam → november
    expect(amsterdamStartOfMonth(new Date("2026-10-31T23:30:00Z")).toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });
});
