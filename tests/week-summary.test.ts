import { describe, expect, it } from "vitest";
import { weekSummary } from "@/lib/dashboard/week-summary";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

// "Deze week: 3 klussen · 24 uur · € 432" bovenaan Mijn klussen.

const item = (id: string, status: string, startsAt: string, hours: number, grossCents: number) => ({
  status,
  shift: { id, startsAt: new Date(startsAt), hours, grossCents },
});

describe("weekSummary", () => {
  // wo 4 nov 2026; de week loopt van ma 2 nov 00:00 tot ma 9 nov 00:00 Nederlandse tijd
  const now = new Date("2026-11-04T12:00:00Z");

  it("telt komende, afgelopen en goedgekeurde klussen van deze week, elk één keer", () => {
    const s = weekSummary(
      [
        item("a", "active", "2026-11-06T08:00:00Z", 8, 14400),
        item("b", "hours", "2026-11-03T08:00:00Z", 7.5, 13500),
        item("c", "done", "2026-11-02T08:00:00Z", 4, 7200),
        item("a", "active", "2026-11-06T08:00:00Z", 8, 14400), // dubbel in de lijst
      ],
      now,
    );
    expect(s).toEqual({ count: 3, hours: 19.5, grossCents: 35100 });
  });

  it("laat afgezegde, niet-gekozen en vervangen klussen en andere weken weg", () => {
    const s = weekSummary(
      [
        item("x", "cancelled", "2026-11-05T08:00:00Z", 8, 14400),
        item("y", "rejected", "2026-11-05T08:00:00Z", 8, 14400),
        item("z", "replacement", "2026-11-05T08:00:00Z", 8, 14400),
        item("v", "active", "2026-11-08T23:30:00Z", 8, 14400), // ma 9 nov 00:30 NL: volgende week
        item("w", "done", "2026-11-01T22:30:00Z", 8, 14400), // zo 1 nov 23:30 NL: vorige week
      ],
      now,
    );
    expect(s).toEqual({ count: 0, hours: 0, grossCents: 0 });
  });

  it("heeft in elke taal een zin, met de juiste meervoudsvorm", () => {
    expect(FREELANCER_DICTS.nl.work.thisWeek(1)).toBe("Deze week: 1 klus");
    expect(FREELANCER_DICTS.nl.work.thisWeek(3)).toBe("Deze week: 3 klussen");
    expect(FREELANCER_DICTS.pl.work.thisWeek(3)).toBe("W tym tygodniu: 3 zlecenia");
    expect(FREELANCER_DICTS.pl.work.thisWeek(5)).toBe("W tym tygodniu: 5 zleceń");
    expect(FREELANCER_DICTS.uk.work.thisWeek(1)).toBe("Цього тижня: 1 зміна");
    expect(FREELANCER_DICTS.uk.work.thisWeek(12)).toBe("Цього тижня: 12 змін");
    for (const d of Object.values(FREELANCER_DICTS)) expect(d.work.weekOver).toContain("60");
  });
});
