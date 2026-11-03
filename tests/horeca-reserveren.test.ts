import { describe, expect, it } from "vitest";
import { STANDAARD_RESERVEREN, beschikbaarheid, capaciteit, klok, leesInstellingen, magAnnuleren, pastOp, reserveerFout, slotsOp, weekdag } from "@/lib/horeca/reserveren";

// 2026-11-10 is een dinsdag, 2026-11-09 een maandag
const tijden = { "2": { van: "12:00", tot: "22:00" }, "1": null, "5": { van: "17:00", tot: "01:00" } };
const inst = { ...STANDAARD_RESERVEREN, verblijfMinuten: 120, slotMinuten: 30 as const };
const nu = { datum: "2026-11-03", minuten: 600 };

describe("horeca-reserveren", () => {
  it("weekdag en instellingen", () => {
    expect(weekdag("2026-11-10")).toBe("2");
    expect(leesInstellingen({ slotMinuten: 45, maxGroep: 500, verblijfMinuten: 90 })).toEqual({ ...STANDAARD_RESERVEREN, verblijfMinuten: 90 });
    expect(capaciteit({ ...STANDAARD_RESERVEREN, maxGasten: 0 }, 36)).toBe(36);
    expect(capaciteit({ ...STANDAARD_RESERVEREN, maxGasten: 20 }, 36)).toBe(20);
    // nieuwe zaak zonder tafels: niet 1 (dan kan niemand met 2 reserveren), maar de standaard
    expect(capaciteit({ ...STANDAARD_RESERVEREN, maxGasten: 0 }, 0)).toBe(40);
  });

  it("tijden: verblijf eindigt vóór sluiting, dicht = geen tijden, ook na middernacht", () => {
    const s = slotsOp("2026-11-10", tijden, inst).map(klok);
    expect(s[0]).toBe("12:00");
    expect(s.at(-1)).toBe("20:00");
    expect(slotsOp("2026-11-09", tijden, inst)).toEqual([]);
    expect(slotsOp("2026-11-13", tijden, inst).map(klok).at(-1)).toBe("23:00"); // vrijdag tot 01:00
  });

  it("capaciteit telt overlappende reserveringen gedurende het hele verblijf", () => {
    const bezet = [{ tijd: "18:00", personen: 6 }, { tijd: "19:00", personen: 3 }];
    // cap 10: om 17:30 komt het verblijf (tot 19:30) op 4 + 6 + 3 = 13 → past niet
    expect(pastOp(17 * 60 + 30, 4, bezet, inst, 10)).toBe(false);
    // om 21:00 loopt alleen 19:00 nog (tot 21:00 is het al weg) → past
    expect(pastOp(21 * 60, 4, bezet, inst, 10)).toBe(true);
    expect(pastOp(16 * 60, 4, bezet, inst, 10)).toBe(true); // 16:00–18:00: aansluitend, geen overlap
  });

  it("vandaag alleen tijden minstens een half uur vooruit", () => {
    const s = beschikbaarheid("2026-11-03", 2, { "2": { van: "09:00", tot: "22:00" } }, inst, 40, [], { datum: "2026-11-03", minuten: 600 });
    expect(s[0]?.tijd).toBe("10:30");
  });

  it("zelf annuleren: alleen bevestigd en nog niet begonnen", () => {
    const nu = { datum: "2026-11-03", minuten: 18 * 60 };
    expect(magAnnuleren({ status: "BEVESTIGD", datum: "2026-11-04", tijd: "12:00" }, nu)).toBe(true);
    expect(magAnnuleren({ status: "BEVESTIGD", datum: "2026-11-03", tijd: "19:00" }, nu)).toBe(true);
    expect(magAnnuleren({ status: "BEVESTIGD", datum: "2026-11-03", tijd: "17:30" }, nu)).toBe(false);
    expect(magAnnuleren({ status: "BEVESTIGD", datum: "2026-11-02", tijd: "20:00" }, nu)).toBe(false);
    expect(magAnnuleren({ status: "AANGEKOMEN", datum: "2026-11-04", tijd: "12:00" }, nu)).toBe(false);
  });

  it("reserveerFout: verleden, te ver, groep, dicht, vol en goed", () => {
    expect(reserveerFout({ datum: "2026-11-01", tijd: "12:00", personen: 2 }, tijden, inst, 40, [], nu)).toMatch(/vanaf vandaag/);
    expect(reserveerFout({ datum: "2027-06-01", tijd: "12:00", personen: 2 }, tijden, inst, 40, [], nu)).toMatch(/dagen vooruit/);
    expect(reserveerFout({ datum: "2026-11-10", tijd: "12:00", personen: 9 }, tijden, inst, 40, [], nu)).toMatch(/bel ons/);
    expect(reserveerFout({ datum: "2026-11-09", tijd: "12:00", personen: 2 }, tijden, inst, 40, [], nu)).toMatch(/gesloten/);
    expect(reserveerFout({ datum: "2026-11-10", tijd: "21:00", personen: 2 }, tijden, inst, 40, [], nu)).toMatch(/tijden die vrij/);
    expect(reserveerFout({ datum: "2026-11-10", tijd: "18:00", personen: 4 }, tijden, inst, 10, [{ tijd: "18:00", personen: 8 }], nu)).toMatch(/vol/);
    expect(reserveerFout({ datum: "2026-11-10", tijd: "18:00", personen: 2 }, tijden, inst, 10, [{ tijd: "18:00", personen: 8 }], nu)).toBeNull();
  });
});
