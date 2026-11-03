import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extraDayOptions } from "@/lib/shifts/extra-days";

// De extra dagen van een reeks in "Nieuwe dienst": de 21 kalenderdagen ná de
// begindatum, ongeacht de tijdzone van browser of server.

const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "Europe/Amsterdam"; // zoals een Nederlandse browser
});
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("extraDayOptions", () => {
  it("begint de dag na de begindatum en eindigt 21 dagen later", () => {
    const days = extraDayOptions("2026-11-05");
    expect(days).toHaveLength(21);
    expect(days[0]).toBe("2026-11-06");
    expect(days[20]).toBe("2026-11-26");
    expect(days).not.toContain("2026-11-05");
  });

  it("loopt goed over een maand- en jaargrens en over de zomer/winterwissel", () => {
    expect(extraDayOptions("2026-12-30", 3)).toEqual(["2026-12-31", "2027-01-01", "2027-01-02"]);
    expect(extraDayOptions("2026-10-24", 3)).toEqual(["2026-10-25", "2026-10-26", "2026-10-27"]);
  });
});
