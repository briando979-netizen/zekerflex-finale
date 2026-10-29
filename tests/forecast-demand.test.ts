import { describe, expect, it } from "vitest";
import { forecastDemand } from "@/lib/forecast/demand";

// Vast referentiepunt: donderdag 2026-10-29 12:00 lokaal.
const FROM = new Date(2026, 9, 29, 12, 0, 0);
const daysAgo = (n: number, h = 10) => new Date(2026, 9, 29 - n, h, 0, 0);

describe("forecastDemand", () => {
  it("geeft 7 dagen vooruit, geen data → alles 0 en geen drukste dag", () => {
    const f = forecastDemand([], { from: FROM });
    expect(f.days).toHaveLength(7);
    expect(f.sampleShifts).toBe(0);
    expect(f.busiestWeekday).toBeNull();
    expect(f.days.every((d) => d.expectedPositions === 0)).toBe(true);
    // Eerste dag is de dag ná FROM (vrijdag 30 okt).
    expect(f.days[0]!.date).toBe("2026-10-30");
    expect(f.days[0]!.weekday).toBe("vrijdag");
  });

  it("middelt posities per weekdag over het aantal weken in de data", () => {
    // Twee vrijdagen (7 en 14 dagen terug), elk 1 shift. 29 okt = donderdag,
    // dus 7 en 14 dagen terug zijn donderdagen → nee: 29-7=22 okt = donderdag.
    // Pak expliciet vrijdagen: 23 okt (6 terug) en 16 okt (13 terug) = vrijdag.
    const history = [
      { startsAt: daysAgo(6), positions: 3 }, // vr 23 okt
      { startsAt: daysAgo(13), positions: 5 }, // vr 16 okt
    ];
    const f = forecastDemand(history, { from: FROM });
    expect(f.sampleShifts).toBe(2);
    // 2 distinct weken → (3+5)/2 = 4 verwachte plekken op vrijdag.
    const friday = f.days.find((d) => d.weekday === "vrijdag");
    expect(friday?.expectedPositions).toBe(4);
    expect(f.busiestWeekday).toBe("vrijdag");
    // Een dag zonder historie blijft 0.
    const sunday = f.days.find((d) => d.weekday === "zondag");
    expect(sunday?.expectedPositions).toBe(0);
  });

  it("negeert shifts buiten het venster", () => {
    const f = forecastDemand([{ startsAt: daysAgo(400), positions: 9 }], { from: FROM, windowWeeks: 8 });
    expect(f.sampleShifts).toBe(0);
  });
});
