import { describe, expect, it } from "vitest";
import { DETECTOR_GROOTTE, grootste, leesDetectorUitvoer, nms, pasInVierkant, terugNaarBeeld, type DetectorUitvoer, type Gezicht } from "@/lib/kyc/gezicht/detector";
import { DOEL_PUNTEN, UITGELIJND, lijnUit, schatGelijkvormig } from "@/lib/kyc/gezicht/uitlijnen";
import { BEWEGING, BEWEGING_NIET_AANGELEVERD, BEWEGING_NIET_BEOORDEELD, beoordeelBeweging, oogVerhouding } from "@/lib/kyc/gezicht/beweging";
import { GEZICHT_DREMPEL, KWALITEIT, cosinus, draaiing, kwaliteitsProbleem, meerdereGezichten, oordeelOverScore, type GemetenGezicht } from "@/lib/kyc/gezicht/vergelijk";

// Pure rekenstukken van de gezichtscontrole (lib/kyc/gezicht). De modellen zelf (YuNet, SFace) staan in
// motor.ts en worden hier niet geladen: die zijn op de server gemeten (zie het rapport bij de uitrol).

const leeg = (): DetectorUitvoer => {
  const lijst = (k: number) => [8, 16, 32].map((s) => new Float32Array((DETECTOR_GROOTTE / s) ** 2 * k));
  return { cls: lijst(1), obj: lijst(1), bbox: lijst(4), kps: lijst(10) };
};

/** zet één gezicht in de uitvoer op (rij, kolom) van de stride met index i */
function zet(uit: DetectorUitvoer, i: number, rij: number, kol: number, cls: number, obj: number, bbox: [number, number, number, number], kps: number[]) {
  const stride = [8, 16, 32][i]!;
  const idx = rij * (DETECTOR_GROOTTE / stride) + kol;
  uit.cls[i]![idx] = cls;
  uit.obj[i]![idx] = obj;
  bbox.forEach((v, n) => (uit.bbox[i]![idx * 4 + n] = v));
  kps.forEach((v, n) => (uit.kps[i]![idx * 10 + n] = v));
}

