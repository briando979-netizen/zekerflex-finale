import { describe, expect, it } from "vitest";
import type { BestelRegel } from "@/lib/horeca/bestellen";
import { alles, betaalRegels, btwIn, btwSpecificatie, deelRegels, fooiOpties, rekeningVan, totaalVan, verdeelGelijk, wisselgeld, zRapport } from "@/lib/horeca/kassa";

const r = (naam: string, prijsCent: number, aantal: number, btw?: number, extra: Partial<BestelRegel> = {}): BestelRegel => ({ itemId: naam, naam, prijsCent, aantal, opmerking: "", station: "keuken", ...(btw === undefined ? {} : { btw }), ...extra });

describe("horeca-kassa: rekening", () => {
  const bestellingen = [
    { id: "b1", nummer: 1, status: "GESERVEERD", betaald: false, regels: [r("Saté", 1950, 2, 9), r("Pils", 395, 3, 21)] },
    { id: "b2", nummer: 2, status: "GEANNULEERD", betaald: false, regels: [r("Soep", 695, 1, 9)] },
    { id: "b3", nummer: 3, status: "GESERVEERD", betaald: true, regels: [r("Thee", 350, 1, 9)] },
    { id: "b4", nummer: 4, status: "NIEUW", betaald: false, regels: [r("Dame blanche", 750, 2, undefined, { betaaldAantal: 1 })] },
  ];

  it("alleen open regels van niet-geannuleerde, onbetaalde bestellingen; al betaalde stuks eraf", () => {
    const rek = rekeningVan(bestellingen);
    expect(rek.map((x) => `${x.nummer}:${x.naam}×${x.aantal}@${x.btw}`)).toEqual(["1:Saté×2@9", "1:Pils×3@21", "4:Dame blanche×1@9"]);
    expect(totaalVan(rek)).toBe(3900 + 1185 + 750);
  });

  it("btw-specificatie: per tarief inclusief, btw en exclusief", () => {
    const spec = btwSpecificatie(rekeningVan(bestellingen));
    expect(spec).toEqual([
      { tarief: 21, inclCent: 1185, btwCent: 206, exclCent: 979 },
      { tarief: 9, inclCent: 4650, btwCent: 384, exclCent: 4266 },
    ]);
    expect(btwIn(10900, 9)).toBe(900);
    expect(btwIn(12100, 21)).toBe(2100);
  });

  it("betalen per gerecht: betaaldAantal omhoog, pas helemaal betaald als alles weg is", () => {
    const regels = [r("Saté", 1950, 2, 9), r("Pils", 395, 3, 21)];
    const eerst = betaalRegels(regels, [{ index: 0, aantal: 1 }]);
    expect("fout" in eerst).toBe(false);
    if ("fout" in eerst) return;
    expect(eerst.helemaal).toBe(false);
    expect(eerst.regels[0]?.betaaldAantal).toBe(1);
    const daarna = betaalRegels(eerst.regels, [{ index: 0, aantal: 1 }, { index: 1, aantal: 3 }]);
    expect("fout" in daarna ? daarna.fout : daarna.helemaal).toBe(true);
  });

  it("meer betalen dan er open staat of een onbekende regel geeft een fout", () => {
    const regels = [r("Saté", 1950, 2, 9, { betaaldAantal: 1 })];
    expect(betaalRegels(regels, [{ index: 0, aantal: 2 }])).toEqual({ fout: "Van Saté staat nog 1 open." });
    expect("fout" in betaalRegels(regels, [{ index: 5, aantal: 1 }])).toBe(true);
    expect("fout" in betaalRegels(regels, [{ index: 0, aantal: 0 }])).toBe(true);
  });

  it("alles afrekenen = elke open regel helemaal", () => {
    expect(alles(rekeningVan(bestellingen))).toEqual([
      { bestellingId: "b1", index: 0, aantal: 2 },
      { bestellingId: "b1", index: 1, aantal: 3 },
      { bestellingId: "b4", index: 0, aantal: 1 },
    ]);
  });
});

