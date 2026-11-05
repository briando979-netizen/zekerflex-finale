import { describe, expect, it } from "vitest";
import { BRONNEN, BRON_IDS, LEEG_VANAF, leesBekendmakingen, leesMinimumloon, leesPompprijzen, metingBekendmakingen, metingMinimumloon, metingPompprijzen, metingSchermen } from "@/lib/bronnen/catalogus";
import { aanDeBeurt } from "@/lib/bronnen/tick";

// Intl zet een vaste spatie tussen € en het bedrag; voor de vergelijking maken we er een gewone van
const plat = (s: string) => s.replace(/[  ]/g, " ");

// Echte antwoorden van de bronnen (4/5 nov 2026), ingekort.

const CBS = {
  value: [
    { Perioden: "20261020", BenzineEuro95_1: 2.367, Diesel_2: 2.451, Lpg_3: 0.987 },
    { Perioden: "20261024", BenzineEuro95_1: 2.31, Diesel_2: 2.46, Lpg_3: 0.999 },
    { Perioden: "20261027", BenzineEuro95_1: 2.3, Diesel_2: 2.44, Lpg_3: 0.99 },
    { Perioden: "20261103", BenzineEuro95_1: 2.289, Diesel_2: 2.43, Lpg_3: 0.985 },
    { Perioden: "onzin", BenzineEuro95_1: 9 },
  ],
};

const MINLOON = `<h2>Bedragen per 1 juli 2026</h2><table><tr><td>21 jaar en ouder</td><td>€&nbsp;14,99</td></tr><tr><td>20 jaar</td><td>€ 11,99</td></tr><tr><td>18 jaar</td><td>€ 7,50&lt;</td></tr><tr><td>15 jaar</td><td>€ 4,50</td></tr></table>
<h2>Bedragen per 1 januari 2026</h2><table><tr><td>21 jaar en ouder</td><td>€ 14,71</td></tr><tr><td>18 jaar</td><td>€ 7,36</td></tr></table><h2>Bruto in plaats van netto</h2>`;

const SRU = `<sru:searchRetrieveResponse><sru:numberOfRecords>2</sru:numberOfRecords><sru:records>
<sru:record><sru:recordData><dcterms:title>Besluit van de Minister van Sociale Zaken en Werkgelegenheid van 28 september 2026 tot algemeenverbindendverklaring van bepalingen van de collectieve arbeidsovereenkomst Grafimedia</dcterms:title><dcterms:modified>2026-10-01</dcterms:modified><dcterms:available>2026-10-01</dcterms:available><gzd:preferredUrl>https://zoek.officielebekendmakingen.nl/stcrt-2026-1.html</gzd:preferredUrl></sru:recordData></sru:record>
<sru:record><sru:recordData><dcterms:title>Verzoek tot algemeenverbindendverklaring van cao-bepalingen</dcterms:title><dcterms:modified>2026-10-30</dcterms:modified></sru:recordData></sru:record>
</sru:records></sru:searchRetrieveResponse>`;

describe("bronnen: pompprijzen (CBS)", () => {
  it("leest de reeks op datum en laat onzin weg", () => {
    const r = leesPompprijzen(CBS);
    expect(r.map((p) => p.datum)).toEqual(["2026-10-20", "2026-10-24", "2026-10-27", "2026-11-03"]);
    expect(r[3]).toEqual({ datum: "2026-11-03", benzine: 2.289, diesel: 2.43, lpg: 0.985 });
    expect(leesPompprijzen({})).toEqual([]);
  });
  it("de meting noemt de laatste dag en het verschil met een week eerder", () => {
    const m = metingPompprijzen(leesPompprijzen(CBS));
    expect(m.ok).toBe(true);
    expect(m.waarden).toMatchObject({ datum: "2026-11-03", benzine: 2.289 });
    expect(plat(m.tekst)).toContain("Euro95 € 2,289");
    expect(m.tekst).toContain("3 nov");
    expect(metingPompprijzen([]).ok).toBe(false);
  });
});

