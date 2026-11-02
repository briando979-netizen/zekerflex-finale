import { afterEach, describe, expect, it } from "vitest";
import { amsterdamClock, amsterdamDayKey } from "@/lib/time/amsterdam";
import { monthGrid, type CalShift } from "@/lib/dashboard/employer-calendar";

// De server draait in UTC, telefoons soms in een andere zone. Diensttijden zijn
// Nederlandse tijden: deze helpers moeten overal hetzelfde tonen, anders ziet
// een werker "08:00" voor een dienst van 09:00 en botst de pagina bij laden.

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

const shift = (id: string, startsAt: string): CalShift => ({
  id,
  title: id,
  branch: "Rotterdam",
  startsAt: new Date(startsAt),
  endsAt: new Date(new Date(startsAt).getTime() + 4 * 3_600_000),
  positions: 1,
  filled: 0,
  status: "OPEN",
});

describe("Nederlandse tijd, ongeacht de klok van de server", () => {
  for (const tz of ["UTC", "Europe/Amsterdam", "America/New_York", "Europe/Bucharest"]) {
    it(`toont winter- en zomertijd goed met de server in ${tz}`, () => {
      process.env.TZ = tz;
      expect(amsterdamClock("2026-11-03T08:00:00Z")).toBe("09:00"); // CET, +1
      expect(amsterdamClock("2026-07-03T08:00:00Z")).toBe("10:00"); // CEST, +2
      expect(amsterdamDayKey("2026-11-02T23:30:00Z")).toBe("2026-11-03"); // 00:30 in NL
      expect(amsterdamDayKey("2026-11-02T22:30:00Z")).toBe("2026-11-02");
    });
  }

  it("rondt de klok rond middernacht en bij de wintertijdwissel goed af", () => {
    expect(amsterdamClock("2026-11-02T23:00:00Z")).toBe("00:00");
    expect(amsterdamClock("2026-10-25T00:30:00Z")).toBe("02:30"); // nog zomertijd
    expect(amsterdamClock("2026-10-25T01:30:00Z")).toBe("02:30"); // al wintertijd
  });
});

describe("werkgeverskalender in Nederlandse dagen", () => {
  it("zet een dienst om 00:30 Nederlandse tijd op de juiste dag en markeert vandaag in NL", () => {
    process.env.TZ = "UTC";
    const late = shift("nacht", "2026-11-02T23:30:00Z"); // di 3 nov 00:30 in NL
    const weeks = monthGrid(2026, 10, [late], new Date("2026-11-02T23:30:00Z"));
    const cells = weeks.flat();
    // 1 nov 2026 is een zondag → het rooster begint op maandag 26 okt
    expect(cells[0]).toMatchObject({ day: 26, inMonth: false });
    expect(cells[6]).toMatchObject({ day: 1, inMonth: true });
    const nov2 = cells[7]!;
    const nov3 = cells[8]!;
    expect(nov2.day).toBe(2);
    expect(nov2.shifts).toHaveLength(0);
    expect(nov3.day).toBe(3);
    expect(nov3.shifts.map((s) => s.id)).toEqual(["nacht"]);
    expect(cells.filter((c) => c.isToday).map((c) => c.day)).toEqual([3]);
  });

  it("heeft altijd 6 weken van 7 dagen", () => {
    const weeks = monthGrid(2026, 1, []); // februari
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
});
