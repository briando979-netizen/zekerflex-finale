import { describe, expect, it } from "vitest";
import {
  BELGIE_ONDERGRENS_CENTS,
  FLEXI_HORECA_MINIMUM,
  GGMMI_PER_MAAND,
  STUDENT_18_PER_MAAND,
  belgischLoonOordeel,
  belgischMinimumCents,
  ggmmiOp,
  ggmmiUurloonOp,
  uurloonUitMaand,
} from "@/lib/belgie/lonen";

// De lonen bij een klus in België (lib/belgie/lonen.ts, spec-belgie.md hoofdstuk 1): elk bedrag met zijn datum, een
// waarschuwing onder het GGMMI-uurloon (geen blokkade) en bij een flexi-job in de horeca een harde ondergrens van € 13,04.

describe("de bedragen en hun datum", () => {
  it("het GGMMI per periode van 2026, oplopend en elk met een begindatum", () => {
    expect(GGMMI_PER_MAAND.map((r) => [r.vanaf, r.cents])).toEqual([
      ["2026-01-01", 215_411],
      ["2026-04-01", 218_981],
      ["2026-07-01", 223_361],
    ]);
    expect(STUDENT_18_PER_MAAND).toEqual({ vanaf: "2026-07-01", cents: 176_455 });
    expect(FLEXI_HORECA_MINIMUM.cents).toBe(1304);
    // de hoogste van de twee bronnen (RSZ € 13,04, CLB en Securex € 12,78)
    expect(FLEXI_HORECA_MINIMUM.cents).toBeGreaterThan(FLEXI_HORECA_MINIMUM.anderBedragCents);
    expect(FLEXI_HORECA_MINIMUM.bron).toMatch(/^https:\/\/www\.socialsecurity\.be\//);
  });

  it("het uurloon uit het GGMMI: maand x 3 / 13 / 38, vanaf juli 2026 € 13,56", () => {
    expect(uurloonUitMaand(223_361)).toBe(1356);
    expect(ggmmiUurloonOp("2026-12-05")).toBe(1356);
    expect(ggmmiUurloonOp("2026-07-01")).toBe(1356);
    expect(ggmmiUurloonOp("2026-06-30")).toBe(uurloonUitMaand(218_981));
    expect(ggmmiOp("2026-02-10").cents).toBe(215_411);
    // vóór de eerste regel: de eerste
    expect(ggmmiOp("2025-12-31").cents).toBe(215_411);
  });

  it("de harde ondergrens in België is het studentenloon voor 18 jaar (€ 10,72)", () => {
    expect(BELGIE_ONDERGRENS_CENTS).toBe(1072);
    expect(belgischMinimumCents("student", false)).toBe(1072);
    expect(belgischMinimumCents("flexi", false)).toBe(1072);
    expect(belgischMinimumCents(null, true)).toBe(1072);
    // horeca telt alleen bij een flexi-job
    expect(belgischMinimumCents("student", true)).toBe(1072);
    expect(belgischMinimumCents("flexi", true)).toBe(1304);
  });
});

describe("het oordeel over een uurloon", () => {
  const dag = "2026-12-05";

  it("onder € 13,56: een waarschuwing, geen blokkade", () => {
    const o = belgischLoonOordeel({ soort: "student", horeca: false, uurloonCents: 1300, dag });
    expect(o).toEqual({ blokkade: null, minimumCents: 1072, onderGgmmi: true, ggmmiCents: 1356 });
    expect(belgischLoonOordeel({ soort: "flexi", horeca: false, uurloonCents: 1355, dag }).blokkade).toBeNull();
    expect(belgischLoonOordeel({ soort: "flexi", horeca: false, uurloonCents: 1355, dag }).onderGgmmi).toBe(true);
  });

  it("vanaf € 13,56 geen waarschuwing", () => {
    expect(belgischLoonOordeel({ soort: "student", horeca: false, uurloonCents: 1356, dag })).toMatchObject({ blokkade: null, onderGgmmi: false });
    expect(belgischLoonOordeel({ soort: "flexi", horeca: true, uurloonCents: 1500, dag })).toMatchObject({ blokkade: null, onderGgmmi: false });
  });

  it("flexi-job in de horeca: onder € 13,04 tegengehouden, daarboven alleen de waarschuwing", () => {
    expect(belgischLoonOordeel({ soort: "flexi", horeca: true, uurloonCents: 1303, dag })).toMatchObject({ blokkade: "onderFlexiHoreca", minimumCents: 1304 });
    expect(belgischLoonOordeel({ soort: "flexi", horeca: true, uurloonCents: 1100, dag }).blokkade).toBe("onderFlexiHoreca");
    expect(belgischLoonOordeel({ soort: "flexi", horeca: true, uurloonCents: 1304, dag })).toMatchObject({ blokkade: null, onderGgmmi: true });
    // een student in de horeca valt niet onder de flexi-grens
    expect(belgischLoonOordeel({ soort: "student", horeca: true, uurloonCents: 1200, dag }).blokkade).toBeNull();
  });

  it("onder de ondergrens van € 10,72 altijd tegengehouden, ook zonder gekozen soort", () => {
    expect(belgischLoonOordeel({ soort: "student", horeca: false, uurloonCents: 1071, dag }).blokkade).toBe("onderOndergrens");
    expect(belgischLoonOordeel({ soort: null, horeca: false, uurloonCents: 900, dag }).blokkade).toBe("onderOndergrens");
  });
});
