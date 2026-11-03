import { describe, expect, it } from "vitest";
import { icsVoorBoeking, vouw } from "@/lib/voorstel/ics-bestand";

const bytes = (s: string) => new TextEncoder().encode(s).length;

describe("agendabestand van een reservering", () => {
  const b = { id: "DA7DA27A", datum: "2026-11-04", tijd: "14:00", personen: 8, status: "nieuw" };

  it("zet de Nederlandse tijd om naar UTC, ook over de zomertijd heen", () => {
    const winter = icsVoorBoeking(b, "Buggy rijden", 60, new Date("2026-11-03T10:00:00Z"));
    expect(winter).toContain("DTSTART:20261104T130000Z");
    expect(winter).toContain("DTEND:20261104T140000Z");
    const zomer = icsVoorBoeking({ ...b, datum: "2027-07-01" }, "Kever-rally", 90);
    expect(zomer).toContain("DTSTART:20270701T120000Z");
    expect(zomer).toContain("DTEND:20270701T133000Z");
  });

  it("geeft status, nummer en adres mee, met CRLF en zonder gastgegevens", () => {
    const ics = icsVoorBoeking(b, "Buggy rijden", 60);
    expect(ics).toContain("STATUS:TENTATIVE");
    expect(icsVoorBoeking({ ...b, status: "bevestigd" }, "Buggy rijden", 60)).toContain("STATUS:CONFIRMED");
    expect(icsVoorBoeking({ ...b, status: "geannuleerd" }, "Buggy rijden", 60)).toContain("STATUS:CANCELLED");
    expect(ics).toContain("UID:schwarzwald-DA7DA27A@zekerflex.com");
    expect(ics).toContain("LOCATION:Het Schwarzwald\\, Markeloseweg 115\\, 7461 PB Rijssen");
    expect(ics.split("\r\n").every((r) => bytes(r) <= 75)).toBe(true);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  });

  it("vouwt op 75 bytes met een spatie aan het begin, zonder tekens doormidden", () => {
    expect(vouw("a".repeat(150))).toBe(`${"a".repeat(75)}\r\n ${"a".repeat(74)}\r\n a`);
    for (const lang of ["ë".repeat(80), "😀".repeat(40), `Wensen: ${"crème brûlée ".repeat(12)}`]) {
      const gevouwen = vouw(lang);
      expect(gevouwen.split("\r\n").every((r) => bytes(r) <= 75)).toBe(true);
      expect(gevouwen.replace(/\r\n /g, "")).toBe(lang);
    }
  });
});
