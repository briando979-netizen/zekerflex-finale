import { describe, expect, it, vi } from "vitest";

// De eigen instellingen van een werker tellen mee in de matching: geen aanbod
// onder zijn minimumtarief, buiten zijn aangevinkte dagdelen of te ver weg.

const h = vi.hoisted(() => ({ rows: [] as { key: string; value: unknown }[], askedKeys: [] as string[] }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    keyValueStore: {
      findMany: async (args: { where: { key: { in: string[] } } }) => {
        h.askedKeys = args.where.key.in;
        return h.rows.filter((r) => args.where.key.in.includes(r.key));
      },
    },
  },
}));

import { daypartOfHour, loadWorkerPrefs, prefsAllowShift, prefsAllowTravel } from "@/lib/matching/worker-prefs";

// do 5 nov 2026 19:00 NL (avond) = 18:00 UTC; 1800 ct/u
const evening = { startsAt: new Date("2026-11-05T18:00:00Z"), hourlyRateCents: 1800 };
const THU = 4;

describe("prefsAllowShift", () => {
  it("laat alles door als de werker niets heeft ingesteld", () => {
    expect(prefsAllowShift(null, evening)).toBe(true);
    expect(prefsAllowShift({ availability: {}, minHourlyRateCents: null }, evening)).toBe(true);
    // alles uitgevinkt telt als 'niet ingesteld', niet als 'nooit beschikbaar'
    expect(prefsAllowShift({ availability: { [THU]: [] } }, evening)).toBe(true);
  });

  it("weigert onder het minimumtarief", () => {
    expect(prefsAllowShift({ minHourlyRateCents: 2000 }, evening)).toBe(false);
    expect(prefsAllowShift({ minHourlyRateCents: 1800 }, evening)).toBe(true);
  });

  it("volgt de aangevinkte dagdelen, in Nederlandse tijd", () => {
    expect(prefsAllowShift({ availability: { [THU]: ["evening"] } }, evening)).toBe(true);
    expect(prefsAllowShift({ availability: { [THU]: ["morning", "afternoon"] } }, evening)).toBe(false);
    expect(prefsAllowShift({ availability: { 5: ["evening"] } }, evening)).toBe(false); // alleen vrijdag
  });
});

describe("prefsAllowTravel en daypartOfHour", () => {
  it("respecteert de maximale reistijd", () => {
    expect(prefsAllowTravel({ maxTravelMinutes: 30 }, 45)).toBe(false);
    expect(prefsAllowTravel({ maxTravelMinutes: 30 }, 30)).toBe(true);
    expect(prefsAllowTravel(null, 120)).toBe(true);
  });

  it("deelt de dag op zoals Ontdekken", () => {
    expect([daypartOfHour(8), daypartOfHour(12), daypartOfHour(16), daypartOfHour(17)]).toEqual(["morning", "afternoon", "afternoon", "evening"]);
  });
});

describe("loadWorkerPrefs", () => {
  it("haalt alle voorkeuren in één query op", async () => {
    h.rows = [{ key: "prefs:u1", value: { minHourlyRateCents: 2000 } }];
    const m = await loadWorkerPrefs(["u1", "u2"]);
    expect(h.askedKeys).toEqual(["prefs:u1", "prefs:u2"]);
    expect(m.get("u1")).toEqual({ minHourlyRateCents: 2000 });
    expect(m.has("u2")).toBe(false);
  });
});
