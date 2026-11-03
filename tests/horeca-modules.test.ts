import { describe, expect, it } from "vitest";
import { BASIS, BUNDEL, MODULES, MODULE_SLEUTELS, maandbedrag, schoon, zetModule } from "@/lib/horeca/modules";
import { schoneAllergenen } from "@/lib/horeca/allergenen";

describe("horeca-modules", () => {
  it("aanzetten zet ook aan wat een module nodig heeft", () => {
    expect(zetModule([], "qr", true)).toEqual(["bestellen", "qr"]);
    expect(zetModule(["reserveren"], "betalen", true)).toEqual(["reserveren", "bestellen", "betalen"]);
  });

  it("uitzetten zet ook uit wat erop rust", () => {
    expect(zetModule(["reserveren", "bestellen", "qr", "betalen"], "bestellen", false)).toEqual(["reserveren"]);
    expect(zetModule(["bestellen", "qr"], "qr", false)).toEqual(["bestellen"]);
  });

  it("negeert onbekende en dubbele modules", () => {
    expect(schoon(["taken", "onzin", "taken", "reserveren"])).toEqual(["reserveren", "taken"]);
  });

  it("maandbedrag: basis plus modules, of de bundel als die goedkoper is", () => {
    expect(maandbedrag([])).toEqual({ totaalCent: BASIS.prijsCentPerMaand, losCent: BASIS.prijsCentPerMaand, bundel: false });
    const een = maandbedrag(["reserveren"]);
    expect(een.totaalCent).toBe(BASIS.prijsCentPerMaand + MODULES.reserveren.prijsCentPerMaand);
    expect(een.bundel).toBe(false);
    const alles = maandbedrag([...MODULE_SLEUTELS]);
    expect(alles.bundel).toBe(true);
    expect(alles.totaalCent).toBe(BUNDEL.prijsCentPerMaand);
    expect(alles.losCent).toBeGreaterThan(BUNDEL.prijsCentPerMaand);
  });

  it("vereiste modules bestaan", () => {
    for (const m of MODULE_SLEUTELS) for (const v of MODULES[m].vereist) expect(MODULE_SLEUTELS).toContain(v);
  });

  it("allergenen: alleen bekende, in vaste volgorde", () => {
    expect(schoneAllergenen(["noten", "gluten", "chocola"])).toEqual(["gluten", "noten"]);
  });
});
