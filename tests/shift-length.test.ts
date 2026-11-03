import { describe, expect, it } from "vitest";
import { shiftLengthProblem } from "@/lib/shifts/shift-length";

// Vangnet voor de lengte van een dienst: > 24 uur is een tikfout, en een
// uitzendkracht mag volgens de Arbeidstijdenwet max. 12 uur per dienst werken.

const at = (from: string, to: string, breakMinutes = 0, viaUitzendbureau = false) => ({
  startsAt: new Date(from),
  endsAt: new Date(to),
  breakMinutes,
  viaUitzendbureau,
});

describe("shiftLengthProblem", () => {
  it("laat een gewone dienst en een lange zzp-dienst door", () => {
    expect(shiftLengthProblem(at("2026-11-05T08:00:00Z", "2026-11-05T16:00:00Z", 30))).toBeNull();
    expect(shiftLengthProblem(at("2026-11-05T06:00:00Z", "2026-11-05T20:00:00Z", 30))).toBeNull(); // 14 uur, zzp
  });

  it("weigert een dienst van meer dan 24 uur (tikfout in de einddatum)", () => {
    expect(shiftLengthProblem(at("2026-11-05T08:00:00Z", "2026-11-06T16:00:00Z"))).toMatch(/duurt 32 uur.*maximaal 24 uur/);
  });

  it("weigert voor een uitzendkracht meer dan 12 uur werk, pauze telt niet mee", () => {
    // 12,5 uur met 30 min pauze = 12 uur werk: mag
    expect(shiftLengthProblem(at("2026-11-05T06:00:00Z", "2026-11-05T18:30:00Z", 30, true))).toBeNull();
    // 13 uur met 30 min pauze = 12,5 uur werk: mag niet
    expect(shiftLengthProblem(at("2026-11-05T06:00:00Z", "2026-11-05T19:00:00Z", 30, true))).toMatch(
      /maximaal 12 uur per dienst werken \(deze dienst: 12,5 uur zonder pauze\)/,
    );
  });
});
