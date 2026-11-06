import { describe, expect, it } from "vitest";
import { isoWeekVan, planWeek, weekLabel, weekPlus, weekSleutelVan } from "@/lib/planner/week";

// Weken van de roosterplanner: ISO-weken in Nederlandse tijd.

describe("isoWeekVan / weekSleutelVan", () => {
  it("kent de ISO-regels (jaarwisseling, week 53)", () => {
    expect(weekSleutelVan(new Date("2026-11-05T12:00:00Z"))).toBe("2026-W45");
    expect(weekSleutelVan(new Date("2026-01-01T12:00:00Z"))).toBe("2026-W01");
    expect(weekSleutelVan(new Date("2027-01-03T12:00:00Z"))).toBe("2026-W53");
    expect(weekSleutelVan(new Date("2027-01-04T12:00:00Z"))).toBe("2027-W01");
    expect(isoWeekVan(new Date("2024-12-30T12:00:00Z"))).toEqual({ jaar: 2025, week: 1 });
  });

  it("zondag 23:30 NL hoort nog bij dezelfde week, ook al is het in UTC al maandag? nee: het is zondag", () => {
    // zo 8 nov 2026 23:30 NL = 22:30Z
    expect(weekSleutelVan(new Date("2026-11-08T22:30:00Z"))).toBe("2026-W45");
    // ma 9 nov 2026 00:30 NL = zo 23:30Z
    expect(weekSleutelVan(new Date("2026-11-08T23:30:00Z"))).toBe("2026-W46");
  });
});

describe("planWeek", () => {
  it("geeft maandag 00:00 NL tot de maandag erna", () => {
    const w = planWeek("2026-W46");
    expect(w?.van.toISOString()).toBe("2026-11-08T23:00:00.000Z");
    expect(w?.tot.toISOString()).toBe("2026-11-15T23:00:00.000Z");
    expect(w?.sleutel).toBe("2026-W46");
  });

  it("weigert onzin", () => {
    expect(planWeek("2026-W54")).toBeNull();
    expect(planWeek("2026-W00")).toBeNull();
    expect(planWeek("week 46")).toBeNull();
    expect(planWeek("2025-W53")).toBeNull(); // 2025 heeft 52 weken, 2026 wel 53
    expect(planWeek("2026-W53")?.sleutel).toBe("2026-W53");
  });
});

describe("weekPlus / weekLabel", () => {
  it("telt weken door, ook over de jaargrens", () => {
    expect(weekPlus("2026-W52", 1)).toBe("2026-W53");
    expect(weekPlus("2026-W53", 1)).toBe("2027-W01");
    expect(weekPlus("2027-W01", -1)).toBe("2026-W53");
  });

  it("maakt een leesbaar label", () => {
    expect(weekLabel("2026-W46")).toMatch(/^week 46: 9 nov – 15 nov 2026$/);
  });
});
