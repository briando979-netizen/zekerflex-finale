import { describe, expect, it } from "vitest";
import { berekenCijfers, dagenTussen, type BestellingIn, type ReserveringIn } from "@/lib/horeca/cijfers";

const regel = (naam: string, prijsCent: number, aantal: number, itemId = naam) => ({ itemId, naam, prijsCent, aantal, opmerking: "", station: "keuken" });
const best = (iso: string, totaalCent: number, regels: unknown[], extra: Partial<BestellingIn> = {}): BestellingIn => ({ totaalCent, status: "GESERVEERD", createdAt: new Date(iso), regels, bron: "qr", ...extra });
const res = (datum: string, personen: number, extra: Partial<ReserveringIn> = {}): ReserveringIn => ({ datum, tijd: "19:00", personen, status: "BEVESTIGD", bron: "online", ...extra });

describe("dagenTussen", () => {
  it("telt t/m de laatste dag, ook over een maandgrens", () => {
    expect(dagenTussen("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(dagenTussen("2026-11-02", "2026-11-01")).toEqual([]);
  });
});

describe("berekenCijfers", () => {
  const c = berekenCijfers(
    "2026-11-01",
    "2026-11-03",
    "2026-11-03",
    [
      // 1 nov 23:30 NL = 22:30 UTC (wintertijd)
      best("2026-11-01T22:30:00Z", 2500, [regel("Friet", 450, 2), regel("Burger", 1600, 1)]),
      // 2 nov 00:15 NL = 1 nov 23:15 UTC: telt op 2 nov, uur 0
      best("2026-11-01T23:15:00Z", 900, [regel("Friet", 450, 2)], { bron: "bediening" }),
      best("2026-11-02T11:00:00Z", 1200, [regel("Soep", 600, 2)]),
      // geannuleerd telt nergens
      best("2026-11-02T12:00:00Z", 9900, [regel("Kreeft", 9900, 1)], { status: "GEANNULEERD" }),
      // buiten de periode
      best("2026-10-20T12:00:00Z", 5000, [regel("Oud", 5000, 1)]),
    ],
    [
      res("2026-11-01", 4),
      res("2026-11-01", 2, { status: "NIET_GEKOMEN" }),
      res("2026-11-02", 3, { status: "AANGEKOMEN", bron: "bediening" }),
      res("2026-11-03", 6), // vandaag: telt mee voor couverts, niet voor het no-showpercentage
      res("2026-11-02", 8, { status: "GEANNULEERD" }),
    ],
  );

  it("omzet en bestellingen per Nederlandse dag", () => {
    expect(c.dagen.map((d) => [d.datum, d.omzetCent, d.bestellingen])).toEqual([
      ["2026-11-01", 2500, 1],
      ["2026-11-02", 2100, 2],
      ["2026-11-03", 0, 0],
    ]);
    expect(c.totaal.omzetCent).toBe(4600);
    expect(c.totaal.bestellingen).toBe(3);
    expect(c.totaal.gemiddeldeBonCent).toBe(1533);
  });

  it("couverts, no-shows en percentages", () => {
    expect(c.dagen.map((d) => d.couverts)).toEqual([4, 3, 6]);
    expect(c.totaal.couverts).toBe(13);
    expect(c.totaal.noShows).toBe(1);
    // voorbij: 3 reserveringen (1 en 2 nov), waarvan 1 niet gekomen
    expect(c.totaal.noShowProcent).toBe(33);
    expect(c.totaal.reserveringen).toBe(4);
    expect(c.totaal.onlineGereserveerdProcent).toBe(75);
    expect(c.totaal.zelfBesteldProcent).toBe(67);
  });

  it("top-gerechten op aantal, en drukte per uur in Nederlandse tijd", () => {
    expect(c.topGerechten).toEqual([
      { naam: "Friet", aantal: 4, omzetCent: 1800 },
      { naam: "Soep", aantal: 2, omzetCent: 1200 },
      { naam: "Burger", aantal: 1, omzetCent: 1600 },
    ]);
    expect(c.perUur[23]).toBe(1);
    expect(c.perUur[0]).toBe(1);
    expect(c.perUur[12]).toBe(1); // 11:00 UTC = 12:00 NL
    expect(c.perUur.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("zonder gegevens: nullen, geen deling door nul", () => {
    const leeg = berekenCijfers("2026-11-01", "2026-11-07", "2026-11-07", [], []);
    expect(leeg.dagen).toHaveLength(7);
    expect(leeg.totaal).toMatchObject({ omzetCent: 0, gemiddeldeBonCent: 0, noShowProcent: 0, zelfBesteldProcent: 0, onlineGereserveerdProcent: 0 });
    expect(leeg.topGerechten).toEqual([]);
  });
});
