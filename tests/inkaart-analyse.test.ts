import { describe, expect, it } from "vitest";
import { analyseer, roosterRijen } from "@/lib/inkaart/analyse";
import { RASTER_LENGTE, leegBedrijf, legeBezetting, plekNaam, type BedrijfInKaart, type Ruimte } from "@/lib/inkaart/model";
import { bedrijfSchema, leesBedrijf } from "@/lib/inkaart/schema";

// De berekeningen van "Bedrijf in kaart": elk getal volgt uit wat het bedrijf zelf invulde en is hier met de hand nagerekend.

/** Maandag tot en met vrijdag, ochtend (index 0) en middag (index 1): dat zijn de standaard open dagdelen. */
function bezetting(waarden: Record<number, number>) {
  const r = legeBezetting();
  for (const [i, v] of Object.entries(waarden)) r[Number(i)] = v;
  return r;
}

const SPREEKKAMER: Ruimte = {
  id: "r1",
  naam: "Spreekkamer",
  soort: "Spreekkamer",
  aantal: 12,
  m2: 12,
  plekken: 3,
  afdeling: "Polikliniek",
  verdieping: "1",
  // ma ochtend 80, ma middag 60, di 70/50, wo 40/30, do 60/60, vr 50/20 = som 520 over 10 dagdelen = 52 gemiddeld
  bezetting: bezetting({ 0: 80, 1: 60, 3: 70, 4: 50, 6: 40, 7: 30, 9: 60, 10: 60, 12: 50, 13: 20 }),
  notitie: "",
};

function ziekenhuis(extra: Partial<BedrijfInKaart> = {}): BedrijfInKaart {
  return {
    ...leegBedrijf("ziekenhuis", new Date("2026-11-15T10:00:00+01:00")),
    omzetJaar: 6_250_000,
    huurJaar: 500_000,
    groepen: [
      { id: "g1", naam: "Artsen", fte: 10, kostenJaar: 1_200_000 },
      { id: "g2", naam: "Verpleegkundigen", fte: 20, kostenJaar: 1_300_000 },
    ],
    ruimtes: [SPREEKKAMER],
    ...extra,
  };
}

describe("personeel en kosten", () => {
  it("rekent het personeelskostenpercentage, de kosten per fte en de huur uit", () => {
    const f = analyseer(ziekenhuis()).financieel;
    expect(f.fte).toBe(30);
    expect(f.personeelskosten).toBe(2_500_000);
    expect(f.personeelPct).toBe(40); // 2,5 miljoen van 6,25 miljoen
    expect(f.kostenPerFte).toBe(83_333);
    expect(f.omzetPerFte).toBe(208_333);
    expect(f.huurPct).toBe(8);
    expect(f.omzetPerM2).toBe(43_403); // 6,25 miljoen over 12 x 12 = 144 m2
    expect(f.huurPerM2).toBe(3_472);
  });

  it("gebruikt het totaal dat het bedrijf zelf opgaf als de groepen geen kosten hebben", () => {
    const b = ziekenhuis({ personeelskostenJaar: 3_125_000, groepen: [{ id: "g1", naam: "Iedereen", fte: 25, kostenJaar: null }] });
    expect(analyseer(b).financieel.personeelPct).toBe(50);
    expect(analyseer(b).financieel.kostenPerFte).toBe(125_000);
  });

  it("zonder omzet of zonder personeel is het getal null, nooit 0", () => {
    const leeg = analyseer(leegBedrijf());
    expect(leeg.financieel.personeelPct).toBeNull();
    expect(leeg.financieel.kostenPerFte).toBeNull();
    expect(leeg.financieel.omzetPerFte).toBeNull();
    expect(leeg.ruimtes.m2Totaal).toBeNull();
    expect(leeg.bezetting.gemiddeld).toBeNull();
    expect(analyseer(ziekenhuis({ omzetJaar: 0 })).financieel.personeelPct).toBeNull();
  });

  it("zegt dat het personeelskostenpercentage boven het eigen doel ligt, met wat dat per jaar is", () => {
    const sig = analyseer(ziekenhuis({ doelPersoneelPct: 35 })).signalen.find((s) => s.id === "personeel-boven-doel");
    expect(sig?.niveau).toBe("aandacht");
    expect(sig?.titel).toContain("5 procentpunt");
    expect(sig?.waarom).toMatch(/312[.,  ]?500/); // 5% van 6,25 miljoen
    expect(sig?.actie?.href).toBe("/werkgever/diensten/nieuw");
    expect(analyseer(ziekenhuis({ doelPersoneelPct: 45 })).signalen.some((s) => s.id === "personeel-binnen-doel")).toBe(true);
  });

  it("zonder doel noemt het alleen het percentage en vergelijkt het niet met 'andere bedrijven'", () => {
    const s = analyseer(ziekenhuis()).signalen.find((x) => x.id === "personeel-doel");
    expect(s?.titel).toContain("40%");
    expect(JSON.stringify(analyseer(ziekenhuis()).signalen)).not.toMatch(/gemiddeld in de branche|branchegemiddelde|doorsnee bedrijf/i);
  });
});

