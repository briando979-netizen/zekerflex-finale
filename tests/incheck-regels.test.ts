import { describe, expect, it } from "vitest";
import { fobHash, isCode, kiesDienst, leesPaspoortToken, leesSerie, nieuweCode, nieuweSleutel, otpGeldig, otpRest, otpVoor, sleutelHash, volgendeActie, voornaam, type DienstVandaag } from "@/lib/incheck/regels";

// Inchecken op locatie (lib/incheck): codes, de draaiende QR en welke dienst in of uit gaat.

const dienst = (over: Partial<DienstVandaag>): DienstVandaag => ({
  assignmentId: "a1",
  shiftId: "s1",
  titel: "Bediening",
  start: new Date("2026-11-06T16:00:00Z"),
  eind: new Date("2026-11-06T22:00:00Z"),
  timesheetId: "ts1",
  timesheetStatus: "DRAFT",
  ingecheckt: false,
  uitgecheckt: false,
  ...over,
});

describe("codes en sleutels", () => {
  it("maakt codes zonder verwisselbare tekens en herkent ze", () => {
    for (let i = 0; i < 50; i++) {
      const c = nieuweCode();
      expect(isCode(c)).toBe(true);
      expect(c).not.toMatch(/[01OIL]/);
    }
    expect(isCode("ABCDEFG1")).toBe(false);
    expect(isCode("abcdefgh")).toBe(false);
  });

  it("bewaart de sleutel en het serienummer alleen als hash, altijd dezelfde", () => {
    const s = nieuweSleutel();
    expect(s).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(sleutelHash(s)).toBe(sleutelHash(s));
    expect(sleutelHash(s)).not.toContain(s.slice(0, 8));
    expect(fobHash("04:A3:2B:7C")).toBe(fobHash("04a32b7c"));
    expect(fobHash("04a32b7c")).not.toBe(fobHash("04a32b7d"));
  });

  it("wisselt de code op het scherm elke minuut en accepteert de vorige nog net", () => {
    const t0 = Date.UTC(2026, 10, 6, 15, 0, 0);
    const a = otpVoor("t1", t0);
    expect(a).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(otpVoor("t1", t0 + 30_000)).toBe(a);
    const b = otpVoor("t1", t0 + 60_000);
    expect(b).not.toBe(a);
    expect(otpVoor("t2", t0)).not.toBe(a);
    expect(otpGeldig("t1", a, t0 + 70_000)).toBe(true); // vorige minuut
    expect(otpGeldig("t1", a, t0 + 130_000)).toBe(false); // twee minuten later niet meer
    expect(otpGeldig("t1", "000000", t0)).toBe(false);
    expect(otpRest(t0 + 45_000)).toBe(15);
  });
});

describe("welke dienst en wat de tik doet", () => {
  const nu = Date.parse("2026-11-06T15:30:00Z"); // half uur voor de dienst

  it("kiest de dienst binnen het venster (2 uur ervoor tot 6 uur erna)", () => {
    expect(kiesDienst([dienst({})], nu)?.shiftId).toBe("s1");
    expect(kiesDienst([dienst({})], Date.parse("2026-11-06T13:00:00Z"))).toBeNull(); // 3 uur ervoor
    expect(kiesDienst([dienst({})], Date.parse("2026-11-07T03:30:00Z"))?.shiftId).toBe("s1"); // 5,5 uur erna
    expect(kiesDienst([dienst({})], Date.parse("2026-11-07T05:00:00Z"))).toBeNull(); // 7 uur erna
    expect(kiesDienst([], nu)).toBeNull();
  });

  it("gaat eerst uitchecken waar al ingecheckt is, en slaat wat klaar is over", () => {
    const later = dienst({ assignmentId: "a2", shiftId: "s2", start: new Date("2026-11-06T17:00:00Z"), eind: new Date("2026-11-06T23:00:00Z") });
    expect(kiesDienst([later, dienst({ ingecheckt: true })], nu)?.shiftId).toBe("s1");
    expect(kiesDienst([dienst({ ingecheckt: true, uitgecheckt: true }), later], nu)?.shiftId).toBe("s2");
    expect(kiesDienst([later, dienst({})], nu)?.shiftId).toBe("s1"); // de vroegste eerst
  });

  it("weet of de volgende tik in, uit of niets is", () => {
    expect(volgendeActie(dienst({}))).toBe("in");
    expect(volgendeActie(dienst({ ingecheckt: true }))).toBe("uit");
    expect(volgendeActie(dienst({ ingecheckt: true, uitgecheckt: true }))).toBeNull();
  });
});

describe("wat de terminal leest", () => {
  it("haalt het serienummer en het paspoort-token uit wat gescand is", () => {
    expect(leesSerie("04:A3:2B:7C:11:22:33")).toBe("04a32b7c112233");
    expect(leesSerie("x")).toBeNull();
    expect(leesSerie(12)).toBeNull();
    expect(leesPaspoortToken("https://zekerflex.com/paspoort/dXNyXzEyMw.abcDEF123456789")).toBe("dXNyXzEyMw.abcDEF123456789");
    expect(leesPaspoortToken("dXNyXzEyMw.abcDEF123456789")).toBe("dXNyXzEyMw.abcDEF123456789");
    expect(leesPaspoortToken("https://example.com/iets")).toBeNull();
    expect(voornaam("Noa van Dijk")).toBe("Noa");
  });
});
