import { describe, expect, it } from "vitest";
import { uurloonOpbouw } from "@/lib/payroll/uurloon-opbouw";

const OP = new Date("2026-11-16T09:00:00+01:00");

describe("uurloonOpbouw", () => {
  it("bruto plus vakantiegeld en vakantiedagen, opgeteld tot het totaal", () => {
    const o = uurloonOpbouw({ hourlyRateCents: 1738, birthDate: "1998-05-02", op: OP });
    expect(o.leeftijd).toBe(28);
    expect(o.brutoCents).toBe(1738);
    expect(o.minimumToegepast).toBe(false);
    expect(o.vakantiegeldCents).toBe(Math.round(1738 * 0.0833));
    expect(o.vakantiedagenCents).toBe(Math.round(1738 * 0.1083));
    expect(o.totaalCents).toBe(o.brutoCents + o.vakantiegeldCents + o.vakantiedagenCents);
    expect(o.vakantiegeldPct).toBe(8.33);
    expect(o.vakantiedagenPct).toBe(10.83);
  });

  it("zonder geboortedatum: geen leeftijd, wel een opbouw", () => {
    const o = uurloonOpbouw({ hourlyRateCents: 1500, birthDate: null, op: OP });
    expect(o.leeftijd).toBeNull();
    expect(o.brutoCents).toBeGreaterThanOrEqual(1500);
  });

  it("een tarief onder het minimumloon voor de leeftijd: de ondergrens geldt", () => {
    const o = uurloonOpbouw({ hourlyRateCents: 100, birthDate: "1990-01-01", op: OP });
    expect(o.minimumToegepast).toBe(true);
    expect(o.brutoCents).toBeGreaterThan(100);
  });
});