describe("horeca-kassa: splitsen, fooi, wisselgeld", () => {
  it("gelijk verdelen telt precies op tot het totaal", () => {
    expect(verdeelGelijk(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(verdeelGelijk(5835, 4).reduce((s, x) => s + x, 0)).toBe(5835);
    expect(verdeelGelijk(500, 0)).toEqual([500]);
  });

  it("btw per deel: elk deel precies zijn bedrag, samen precies elk tarief", () => {
    const regels = [
      { naam: "Saté", prijsCent: 3900, aantal: 1, btw: 9 },
      { naam: "Pils", prijsCent: 1185, aantal: 1, btw: 21 },
      { naam: "Water", prijsCent: 1, aantal: 1, btw: 0 },
    ];
    const bedragen = verdeelGelijk(5086, 3);
    const delen = deelRegels(regels, bedragen);
    delen.forEach((d, i) => expect(totaalVan(d)).toBe(bedragen[i]));
    const per = (t: number) => delen.flat().filter((x) => x.btw === t).reduce((s, x) => s + x.prijsCent, 0);
    expect([per(9), per(21), per(0)]).toEqual([3900, 1185, 1]);
    expect(delen[0]?.[0]?.naam).toBe("Deel 1 van 3");
  });

  it("vrij splitsen in ongelijke delen klopt ook", () => {
    const regels = [{ naam: "A", prijsCent: 2000, aantal: 1, btw: 9 }, { naam: "B", prijsCent: 1000, aantal: 1, btw: 21 }];
    const delen = deelRegels(regels, [2900, 100]);
    expect(delen.map(totaalVan)).toEqual([2900, 100]);
    const per = (t: number) => delen.flat().filter((x) => x.btw === t).reduce((s, x) => s + x.prijsCent, 0);
    expect([per(9), per(21)]).toEqual([2000, 1000]);
  });

  it("fooi-knoppen: afronden en procenten, nooit nul", () => {
    expect(fooiOpties(4730)).toEqual([
      { label: "Afronden op € 48", fooiCent: 70 },
      { label: "Afronden op € 50", fooiCent: 270 },
      { label: "5 %", fooiCent: 237 },
      { label: "10 %", fooiCent: 473 },
    ]);
    expect(fooiOpties(5000).map((o) => o.label)).toEqual(["5 %", "10 %"]);
  });

  it("wisselgeld", () => {
    expect(wisselgeld(1785, 2000)).toBe(215);
    expect(wisselgeld(1785, 1000)).toBeNull();
  });
});

describe("horeca-kassa: dagafsluiting", () => {
  it("per betaalwijze, btw per tarief en contant in de la (met fooi)", () => {
    const z = zRapport([
      { bedragCent: 1785, fooiCent: 215, methode: "contant", regels: [{ naam: "Soep", prijsCent: 695, aantal: 2, btw: 9 }, { naam: "Pils", prijsCent: 395, aantal: 1, btw: 21 }] },
      { bedragCent: 3900, fooiCent: 0, methode: "pin", regels: [{ naam: "Saté", prijsCent: 1950, aantal: 2, btw: 9 }] },
      { bedragCent: 395, fooiCent: 105, methode: "pin", regels: [{ naam: "Pils", prijsCent: 395, aantal: 1, btw: 21 }] },
    ]);
    expect(z.bonnen).toBe(3);
    expect(z.omzetCent).toBe(6080);
    expect(z.fooiCent).toBe(320);
    expect(z.contantCent).toBe(2000);
    expect(z.perMethode.map((m) => `${m.label}:${m.bedragCent}:${m.aantal}`)).toEqual(["Pin:4295:2", "Contant:1785:1"]);
    expect(z.btw.map((b) => `${b.tarief}:${b.inclCent}`)).toEqual(["21:790", "9:5290"]);
  });
});
