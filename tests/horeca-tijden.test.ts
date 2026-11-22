import { describe, expect, it } from "vitest";
import { STANDAARD_TIJDEN, leesTijden, tijdTekst } from "@/lib/horeca/tijden";

describe("horeca-openingstijden", () => {
  it("leeg of onzin wordt de standaard", () => {
    expect(leesTijden(null)).toEqual(STANDAARD_TIJDEN);
    expect(leesTijden({ "2": { van: "25:00", tot: "12:00" }, x: 1 })).toEqual(STANDAARD_TIJDEN);
  });

  it("neemt geldige tijden en dichte dagen over, ook door na middernacht", () => {
    const t = leesTijden({ "1": { van: "17:00", tot: "02:00" }, "0": null });
    expect(t["1"]).toEqual({ van: "17:00", tot: "02:00" });
    expect(t["0"]).toBeNull();
    expect(tijdTekst(t["1"])).toBe("17:00 – 02:00");
    expect(tijdTekst(null)).toBe("Gesloten");
  });

  it("van gelijk aan tot telt niet", () => {
    expect(leesTijden({ "3": { van: "12:00", tot: "12:00" } })["3"]).toEqual(STANDAARD_TIJDEN["3"]);
  });
});