describe("ruimtes en bezetting", () => {
  it("telt de ruimtes en de oppervlakte (aantal maal de m2 per ruimte)", () => {
    const a = analyseer(ziekenhuis());
    expect(a.ruimtes.aantal).toBe(12);
    expect(a.ruimtes.m2Totaal).toBe(144);
    expect(a.ruimtes.m2PerFte).toBe(4.8);
    expect(a.ruimtes.ruimtesPerFte).toBe(0.4);
  });

  it("rekent de gemiddelde bezetting over de open dagdelen waarvoor iets is ingevuld", () => {
    const u = analyseer(ziekenhuis()).perRuimte[0]!;
    expect(u.gemiddeld).toBe(52);
    expect(u.piek).toEqual({ index: 0, pct: 80 });
  });

  it("op het drukste moment heb je 10 van de 12 nodig: 2 staan leeg", () => {
    const u = analyseer(ziekenhuis()).perRuimte[0]!;
    expect(u.nodigBijPiek).toBe(10); // 12 x 80% = 9,6 naar boven
    expect(u.leegBijPiek).toBe(2);
    const s = analyseer(ziekenhuis()).signalen.find((x) => x.id === "minder-nodig-r1");
    expect(s?.titel).toContain("10 van de 12");
    expect(s?.waarom).toContain("maandagochtend");
  });

  it("de uren per week dat het leeg staat volgen uit de bezetting", () => {
    // 12 ruimtes x 6 uur x (10 dagdelen - 5,2 bezet) = 345,6
    expect(analyseer(ziekenhuis()).perRuimte[0]?.ongebruiktUrenPerWeek).toBe(346);
  });

  it("een gesloten dagdeel telt niet mee, ook als er een waarde staat", () => {
    const r = { ...SPREEKKAMER, bezetting: bezetting({ 0: 100, 2: 0 }) }; // index 2 = maandagavond: standaard gesloten
    const u = analyseer(ziekenhuis({ ruimtes: [r] })).perRuimte[0]!;
    expect(u.gemiddeld).toBe(100);
    expect(u.piek?.pct).toBe(100);
  });

  it("het raster over alle ruimtes is gewogen naar het aantal", () => {
    const klein: Ruimte = { ...SPREEKKAMER, id: "r2", naam: "Behandelkamer", soort: "Behandelkamer", aantal: 4, bezetting: bezetting({ 0: 20 }) };
    const a = analyseer(ziekenhuis({ ruimtes: [SPREEKKAMER, klein] }));
    // maandagochtend: (12 x 80 + 4 x 20) / 16 = 65
    expect(a.bezetting.raster[0]).toBe(65);
    expect(a.ruimtes.perSoort.map((s) => s.soort)).toEqual(["Spreekkamer", "Behandelkamer"]);
  });

  it("vindt het drukste en rustigste moment en de spreiding", () => {
    const b = analyseer(ziekenhuis()).bezetting;
    expect(b.piek).toEqual({ index: 0, pct: 80 });
    expect(b.dal).toEqual({ index: 13, pct: 20 });
    expect(plekNaam(13)).toBe("vrijdagmiddag");
    expect(b.spreiding).toBe(60);
    const s = analyseer(ziekenhuis()).signalen.find((x) => x.id === "spreiding");
    expect(s?.niveau).toBe("aandacht");
    expect(s?.waarom).toContain("60 procentpunt");
    expect(s?.actie?.href).toBe("/werkgever/diensten/nieuw");
  });

  it("een rustige ruimte krijgt een signaal met de grens die gebruikt is (eigen doel, of onze standaard)", () => {
    expect(analyseer(ziekenhuis()).signalen.some((s) => s.id === "rustig-r1")).toBe(false); // 52 is boven de standaard 40
    const met = analyseer(ziekenhuis({ doelBezettingPct: 60 })).signalen.find((s) => s.id === "rustig-r1");
    expect(met?.titel).toContain("52%");
    expect(met?.waarom).toContain("jouw doel van 60%");
    const laag = { ...SPREEKKAMER, bezetting: bezetting({ 0: 30, 1: 20 }) };
    const standaard = analyseer(ziekenhuis({ ruimtes: [laag] })).signalen.find((s) => s.id === "rustig-r1");
    expect(standaard?.waarom).toContain("40%");
    expect(standaard?.waarom).toContain("zolang je geen doel instelt");
  });

  it("een ruimte die op het drukste moment bijna vol zit, krijgt een signaal", () => {
    const vol = { ...SPREEKKAMER, bezetting: bezetting({ 0: 95, 1: 60 }) };
    const s = analyseer(ziekenhuis({ ruimtes: [vol] })).signalen.find((x) => x.id === "vol-r1");
    expect(s?.titel).toContain("95%");
  });

  it("één ruimte heeft geen 'minder nodig'-signaal (er is niets om te verminderen)", () => {
    const een = { ...SPREEKKAMER, aantal: 1 };
    expect(analyseer(ziekenhuis({ ruimtes: [een] })).signalen.some((s) => s.id.startsWith("minder-nodig"))).toBe(false);
  });
});