describe("bronnen: minimumuurloon (Rijksoverheid)", () => {
  it("leest de tabellen per ingangsdatum, ook met &nbsp; en een losse <", () => {
    const t = leesMinimumloon(MINLOON);
    expect(t.map((x) => x.geldigVanaf)).toEqual(["2026-01-01", "2026-07-01"]);
    expect(t[1]?.perUur).toEqual({ 21: 14.99, 20: 11.99, 18: 7.5, 15: 4.5 });
  });
  it("kiest de tabel die vandaag geldt en noemt de volgende", () => {
    const t = leesMinimumloon(MINLOON);
    const in_mei = metingMinimumloon(t, "2026-05-10");
    expect(in_mei.waarden).toMatchObject({ geldigVanaf: "2026-01-01", uurloon21: 14.71, volgendVanaf: "2026-07-01", volgendUurloon21: 14.99 });
    expect(in_mei.regels.at(-1)?.toon).toBe("let-op");
    const in_nov = metingMinimumloon(t, "2026-11-05");
    expect(in_nov.waarden).toMatchObject({ geldigVanaf: "2026-07-01", uurloon21: 14.99, volgendVanaf: null });
    expect(plat(in_nov.tekst)).toContain("€ 14,99");
    expect(metingMinimumloon([], "2026-11-05").ok).toBe(false);
  });
});

describe("bronnen: cao-bekendmakingen (SRU)", () => {
  it("leest titel, datum en link, nieuwste eerst", () => {
    const l = leesBekendmakingen(SRU);
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ datum: "2026-10-30", url: "" });
    expect(l[1]?.url).toBe("https://zoek.officielebekendmakingen.nl/stcrt-2026-1.html");
  });
  it("telt de laatste twee weken en kort de titels in", () => {
    const m = metingBekendmakingen(leesBekendmakingen(SRU), "2026-11-05");
    expect(m.waarden).toMatchObject({ laatsteTweeWeken: 1, besluiten: 0, verzoeken: 1 });
    expect(m.regels[0]?.tekst).toContain("30 okt");
    const breed = metingBekendmakingen(leesBekendmakingen(SRU), "2026-10-05");
    expect(breed.waarden.besluiten).toBe(1);
    expect(breed.regels.find((r) => r.url)?.tekst).toContain("Avv cao Grafimedia");
  });
});

describe("bronnen: schermcontrole", () => {
  it("een leeg scherm, een foutstatus of een mislukking is niet in orde", () => {
    const goed = { pad: "/", status: 200, dominant: 0.6, titel: "ZekerFlex", ms: 900, fout: "" };
    expect(metingSchermen([goed]).ok).toBe(true);
    expect(metingSchermen([goed, { ...goed, pad: "/login", dominant: LEEG_VANAF }]).tekst).toContain("/login");
    expect(metingSchermen([goed, { ...goed, pad: "/shop", status: 500 }]).ok).toBe(false);
    expect(metingSchermen([{ ...goed, fout: "timeout" }]).regels[0]?.toon).toBe("fout");
  });
});

describe("bronnen: planner", () => {
  const meting = (op: string, ok = true) => ({ op, ok, waarden: {}, tekst: "", regels: [], fout: "", duurMs: 1 });
  const NU = Date.parse("2026-11-05T06:00:00Z");
  it("elke bron heeft een ritme en is aan de beurt zonder meting, na zijn ritme, of een uur na een mislukking", () => {
    for (const id of BRON_IDS) expect(BRONNEN[id].elkeUur).toBeGreaterThan(0);
    expect(aanDeBeurt("brandstof", null, NU)).toBe(true);
    expect(aanDeBeurt("brandstof", meting("2026-11-04T07:00:00Z"), NU)).toBe(false);
    expect(aanDeBeurt("brandstof", meting("2026-11-04T05:30:00Z"), NU)).toBe(true);
    expect(aanDeBeurt("minimumloon", meting("2026-11-01T06:00:00Z"), NU)).toBe(false);
    expect(aanDeBeurt("minimumloon", meting("2026-11-04T06:30:00Z", false), NU)).toBe(true);
  });
});
