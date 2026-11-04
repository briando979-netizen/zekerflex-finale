import { describe, expect, it } from "vitest";
import {
  FACTUUR_DAGEN_VOOR,
  HERINNERING_DAGEN_VOOR,
  LAATSTE_HERINNERING,
  OPZEG_DAGEN_VOOR,
  VERVAL_DAGEN_VOOR,
  dagenTot,
  herinneringVoor,
  isTestAdres,
  jaarLater,
  leesDatum,
  opzegdatum,
  periodeTekst,
  verlengActie,
  vervaldatum,
} from "@/lib/domeinen/verlengen-core";

const DAG = 86_400_000;
const verloopt = new Date("2027-11-05T12:00:00Z");
const op = (dagenVoor: number) => new Date(verloopt.getTime() - dagenVoor * DAG);
const actie = (dagenVoor: number, factuur: Parameters<typeof verlengActie>[0]["factuur"], stap = 0, autoVerlengen = true) =>
  verlengActie({ verlooptOp: verloopt, autoVerlengen, factuur, herinneringStap: stap, nu: op(dagenVoor) });

describe("domeinnamen verlengen: planning", () => {
  it("houdt de afgesproken volgorde aan", () => {
    expect(FACTUUR_DAGEN_VOOR).toBeGreaterThan(VERVAL_DAGEN_VOOR);
    expect(HERINNERING_DAGEN_VOOR[0]).toBe(VERVAL_DAGEN_VOOR);
    expect(HERINNERING_DAGEN_VOOR[LAATSTE_HERINNERING - 1]).toBeGreaterThan(OPZEG_DAGEN_VOOR);
    expect(dagenTot(verloopt, op(10))).toBe(10);
  });

  it("maakt pas 35 dagen vooraf de verlengfactuur", () => {
    expect(actie(60, null)).toEqual({ soort: "niets" });
    expect(actie(36, null)).toEqual({ soort: "niets" });
    expect(actie(35, null)).toEqual({ soort: "factuur" });
    expect(actie(30, null)).toEqual({ soort: "factuur" });
  });

  it("niets meer te doen als de verlenging betaald is", () => {
    expect(actie(20, "PAID", 1)).toEqual({ soort: "niets" });
    expect(actie(3, "PAID", 4)).toEqual({ soort: "niets" });
  });

  it("herinnert op 21, 14, 10 en 8 dagen, één keer per stap", () => {
    expect(actie(25, "ISSUED", 0)).toEqual({ soort: "niets" });
    expect(actie(21, "ISSUED", 0)).toEqual({ soort: "herinnering", stap: 1 });
    expect(actie(20, "ISSUED", 1)).toEqual({ soort: "niets" });
    expect(actie(14, "ISSUED", 1)).toEqual({ soort: "herinnering", stap: 2 });
    expect(actie(10, "ISSUED", 2)).toEqual({ soort: "herinnering", stap: 3 });
    expect(actie(8, "ISSUED", 3)).toEqual({ soort: "herinnering", stap: 4 });
    // een gemiste dag: meteen de stap die nu geldt, geen inhaalrij
    expect(actie(13, "ISSUED", 0)).toEqual({ soort: "herinnering", stap: 2 });
  });

  it("zegt pas op na de laatste waarschuwing, 7 dagen vooraf", () => {
    expect(actie(7, "ISSUED", 4)).toEqual({ soort: "opzeggen", reden: "onbetaald" });
    expect(actie(2, "ISSUED", 4)).toEqual({ soort: "opzeggen", reden: "onbetaald" });
    // zonder laatste waarschuwing nooit opzeggen: eerst die nog sturen
    expect(actie(7, "ISSUED", 2)).toEqual({ soort: "herinnering", stap: 4 });
    // en nooit opzeggen zonder dat er een factuur was
    expect(actie(5, null)).toEqual({ soort: "factuur" });
  });

  it("niet verlengen: geen factuur, wel op tijd opzeggen", () => {
    expect(actie(30, null, 0, false)).toEqual({ soort: "niets" });
    expect(actie(8, null, 0, false)).toEqual({ soort: "niets" });
    expect(actie(7, null, 0, false)).toEqual({ soort: "opzeggen", reden: "op-verzoek" });
  });

  it("een vervallen of geannuleerde factuur telt als geen factuur", () => {
    expect(actie(30, "CANCELLED")).toEqual({ soort: "factuur" });
    expect(actie(30, "DRAFT")).toEqual({ soort: "factuur" });
  });

  it("herinneringVoor telt de drempels", () => {
    expect(herinneringVoor(30)).toBe(0);
    expect(herinneringVoor(21)).toBe(1);
    expect(herinneringVoor(9)).toBe(3);
    expect(herinneringVoor(0)).toBe(4);
  });
});

describe("domeinnamen verlengen: datums", () => {
  it("een jaar later op dezelfde dag, ook rond een schrikkeldag", () => {
    expect(jaarLater(new Date("2026-11-05T12:00:00Z")).toISOString()).toBe("2027-11-05T12:00:00.000Z");
    expect(jaarLater(new Date("2028-02-29T12:00:00Z")).toISOString()).toBe("2029-02-28T12:00:00.000Z");
  });

  it("leest de verlengdatum van het register", () => {
    expect(leesDatum("2027-11-05")?.toISOString()).toBe("2027-11-05T12:00:00.000Z");
    expect(leesDatum("onzin")).toBeNull();
    expect(leesDatum(undefined)).toBeNull();
  });

  it("vervaldatum en opzegdatum liggen voor de verlengdatum", () => {
    expect(vervaldatum(verloopt).getTime()).toBe(op(21).getTime());
    expect(opzegdatum(verloopt).getTime()).toBe(op(7).getTime());
  });

  it("periode op de factuur in gewone Nederlandse datums", () => {
    expect(periodeTekst(new Date("2026-11-05T12:00:00Z"), new Date("2027-11-05T12:00:00Z"))).toBe("5 november 2026 t/m 4 november 2027");
  });
});

describe("domeinnamen verlengen: testbestellingen", () => {
  it("herkent testadressen, ook example.com van de live tests", () => {
    expect(isTestAdres("vk-bedrijf-1@zekerflex.test")).toBe(true);
    expect(isTestAdres("zfe2e-proef@example.com")).toBe(true);
    expect(isTestAdres("iemand@sub.example.org")).toBe(true);
    expect(isTestAdres("info@zekerflex.com")).toBe(false);
    expect(isTestAdres("klant@bakkerij.nl")).toBe(false);
  });
});
