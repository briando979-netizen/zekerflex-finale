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
  it("haalt alle voorkeuren en gekozen branches in één query op", async () => {
    h.rows = [{ key: "prefs:u1", value: { minHourlyRateCents: 2000 } }];
    const m = await loadWorkerPrefs(["u1", "u2"]);
    expect(h.askedKeys).toEqual(["prefs:u1", "prefs:u2", "werker-branches:u1", "werker-branches:u2"]);
    expect(m.get("u1")).toEqual({ minHourlyRateCents: 2000 });
    expect(m.has("u2")).toBe(false);
  });

  it("voegt de gekozen branches toe, ook zonder andere instellingen, maar niet bij alle branches", async () => {
    h.rows = [
      { key: "werker-branches:u1", value: { alle: false, branches: ["horeca", "retail"] } },
      { key: "werker-branches:u2", value: { alle: true, branches: [] } },
      { key: "prefs:u3", value: { minHourlyRateCents: 1500 } },
      { key: "werker-branches:u3", value: { alle: false, branches: ["bouw"] } },
    ];
    const m = await loadWorkerPrefs(["u1", "u2", "u3"]);
    expect(m.get("u1")).toEqual({ branches: ["retail", "horeca"] });
    expect(m.has("u2")).toBe(false);
    expect(m.get("u3")).toEqual({ minHourlyRateCents: 1500, branches: ["bouw"] });
  });
});

describe("prefsAllowShift met branches", () => {
  const barista = { ...evening, title: "Barista voor de avond" };
  const magazijn = { ...evening, title: "Orderpicker magazijn" };

  it("geeft alleen aanbod uit de gekozen branches", () => {
    expect(prefsAllowShift({ branches: ["horeca"] }, barista)).toBe(true);
    expect(prefsAllowShift({ branches: ["horeca"] }, magazijn)).toBe(false);
    expect(prefsAllowShift({ branches: ["horeca", "logistiek"] }, magazijn)).toBe(true);
  });

  it("laat alles door zonder gekozen branches en bij een klus zonder bekende branche (Overig)", () => {
    expect(prefsAllowShift({}, magazijn)).toBe(true);
    expect(prefsAllowShift({ branches: [] }, magazijn)).toBe(true);
    expect(prefsAllowShift({ branches: ["horeca"] }, { ...evening, title: "Hulp gevraagd" })).toBe(true);
  });

  it("kijkt ook naar de vereiste vaardigheid en blijft de andere regels volgen", () => {
    expect(prefsAllowShift({ branches: ["horeca"] }, { ...evening, title: "Hulp gevraagd", skill: "Barista" })).toBe(true);
    expect(prefsAllowShift({ branches: ["horeca"], minHourlyRateCents: 2000 }, barista)).toBe(false);
  });

  it("zonder titel (andere aanroepers) verandert er niets", () => {
    expect(prefsAllowShift({ branches: ["horeca"] }, evening)).toBe(true);
  });
});