describe("wat ontbreekt", () => {
  it("zonder ruimtes vraagt het ze toe te voegen; zonder bezetting vraagt het die in te vullen", () => {
    expect(analyseer(leegBedrijf()).signalen.map((s) => s.id)).toContain("geen-ruimtes");
    const zonder = analyseer(ziekenhuis({ ruimtes: [{ ...SPREEKKAMER, bezetting: legeBezetting() }] }));
    expect(zonder.signalen.map((s) => s.id)).toContain("geen-bezetting");
    expect(zonder.perRuimte[0]?.gemiddeld).toBeNull();
  });

  it("de volledigheid loopt van 0 naar 100 naarmate er meer is ingevuld", () => {
    expect(analyseer(leegBedrijf()).volledigheid).toBe(0);
    const volledig = analyseer(ziekenhuis());
    expect(volledig.volledigheid).toBe(100);
    expect(analyseer(ziekenhuis({ huurJaar: null })).volledigheid).toBeLessThan(100);
  });

  it("het rooster op het scherm heeft zeven dagen met drie dagdelen", () => {
    const rijen = roosterRijen(analyseer(ziekenhuis()).bezetting.raster);
    expect(rijen).toHaveLength(7);
    expect(rijen.every((r) => r.waarden.length === 3)).toBe(true);
    expect(rijen[0]?.waarden[0]).toBe(80);
    expect(rijen[5]?.waarden[0]).toBeNull(); // zaterdag: gesloten
  });
});

describe("de controle op wat er binnenkomt", () => {
  it("een geldig bedrijf wordt gelezen, rommel niet", () => {
    expect(leesBedrijf(ziekenhuis())?.ruimtes).toHaveLength(1);
    expect(leesBedrijf(null)).toBeNull();
    expect(leesBedrijf({ versie: 2 })).toBeNull();
    expect(leesBedrijf({ ...ziekenhuis(), open: [true] })).toBeNull(); // te kort raster
    expect(leesBedrijf({ ...ziekenhuis(), soort: "dierentuin" })).toBeNull();
  });

  it("weigert onmogelijke waarden: een bezetting boven 100%, een negatief bedrag, nul ruimtes in een regel", () => {
    const slecht = (r: Partial<Ruimte>) => leesBedrijf(ziekenhuis({ ruimtes: [{ ...SPREEKKAMER, ...r }] }));
    expect(slecht({ bezetting: bezetting({ 0: 101 }) })).toBeNull();
    expect(slecht({ bezetting: Array.from({ length: RASTER_LENGTE - 1 }, () => 10) })).toBeNull();
    expect(slecht({ aantal: 0 })).toBeNull();
    expect(slecht({ m2: -1 })).toBeNull();
    expect(leesBedrijf(ziekenhuis({ omzetJaar: -5 }))).toBeNull();
    expect(slecht({})).not.toBeNull();
  });

  it("begrenst het aantal regels", () => {
    const veel = Array.from({ length: 61 }, (_, i) => ({ ...SPREEKKAMER, id: `r${i}` }));
    expect(bedrijfSchema.safeParse(ziekenhuis({ ruimtes: veel })).success).toBe(false);
  });
});