describe("cosinus", () => {
  it("is 1 voor hetzelfde, 0 voor haaks, −1 voor tegengesteld, en 0 bij leeg of nul", () => {
    expect(cosinus([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 6);
    expect(cosinus([1, 0], [0, 1])).toBeCloseTo(0, 6);
    expect(cosinus([1, 2], [-1, -2])).toBeCloseTo(-1, 6);
    expect(cosinus([], [])).toBe(0);
    expect(cosinus([0, 0], [1, 1])).toBe(0);
  });
});

describe("leesDetectorUitvoer (YuNet)", () => {
  it("leest kader en vijf punten zoals OpenCV: (kolom + verschuiving) × stride, exp(breedte) × stride", () => {
    const uit = leeg();
    // stride 16, rij 10, kolom 12: middelpunt (12 + 0,5) × 16 = 200 en (10 + 0,25) × 16 = 164
    zet(uit, 1, 10, 12, 1, 1, [0.5, 0.25, Math.log(5), Math.log(6)], [-1, -0.5, 1, -0.5, 0, 0.5, -0.8, 1, 0.8, 1]);
    const [g] = leesDetectorUitvoer(uit);
    expect(g).toBeDefined();
    expect(g!.score).toBeCloseTo(1, 6);
    expect(g!.breedte).toBeCloseTo(80, 4); // 5 × 16
    expect(g!.hoogte).toBeCloseTo(96, 4); // 6 × 16
    expect(g!.x).toBeCloseTo(200 - 40, 4);
    expect(g!.y).toBeCloseTo(164 - 48, 4);
    // punt 0: ((−1) + 12) × 16 = 176, ((−0,5) + 10) × 16 = 152
    expect(g!.punten[0].x).toBeCloseTo(176, 4);
    expect(g!.punten[0].y).toBeCloseTo(152, 4);
    // neus (punt 2): (0 + 12) × 16 = 192, (0,5 + 10) × 16 = 168
    expect(g!.punten[2].x).toBeCloseTo(192, 4);
    expect(g!.punten[2].y).toBeCloseTo(168, 4);
  });

  it("de score is de wortel van cls × obj en een lage score valt weg", () => {
    const uit = leeg();
    zet(uit, 2, 3, 3, 0.64, 0.64, [0, 0, 1, 1], new Array(10).fill(0));
    zet(uit, 2, 9, 9, 0.2, 0.2, [0, 0, 1, 1], new Array(10).fill(0));
    const g = leesDetectorUitvoer(uit, 0.6);
    expect(g).toHaveLength(1);
    expect(g[0]!.score).toBeCloseTo(0.64, 6);
  });

  it("waarden buiten 0–1 worden afgekapt en ontbrekende lijsten geven geen fout", () => {
    const uit = leeg();
    zet(uit, 0, 5, 5, 7, 7, [0, 0, 1, 1], new Array(10).fill(0));
    expect(leesDetectorUitvoer(uit)[0]!.score).toBe(1);
    expect(leesDetectorUitvoer({ cls: [], obj: [], bbox: [], kps: [] })).toEqual([]);
  });

  it("nms houdt van overlappende kaders het beste en laat losse kaders staan", () => {
    const punten = new Array(5).fill({ x: 0, y: 0 }) as Gezicht["punten"];
    const g = (x: number, score: number): Gezicht => ({ x, y: 0, breedte: 100, hoogte: 100, punten, score });
    const over = nms([g(0, 0.7), g(10, 0.9), g(500, 0.8)], 0.3);
    expect(over.map((o) => o.score)).toEqual([0.9, 0.8]);
  });

  it("pasInVierkant en terugNaarBeeld zijn elkaars omgekeerde", () => {
    const { schaal, w, h } = pasInVierkant(1280, 960);
    expect(schaal).toBeCloseTo(0.5, 6);
    expect(w).toBe(640);
    expect(h).toBe(480);
    const punten = new Array(5).fill({ x: 100, y: 50 }) as Gezicht["punten"];
    const [terug] = terugNaarBeeld([{ x: 100, y: 50, breedte: 60, hoogte: 80, punten, score: 1 }], schaal);
    expect(terug).toMatchObject({ x: 200, y: 100, breedte: 120, hoogte: 160 });
    expect(terug!.punten[0]).toEqual({ x: 200, y: 100 });
    // een klein beeld wordt niet groter gemaakt dan het vierkant, maar wel opgeschaald tot het past
    expect(pasInVierkant(320, 320).schaal).toBeCloseTo(2, 6);
  });

  it("grootste kiest op oppervlak", () => {
    const punten = new Array(5).fill({ x: 0, y: 0 }) as Gezicht["punten"];
    const a: Gezicht = { x: 0, y: 0, breedte: 50, hoogte: 50, punten, score: 0.99 };
    const b: Gezicht = { x: 0, y: 0, breedte: 100, hoogte: 100, punten, score: 0.7 };
    expect(grootste([a, b])).toBe(b);
    expect(grootste([])).toBeNull();
  });
});

describe("uitlijnen", () => {
  const draai = (p: { x: number; y: number }, hoek: number, schaal: number, tx: number, ty: number) => ({
    x: schaal * (Math.cos(hoek) * p.x - Math.sin(hoek) * p.y) + tx,
    y: schaal * (Math.sin(hoek) * p.x + Math.cos(hoek) * p.y) + ty,
  });

  it("vindt een bekende draaiing, schaal en verschuiving terug", () => {
    const hoek = (30 * Math.PI) / 180;
    const naar = DOEL_PUNTEN.map((p) => draai(p, hoek, 1.5, 40, -20));
    const m = schatGelijkvormig(DOEL_PUNTEN, naar)!;
    expect(m.a).toBeCloseTo(1.5 * Math.cos(hoek), 6);
    expect(m.b).toBeCloseTo(1.5 * Math.sin(hoek), 6);
    expect(m.tx).toBeCloseTo(40, 4);
    expect(m.ty).toBeCloseTo(-20, 4);
  });

  it("geeft null bij te weinig of samenvallende punten", () => {
    expect(schatGelijkvormig([{ x: 1, y: 1 }], [{ x: 2, y: 2 }])).toBeNull();
    expect(schatGelijkvormig(new Array(5).fill({ x: 3, y: 3 }), DOEL_PUNTEN)).toBeNull();
  });

  it("een beeld met de punten al op de doelplek komt (bijna) ongewijzigd terug", () => {
    const rgb = new Uint8Array(UITGELIJND * UITGELIJND * 3);
    for (let y = 0; y < UITGELIJND; y++) for (let x = 0; x < UITGELIJND; x++) {
      const o = (y * UITGELIJND + x) * 3;
      rgb[o] = x * 2;
      rgb[o + 1] = y * 2;
      rgb[o + 2] = (x + y) % 256;
    }
    const uit = lijnUit(rgb, UITGELIJND, UITGELIJND, DOEL_PUNTEN)!;
    expect(uit).toHaveLength(UITGELIJND * UITGELIJND * 3);
    let max = 0;
    for (let i = 0; i < uit.length; i++) max = Math.max(max, Math.abs(uit[i]! - rgb[i]!));
    expect(max).toBeLessThanOrEqual(1);
  });

  it("een gezicht op de helft van de grootte wordt opgeschaald naar 112 × 112", () => {
    // een beeld van 56 × 56 met de doelpunten gehalveerd: na uitlijnen moet het gezicht weer vol in beeld staan
    const breedte = 56;
    const rgb = new Uint8Array(breedte * breedte * 3).fill(200);
    const klein = DOEL_PUNTEN.map((p) => ({ x: p.x / 2, y: p.y / 2 }));
    const uit = lijnUit(rgb, breedte, breedte, klein)!;
    expect(uit[0]).toBe(200);
    expect(uit[(60 * UITGELIJND + 60) * 3]).toBe(200);
  });

  it("onbruikbare punten geven null in plaats van een fout", () => {
    expect(lijnUit(new Uint8Array(30), 10, 1, new Array(5).fill({ x: 1, y: 1 }))).toBeNull();
  });
});

describe("bewegingscontrole (beoordeelBeweging)", () => {
  const punten = (nx: number): Gezicht["punten"] => [
    { x: 40, y: 50 },
    { x: 80, y: 50 },
    { x: nx, y: 75 },
    { x: 45, y: 100 },
    { x: 75, y: 100 },
  ];
  const gez = (nx: number, over: Partial<Gezicht> = {}): GemetenGezicht => {
    const g: Gezicht = { x: 20, y: 20, breedte: 200, hoogte: 220, punten: punten(nx), score: 0.95, ...over };
    return { gezicht: g, alle: [g] };
  };
  const recht = gez(60); // draaiing 0

  it("een hoofd dat een kwartslag draaide, van dezelfde persoon, is in orde (naar links én naar rechts)", () => {
    expect(beoordeelBeweging(recht, gez(70), 0.6).oordeel).toBe("ok"); // draaiing 0,25
    expect(beoordeelBeweging(recht, gez(50), 0.6).oordeel).toBe("ok"); // draaiing −0,25
    expect(beoordeelBeweging(recht, gez(70), 0.6).verschil).toBeCloseTo(0.25, 6);
  });

  it("een plat beeld (foto of scherm) dat kantelt houdt dezelfde verhouding en telt dus niet als draaien", () => {
    // alle punten horizontaal samengeknepen rond het midden: neus en ogen schalen mee, de verhouding blijft 0
    const plat = gez(60);
    const samen = plat.gezicht.punten.map((p) => ({ x: 60 + (p.x - 60) * 0.6, y: p.y })) as Gezicht["punten"];
    const gekanteld = gez(60, { punten: samen });
    expect(draaiing(gekanteld.gezicht)).toBeCloseTo(0, 6);
    const u = beoordeelBeweging(recht, gekanteld, 0.9);
    expect(u.oordeel).toBe("niet-gedraaid");
    expect(u.reden).toMatch(/kwartslag/);
  });

  it("een steil platgedrukt beeld met een schijndraaiing wordt afgewezen: de oogafstand krimpt veel meer dan bij een echt hoofd", () => {
    // gemeten: een steil gekanteld plat beeld kan de draaiing tot ±0,4 laten springen; de ogen komen dan ver naar elkaar toe
    const platgedrukt = gez(70, { punten: [{ x: 48, y: 50 }, { x: 72, y: 50 }, { x: 70, y: 75 }, { x: 52, y: 100 }, { x: 68, y: 100 }] });
    expect(draaiing(platgedrukt.gezicht)).toBeGreaterThan(0.4); // zou als draai tellen...
    const u = beoordeelBeweging(recht, platgedrukt, 0.9);
    expect(u.oordeel).toBe("onnatuurlijk"); // ...maar de oogafstand is tot 0,6 gekrompen
    expect(u.reden).toMatch(/platgedrukt/);
    expect(oogVerhouding(platgedrukt.gezicht) / oogVerhouding(recht.gezicht)).toBeCloseTo(0.6, 6);
  });

  it("een echte kwartslag (oogafstand ~0,88 van de eerste) blijft in orde", () => {
    // zoals gemeten bij een echt gedraaid portret: oogratio 0,88 en een draaiing van −0,01 naar −0,25
    const echt = gez(50, { punten: [{ x: 43, y: 50 }, { x: 77, y: 50 }, { x: 50, y: 75 }, { x: 46, y: 100 }, { x: 74, y: 100 }] });
    const u = beoordeelBeweging(recht, echt, 0.7);
    expect(oogVerhouding(echt.gezicht) / oogVerhouding(recht.gezicht)).toBeCloseTo(0.85, 6);
    expect(u.oordeel).toBe("ok");
  });

  it("een kleine draai onder de drempel is niet genoeg", () => {
    expect(beoordeelBeweging(recht, gez(64), 0.9).oordeel).toBe("niet-gedraaid"); // 0,10
    expect(beoordeelBeweging(recht, gez(67.4), 0.9).oordeel).toBe("ok"); // 0,185
  });

  it("de eerste selfie moet bijna recht zijn, anders is 'draaien' niet te meten", () => {
    expect(beoordeelBeweging(gez(66), gez(76), 0.9).oordeel).toBe("niet-recht"); // 0,15 bij de eerste
    expect(beoordeelBeweging(gez(64), gez(74), 0.9).oordeel).toBe("ok"); // 0,10 bij de eerste, verschil 0,25
  });

  it("twee selfies van verschillende personen zijn geen bewegingsbewijs", () => {
    expect(beoordeelBeweging(recht, gez(70), 0.2).oordeel).toBe("andere-persoon");
    expect(beoordeelBeweging(recht, gez(70), null).oordeel).toBe("andere-persoon");
    expect(beoordeelBeweging(recht, gez(70), BEWEGING.zelfdePersoon).oordeel).toBe("ok");
  });

  it("geen gezicht, een onzeker of een tweede gezicht op de gedraaide selfie wordt afgewezen met een duidelijke reden", () => {
    expect(beoordeelBeweging(recht, null, null)).toMatchObject({ oordeel: "geen-gezicht", verschil: null });
    expect(beoordeelBeweging(recht, gez(70, { score: BEWEGING.minScore - 0.01 }), 0.9).oordeel).toBe("te-onzeker");
    expect(beoordeelBeweging(recht, gez(70, { breedte: BEWEGING.minBreedte - 1 }), 0.9).oordeel).toBe("te-onzeker");
    const hoofd = gez(70).gezicht;
    const naast: Gezicht = { ...hoofd, x: 400, score: 0.9 };
    expect(beoordeelBeweging(recht, { gezicht: hoofd, alle: [hoofd, naast] }, 0.9).oordeel).toBe("te-onzeker");
  });

  it("de vaste uitslagen voor 'niet aangeleverd' en 'niet beoordeeld' zijn gewoon Nederlands en tellen niet als ok", () => {
    expect(BEWEGING_NIET_AANGELEVERD.oordeel).toBe("niet-aangeleverd");
    expect(BEWEGING_NIET_BEOORDEELD.oordeel).toBe("niet-beoordeeld");
    expect(BEWEGING_NIET_AANGELEVERD.reden).toMatch(/medewerker/);
  });
});

describe("beslissing over twee gezichten", () => {
  const punten = (nx: number): Gezicht["punten"] => [
    { x: 40, y: 50 },
    { x: 80, y: 50 },
    { x: nx, y: 75 },
    { x: 45, y: 100 },
    { x: 75, y: 100 },
  ];
  const gez = (over: Partial<Gezicht> = {}): Gezicht => ({ x: 20, y: 20, breedte: 200, hoogte: 220, punten: punten(60), score: 0.95, ...over });
  const meting = (g: Gezicht, alle: Gezicht[] = [g]): GemetenGezicht => ({ gezicht: g, alle });

  it("de drempels: zeker vanaf 0,5, aannemelijk vanaf 0,363, daaronder een ander gezicht", () => {
    expect(GEZICHT_DREMPEL.zeker).toBe(0.5);
    expect(GEZICHT_DREMPEL.mogelijk).toBe(0.363);
    expect(oordeelOverScore(0.72)).toMatchObject({ beschikbaar: true, oordeel: "zelfde", score: 0.72 });
    expect(oordeelOverScore(0.5).oordeel).toBe("zelfde");
    expect(oordeelOverScore(0.499).oordeel).toBe("twijfel");
    expect(oordeelOverScore(0.363).oordeel).toBe("twijfel");
    expect(oordeelOverScore(0.362).oordeel).toBe("anders");
    // een negatieve cosinus wordt een score van 0, en boven 1 wordt 1
    expect(oordeelOverScore(-0.3).score).toBe(0);
    expect(oordeelOverScore(1.2).score).toBe(1);
  });

  it("elke reden is gewoon Nederlands en zegt wat de gebruiker kan doen", () => {
    expect(oordeelOverScore(0.2).reden).toMatch(/medewerker/);
    const geen = kwaliteitsProbleem(null, meting(gez()));
    expect(geen).toMatchObject({ beschikbaar: false, oordeel: "onbruikbaar", probleem: "pasfoto" });
    expect(geen!.reden).toMatch(/voorkant van het document/);
    expect(kwaliteitsProbleem(meting(gez()), null)).toMatchObject({ probleem: "selfie" });
  });

  it("een goede pasfoto en selfie geven geen kwaliteitsprobleem", () => {
    expect(kwaliteitsProbleem(meting(gez({ breedte: 90 })), meting(gez()))).toBeNull();
  });

  it("een te kleine of onzekere pasfoto of selfie wordt afgewezen als onbruikbaar, met de juiste kant", () => {
    expect(kwaliteitsProbleem(meting(gez({ breedte: KWALITEIT.minBreedtePasfoto - 1 })), meting(gez()))).toMatchObject({ probleem: "pasfoto" });
    expect(kwaliteitsProbleem(meting(gez({ score: KWALITEIT.scorePasfoto - 0.01 })), meting(gez()))).toMatchObject({ probleem: "pasfoto" });
    expect(kwaliteitsProbleem(meting(gez()), meting(gez({ breedte: KWALITEIT.minBreedteSelfie - 1 })))).toMatchObject({ probleem: "selfie" });
    expect(kwaliteitsProbleem(meting(gez()), meting(gez({ score: KWALITEIT.scoreSelfie - 0.01 })))).toMatchObject({ probleem: "selfie" });
  });

  it("een tweede duidelijk gezicht op de selfie telt als meer dan één gezicht; een klein ruisgezicht niet", () => {
    const hoofd = gez();
    const naast = gez({ x: 400, breedte: 150, hoogte: 160, score: 0.9 });
    const ruis = gez({ x: 400, breedte: 40, hoogte: 40, score: 0.9 });
    const zwak = gez({ x: 400, score: 0.4 });
    expect(meerdereGezichten(meting(hoofd, [hoofd, naast]))).toBe(true);
    expect(meerdereGezichten(meting(hoofd, [hoofd, ruis]))).toBe(false);
    expect(meerdereGezichten(meting(hoofd, [hoofd, zwak]))).toBe(false);
    expect(kwaliteitsProbleem(meting(gez()), meting(hoofd, [hoofd, naast]))).toMatchObject({ probleem: "selfie" });
  });

  it("draaiing: 0 recht in de camera, het teken zegt welke kant op, onafhankelijk van de afstand", () => {
    expect(draaiing(gez({ punten: punten(60) }))).toBeCloseTo(0, 6);
    expect(draaiing(gez({ punten: punten(70) }))).toBeCloseTo(0.25, 6);
    expect(draaiing(gez({ punten: punten(50) }))).toBeCloseTo(-0.25, 6);
    // twee keer zo groot in beeld geeft dezelfde draaiing
    const groot = punten(70).map((p) => ({ x: p.x * 2, y: p.y * 2 })) as Gezicht["punten"];
    expect(draaiing(gez({ punten: groot }))).toBeCloseTo(0.25, 6);
    // ogen op één plek: geen deling door nul
    const plat = new Array(5).fill({ x: 10, y: 10 }) as Gezicht["punten"];
    expect(draaiing(gez({ punten: plat }))).toBe(0);
  });
});
