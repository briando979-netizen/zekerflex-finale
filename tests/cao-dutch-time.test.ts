import { afterEach, describe, expect, it } from "vitest";
import { caoRates, computeCaoLine, isPublicHoliday } from "@/lib/payroll/cao";

// Toeslagen tellen op de Nederlandse klok. De server draait in UTC: met de
// lokale klok kreeg 22:00–23:00 (winter) geen nachttoeslag en 06:00–07:00 wel,
// en begonnen zondag en feestdagen een uur te laat.

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

const line = (startISO: string, endISO: string, cao = "logistiek") =>
  computeCaoLine({ startISO, endISO, breakMinutes: 0, hourlyRateCents: 2000, age: 30, cao: caoRates(cao), weeklyHoursBefore: 0 });

for (const tz of ["UTC", "Europe/Amsterdam"]) {
  describe(`CAO-toeslagen met de server in ${tz}`, () => {
    it("nachttoeslag van 22:00 tot 24:00 Nederlandse tijd, winter en zomer", () => {
      process.env.TZ = tz;
      expect(line("2026-11-03T21:00:00Z", "2026-11-03T23:00:00Z").nachtHours).toBe(2); // di 22–24 CET
      expect(line("2026-07-07T20:00:00Z", "2026-07-07T22:00:00Z").nachtHours).toBe(2); // di 22–24 CEST
    });

    it("geen nachttoeslag van 06:00 tot 07:00 Nederlandse tijd", () => {
      process.env.TZ = tz;
      const r = line("2026-11-04T05:00:00Z", "2026-11-04T06:00:00Z"); // wo 06–07 CET
      expect(r.nachtHours).toBe(0);
      expect(r.regulierHours).toBe(1);
    });

    it("zondag begint om middernacht in Nederland", () => {
      process.env.TZ = tz;
      const r = line("2026-11-07T23:00:00Z", "2026-11-08T01:00:00Z", "abu"); // zo 00–02 CET
      expect(r.zondagHours).toBe(2);
      expect(r.zaterdagHours).toBe(0);
    });

    it("eerste kerstdag begint om middernacht in Nederland", () => {
      process.env.TZ = tz;
      expect(isPublicHoliday(new Date("2026-12-24T23:30:00Z"))).toBe(true); // 25 dec 00:30
      expect(isPublicHoliday(new Date("2026-12-24T22:30:00Z"))).toBe(false); // 24 dec 23:30
      expect(line("2026-12-24T23:00:00Z", "2026-12-25T01:00:00Z").feestdagHours).toBe(2);
    });
  });
}
