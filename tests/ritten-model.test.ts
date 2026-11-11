import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OVERGANGEN,
  VERWIJDERD,
  apkBinnenDagen,
  controleerChauffeurs,
  controleerKoppelingen,
  controleerPeriode,
  dagNaam,
  dubbeleBoekingen,
  filterRitten,
  formatKenteken,
  groepeerPerDag,
  huidigeWeek,
  isKenteken,
  leesKlokTijd,
  magVerwijderen,
  normaliseerKenteken,
  plusDagen,
  ritMinuten,
  ritUren,
  totalenOver,
  valideerRit,
  valideerVoertuig,
  weekVan,
  wisChauffeurInRit,
  wisKlantgegevens,
  wisselStatus,
  type Rit,
  type Voertuig,
} from "@/lib/ritten/model";

const rit = (over: Partial<Rit> = {}): Rit => ({
  id: "2026-0001",
  nummer: "R-2026-0001",
  start: "2026-11-05T08:00:00.000Z",
  eind: "2026-11-05T10:30:00.000Z",
  van: "Rotterdam",
  naar: "Utrecht",
  tussenstops: [],
  klantNaam: "Jansen BV",
  lading: "Pallets",
  voertuigId: "aaaaaaaa",
  chauffeur: "Piet",
  werkelijkStart: null,
  werkelijkEind: null,
  km: null,
  opmerking: "",
  status: "gepland",
  klantGewist: false,
  gemaaktOp: "2026-11-01T08:00:00.000Z",
  bijgewerktOp: "2026-11-01T08:00:00.000Z",
  ...over,
});

const voertuig = (over: Partial<Voertuig> = {}): Voertuig => ({
  id: "aaaaaaaa",
  kenteken: "AB12CD",
  omschrijving: "Bestelbus Ford Transit",
  laadvermogenKg: 1000,
  apk: null,
  notitie: "",
  gearchiveerd: false,
  gemaaktOp: "2026-11-01T08:00:00.000Z",
  bijgewerktOp: "2026-11-01T08:00:00.000Z",
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T06:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("kenteken", () => {
  it("normaliseert met of zonder streepjes, spaties en kleine letters", () => {
    expect(normaliseerKenteken("ab-12-cd")).toBe("AB12CD");
    expect(normaliseerKenteken(" 12 . ab . 34 ")).toBe("12AB34");
    expect(normaliseerKenteken(5)).toBe("");
  });
  it("accepteert precies 6 tekens uit cijfers en letters", () => {
    expect(isKenteken("AB12CD")).toBe(true);
    expect(isKenteken("AB12C")).toBe(false);
    expect(isKenteken("AB12CDE")).toBe(false);
    expect(isKenteken("AB-2CD")).toBe(false);
  });
  it("zet de streepjes terug zoals op de plaat", () => {
    expect(formatKenteken("AB12CD")).toBe("AB-12-CD");
    expect(formatKenteken("12ABC3")).toBe("12-ABC-3");
    expect(formatKenteken("1ABC23")).toBe("1-ABC-23");
    expect(formatKenteken("ABC12D")).toBe("ABC-12-D");
    expect(formatKenteken("kapot")).toBe("KAPOT");
  });
});

describe("voertuig controleren", () => {
  const goed = { kenteken: "ab-12-cd", omschrijving: "  Bestelbus Ford Transit ", laadvermogenKg: "1.200", apk: "2026-12-01", notitie: "" };
  it("slaat het kenteken genormaliseerd op", () => {
    const r = valideerVoertuig({ ...goed, laadvermogenKg: 1200 });
    expect(r).toEqual({ ok: true, waarde: { kenteken: "AB12CD", omschrijving: "Bestelbus Ford Transit", laadvermogenKg: 1200, apk: "2026-12-01", notitie: "" } });
  });
  it("laadvermogen en APK zijn optioneel", () => {
    const r = valideerVoertuig({ kenteken: "AB12CD", omschrijving: "Auto", laadvermogenKg: "", apk: null });
    expect(r.ok && r.waarde.laadvermogenKg === null && r.waarde.apk === null).toBe(true);
  });
  it("weigert een onzin-kenteken, een lege omschrijving, een onmogelijke datum en een rare lading", () => {
    expect(valideerVoertuig({ ...goed, kenteken: "" })).toMatchObject({ ok: false });
    expect(valideerVoertuig({ ...goed, kenteken: "ABC" })).toMatchObject({ ok: false, fout: expect.stringContaining("geen kenteken") });
    expect(valideerVoertuig({ ...goed, omschrijving: "x" })).toMatchObject({ ok: false });
    expect(valideerVoertuig({ ...goed, laadvermogenKg: 0 })).toMatchObject({ ok: false });
    expect(valideerVoertuig({ ...goed, laadvermogenKg: 1.5 })).toMatchObject({ ok: false });
    expect(valideerVoertuig({ ...goed, apk: "2026-02-30" })).toMatchObject({ ok: false });
    expect(valideerVoertuig({ ...goed, apk: "morgen" })).toMatchObject({ ok: false });
    expect(valideerVoertuig(null)).toMatchObject({ ok: false });
  });
});

describe("APK binnen 30 dagen", () => {
  it("neemt wat binnen 30 dagen verloopt of al is verlopen, de eerste bovenaan", () => {
    const lijst = [
      voertuig({ id: "00000001", kenteken: "AA11BB", apk: "2026-12-12" }), // precies 30 dagen
      voertuig({ id: "00000002", kenteken: "AA22BB", apk: "2026-12-13" }), // 31 dagen: nog niet
      voertuig({ id: "00000003", kenteken: "AA33BB", apk: "2026-11-01" }), // verlopen
      voertuig({ id: "00000004", kenteken: "AA44BB", apk: "2026-11-12" }), // vandaag
      voertuig({ id: "00000005", kenteken: "AA55BB", apk: "2026-11-20", gearchiveerd: true }),
      voertuig({ id: "00000006", kenteken: "AA66BB", apk: null }),
    ];
    const r = apkBinnenDagen(lijst, new Date());
    expect(r.map((m) => [m.voertuig.id, m.dagen])).toEqual([["00000003", -11], ["00000004", 0], ["00000001", 30]]);
  });
  it("vandaag is de Nederlandse dag: na middernacht Nederlandse tijd is het al de volgende dag", () => {
    const lijst = [voertuig({ apk: "2026-11-12" })];
    expect(apkBinnenDagen(lijst, new Date("2026-11-11T22:30:00Z"))[0]?.dagen).toBe(1); // 23:30 op 11 nov
    expect(apkBinnenDagen(lijst, new Date("2026-11-11T23:30:00Z"))[0]?.dagen).toBe(0); // 00:30 op 12 nov
    expect(apkBinnenDagen(lijst, new Date("2026-11-12T23:30:00Z"))[0]?.dagen).toBe(-1); // 00:30 op 13 nov
  });
});

describe("tijden en duur", () => {
  it("leest een klokkentijd in Nederlandse tijd als UTC, en weigert onzin", () => {
    expect(leesKlokTijd("2026-11-05T09:00")?.toISOString()).toBe("2026-11-05T08:00:00.000Z");
    expect(leesKlokTijd("2026-07-05T09:00")?.toISOString()).toBe("2026-07-05T07:00:00.000Z");
    expect(leesKlokTijd("2026-11-31T09:00")).toBeNull();
    expect(leesKlokTijd("2026-11-05 09:00")).toBeNull();
    expect(leesKlokTijd("2026-11-05T25:00")).toBeNull();
    expect(leesKlokTijd("2026-03-29T02:30")).toBeNull(); // die tijd bestaat niet (zomertijd gaat in)
  });
  it("duur van een geplande rit in uren met twee decimalen", () => {
    expect(ritUren(rit())).toBe(2.5);
    expect(ritUren(rit({ eind: "2026-11-05T08:20:00.000Z" }))).toBe(0.33);
  });
  it("de werkelijke tijden gaan voor de geplande, maar alleen als allebei bekend en kloppend", () => {
    expect(ritUren(rit({ werkelijkStart: "2026-11-05T08:00:00.000Z", werkelijkEind: "2026-11-05T09:00:00.000Z" }))).toBe(1);
    expect(ritUren(rit({ werkelijkStart: "2026-11-05T08:00:00.000Z" }))).toBe(2.5);
    expect(ritUren(rit({ werkelijkStart: "2026-11-05T09:00:00.000Z", werkelijkEind: "2026-11-05T08:00:00.000Z" }))).toBe(2.5);
  });
  it("een rit over middernacht telt volledig en hoort bij de dag van het begin", () => {
    const r = rit({ start: "2026-11-05T22:00:00.000Z", eind: "2026-11-06T02:00:00.000Z" }); // 23:00 - 03:00 Nederlandse tijd
    expect(ritMinuten(r)).toBe(240);
    expect(groepeerPerDag([r], "2026-11-05", "2026-11-07").map((d) => d.ritten.length)).toEqual([1, 0, 0]);
  });
  it("de dag van een rit is de Nederlandse dag: 23:30 UTC is al de volgende dag", () => {
    const r = rit({ start: "2026-11-05T23:30:00.000Z", eind: "2026-11-06T01:00:00.000Z" });
    expect(groepeerPerDag([r], "2026-11-05", "2026-11-06").map((d) => d.ritten.length)).toEqual([0, 1]);
  });
  it("zomer- en wintertijd: de nacht van 29 maart is een uur korter, die van 25 oktober een uur langer", () => {
    const voor = valideerRit({ start: "2026-03-29T01:00", eind: "2026-03-29T04:00", van: "Aa", naar: "Bb" });
    const na = valideerRit({ start: "2026-10-25T01:00", eind: "2026-10-25T04:00", van: "Aa", naar: "Bb" });
    expect(voor.ok && ritUren({ ...voor.waarde, werkelijkStart: null, werkelijkEind: null })).toBe(2);
    expect(na.ok && ritUren({ ...na.waarde, werkelijkStart: null, werkelijkEind: null })).toBe(4);
  });
});

describe("rit controleren", () => {
  const goed = { start: "2026-11-05T09:00", eind: "2026-11-05T11:00", van: "Rotterdam", naar: "Utrecht" };
  it("accepteert een goede rit en maakt er UTC van", () => {
    const r = valideerRit({ ...goed, tussenstops: ["  Gouda ", ""], klantNaam: " Jansen ", voertuigId: "", chauffeur: "Piet", km: "12,5" });
    expect(r).toMatchObject({ ok: true, waarde: { start: "2026-11-05T08:00:00.000Z", eind: "2026-11-05T10:00:00.000Z", tussenstops: ["Gouda"], klantNaam: "Jansen", voertuigId: null, km: 12.5 } });
  });
  it("een rit over middernacht mag", () => {
    expect(valideerRit({ ...goed, start: "2026-11-05T22:00", eind: "2026-11-06T04:00" }).ok).toBe(true);
  });
  it("einde voor of gelijk aan begin wordt geweigerd", () => {
    expect(valideerRit({ ...goed, eind: "2026-11-05T08:00" })).toMatchObject({ ok: false, fout: expect.stringContaining("na de geplande start") });
    expect(valideerRit({ ...goed, eind: "2026-11-05T09:00" })).toMatchObject({ ok: false });
  });
  it("weigert ontbrekende of onzin-tijden, een te lange rit en te veel tussenstops", () => {
    expect(valideerRit({ ...goed, start: "" })).toMatchObject({ ok: false });
    expect(valideerRit({ ...goed, eind: "gisteren" })).toMatchObject({ ok: false });
    expect(valideerRit({ ...goed, eind: "2026-11-20T09:00" })).toMatchObject({ ok: false });
    expect(valideerRit({ ...goed, tussenstops: Array.from({ length: 11 }, (_, i) => `Stop ${i}`) })).toMatchObject({ ok: false, fout: expect.stringContaining("10 tussenstops") });
    expect(valideerRit({ ...goed, tussenstops: Array.from({ length: 10 }, (_, i) => `Stop ${i}`) }).ok).toBe(true);
  });
  it("van en naar zijn verplicht, behalve na het wissen van de klantgegevens", () => {
    expect(valideerRit({ ...goed, van: "" })).toMatchObject({ ok: false });
    expect(valideerRit({ ...goed, naar: " " })).toMatchObject({ ok: false });
    expect(valideerRit({ ...goed, van: "", naar: "" }, { klantGewist: true }).ok).toBe(true);
  });
  it("controleert werkelijke tijden en kilometers", () => {
    expect(valideerRit({ ...goed, werkelijkEind: "2026-11-05T11:00" })).toMatchObject({ ok: false, fout: expect.stringContaining("werkelijke start") });
    expect(valideerRit({ ...goed, werkelijkStart: "2026-11-05T11:00", werkelijkEind: "2026-11-05T10:00" })).toMatchObject({ ok: false });
    expect(valideerRit({ ...goed, km: -1 })).toMatchObject({ ok: false });
    expect(valideerRit({ ...goed, km: "veel" })).toMatchObject({ ok: false });
    expect(valideerRit({ ...goed, km: 12.55 })).toMatchObject({ ok: false });
    expect(valideerRit({ ...goed, km: 0 }).ok).toBe(true);
  });
  it("een ongeldig voertuig-id wordt geweigerd", () => {
    expect(valideerRit({ ...goed, voertuigId: "constructor" })).toMatchObject({ ok: false });
    expect(valideerRit({ ...goed, voertuigId: "../etc" })).toMatchObject({ ok: false });
  });
});

describe("voertuig en chauffeur bij een rit", () => {
  const v = [voertuig({ id: "aaaaaaaa" }), voertuig({ id: "bbbbbbbb", kenteken: "ZZ99YY", gearchiveerd: true })];
  it("een onbekend of gearchiveerd voertuig kan niet, een bestaand wel", () => {
    expect(controleerKoppelingen({ voertuigId: "aaaaaaaa", chauffeur: "" }, v, [], null)).toBeNull();
    expect(controleerKoppelingen({ voertuigId: "cccccccc", chauffeur: "" }, v, [], null)).toMatch(/bestaat niet/);
    expect(controleerKoppelingen({ voertuigId: "bbbbbbbb", chauffeur: "" }, v, [], null)).toMatch(/gearchiveerd/);
  });
  it("een gearchiveerd voertuig dat de rit al had, blijft toegestaan", () => {
    expect(controleerKoppelingen({ voertuigId: "bbbbbbbb", chauffeur: "" }, v, [], { voertuigId: "bbbbbbbb", chauffeur: "" })).toBeNull();
  });
  it("een chauffeur moet in de lijst staan (hoofdletterongevoelig), tenzij de rit hem al had", () => {
    expect(controleerKoppelingen({ voertuigId: null, chauffeur: "piet" }, v, ["Piet"], null)).toBeNull();
    expect(controleerKoppelingen({ voertuigId: null, chauffeur: "Kees" }, v, ["Piet"], null)).toMatch(/niet in je lijst/);
    expect(controleerKoppelingen({ voertuigId: null, chauffeur: "Kees" }, v, ["Piet"], { voertuigId: null, chauffeur: "Kees" })).toBeNull();
    expect(controleerKoppelingen({ voertuigId: null, chauffeur: "" }, v, [], null)).toBeNull();
  });
});

describe("chauffeurslijst", () => {
  it("ontdubbelt, schoont op en weigert te veel of gereserveerde namen", () => {
    expect(controleerChauffeurs({ namen: [" Piet ", "piet", "", "Kees"] })).toEqual({ ok: true, waarde: ["Piet", "Kees"] });
    expect(controleerChauffeurs({ namen: Array.from({ length: 50 }, (_, i) => `Naam ${i}`) }).ok).toBe(true);
    expect(controleerChauffeurs({ namen: Array.from({ length: 51 }, (_, i) => `Naam ${i}`) })).toMatchObject({ ok: false });
    expect(controleerChauffeurs({ namen: [VERWIJDERD.toLowerCase()] })).toMatchObject({ ok: false });
    expect(controleerChauffeurs({ namen: "Piet" })).toMatchObject({ ok: false });
    expect(controleerChauffeurs(null)).toMatchObject({ ok: false });
  });
  it("een naam wissen in een rit vervangt hem door Verwijderd, andere ritten blijven", () => {
    const nu = new Date();
    expect(wisChauffeurInRit(rit({ chauffeur: "Piet" }), " piet ", nu).chauffeur).toBe(VERWIJDERD);
    const andere = rit({ chauffeur: "Kees" });
    expect(wisChauffeurInRit(andere, "Piet", nu)).toBe(andere);
  });
  it("klantgegevens wissen haalt naam en adressen weg en laat de rest staan", () => {
    const w = wisKlantgegevens(rit({ tussenstops: ["Gouda"], km: 40 }), new Date());
    expect(w).toMatchObject({ klantNaam: "", van: "", naar: "", tussenstops: [], klantGewist: true, km: 40, lading: "Pallets", chauffeur: "Piet" });
  });
});

describe("statusovergangen", () => {
  const nu = new Date("2026-11-05T09:00:00Z");
  it("gepland naar onderweg legt de werkelijke start vast", () => {
    const r = wisselStatus(rit(), "onderweg", nu);
    expect(r).toMatchObject({ ok: true, waarde: { status: "onderweg", werkelijkStart: nu.toISOString(), werkelijkEind: null } });
  });
  it("onderweg naar afgeleverd legt het einde vast en behoudt een ingevulde start", () => {
    const r = wisselStatus(rit({ status: "onderweg", werkelijkStart: "2026-11-05T08:10:00.000Z" }), "afgeleverd", nu);
    expect(r).toMatchObject({ ok: true, waarde: { status: "afgeleverd", werkelijkStart: "2026-11-05T08:10:00.000Z", werkelijkEind: nu.toISOString() } });
  });
  it("legt geen einde vast dat voor de werkelijke start ligt", () => {
    const r = wisselStatus(rit({ status: "onderweg", werkelijkStart: "2026-11-05T10:00:00.000Z" }), "afgeleverd", nu);
    expect(r).toMatchObject({ ok: true, waarde: { werkelijkEind: null } });
  });
  it("terug naar gepland wist de werkelijke tijden", () => {
    const r = wisselStatus(rit({ status: "onderweg", werkelijkStart: "2026-11-05T08:10:00.000Z" }), "gepland", nu);
    expect(r).toMatchObject({ ok: true, waarde: { status: "gepland", werkelijkStart: null, werkelijkEind: null } });
  });
  it("niet-toegestane overgangen worden geweigerd", () => {
    expect(wisselStatus(rit(), "afgeleverd", nu)).toMatchObject({ ok: false });
    expect(wisselStatus(rit({ status: "afgeleverd" }), "geannuleerd", nu)).toMatchObject({ ok: false });
    expect(wisselStatus(rit({ status: "geannuleerd" }), "onderweg", nu)).toMatchObject({ ok: false });
  });
  it("dezelfde status opnieuw zetten verandert niets", () => {
    const r = rit();
    expect(wisselStatus(r, "gepland", nu)).toEqual({ ok: true, waarde: r });
  });
  it("de overgangentabel verwijst alleen naar bestaande statussen en geannuleerd kan terug", () => {
    for (const naar of Object.values(OVERGANGEN).flat()) expect(Object.hasOwn(OVERGANGEN, naar)).toBe(true);
    expect(OVERGANGEN.geannuleerd).toEqual(["gepland"]);
  });
  it("verwijderen mag alleen bij gepland of geannuleerd", () => {
    expect(magVerwijderen(rit())).toBe(true);
    expect(magVerwijderen(rit({ status: "geannuleerd" }))).toBe(true);
    expect(magVerwijderen(rit({ status: "onderweg" }))).toBe(false);
    expect(magVerwijderen(rit({ status: "afgeleverd" }))).toBe(false);
  });
});

describe("totalen per chauffeur en voertuig", () => {
  const lijst = [
    rit({ id: "2026-0001", chauffeur: "Piet", voertuigId: "aaaaaaaa", km: 100 }), // 2,5 uur, 5 nov
    rit({ id: "2026-0002", chauffeur: "Piet", voertuigId: "bbbbbbbb", km: 50.5, start: "2026-11-06T08:00:00.000Z", eind: "2026-11-06T09:00:00.000Z" }),
    rit({ id: "2026-0003", chauffeur: "Kees", voertuigId: "aaaaaaaa", start: "2026-11-07T08:00:00.000Z", eind: "2026-11-07T09:30:00.000Z" }),
    rit({ id: "2026-0004", chauffeur: "Kees", status: "geannuleerd", km: 999 }),
    rit({ id: "2026-0005", chauffeur: "Piet", start: "2026-12-01T08:00:00.000Z", eind: "2026-12-01T09:00:00.000Z" }), // buiten de periode
  ];
  it("telt ritten, uren en kilometers; geannuleerde en ritten buiten de periode niet", () => {
    const r = totalenOver(lijst, "2026-11-05", "2026-11-11");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.waarde.totaal).toEqual({ aantal: 3, uren: 5, km: 150.5 });
    expect(r.waarde.perChauffeur).toEqual([
      { sleutel: "Piet", aantal: 2, uren: 3.5, km: 150.5 },
      { sleutel: "Kees", aantal: 1, uren: 1.5, km: 0 },
    ]);
    expect(r.waarde.perVoertuig.find((x) => x.sleutel === "aaaaaaaa")).toEqual({ sleutel: "aaaaaaaa", aantal: 2, uren: 4, km: 100 });
  });
  it("een rit zonder chauffeur of voertuig komt onder een lege sleutel", () => {
    const r = totalenOver([rit({ chauffeur: "", voertuigId: null })], "2026-11-05", "2026-11-05");
    expect(r.ok && r.waarde.perChauffeur[0]?.sleutel).toBe("");
    expect(r.ok && r.waarde.perVoertuig[0]?.sleutel).toBe("");
  });
  it("een periode is hooguit 31 dagen en niet omgekeerd", () => {
    expect(controleerPeriode("2026-11-01", "2026-12-01").ok).toBe(true); // 31 dagen
    expect(controleerPeriode("2026-11-01", "2026-12-02")).toMatchObject({ ok: false });
    expect(controleerPeriode("2026-11-05", "2026-11-04")).toMatchObject({ ok: false });
    expect(controleerPeriode("2026-02-30", "2026-03-01")).toMatchObject({ ok: false });
    expect(controleerPeriode(undefined, "2026-03-01")).toMatchObject({ ok: false });
    expect(totalenOver(lijst, "2026-01-01", "2026-12-31")).toMatchObject({ ok: false });
  });
});

describe("dubbele boekingen", () => {
  const v = [voertuig()];
  it("waarschuwt voor hetzelfde voertuig in overlappende tijd, met de namen erbij", () => {
    const a = rit({ id: "2026-0001", nummer: "R-2026-0001", chauffeur: "Piet" });
    const b = rit({ id: "2026-0002", nummer: "R-2026-0002", chauffeur: "Kees", start: "2026-11-05T09:00:00.000Z", eind: "2026-11-05T11:00:00.000Z" });
    const w = dubbeleBoekingen([a, b], v);
    expect(w["2026-0001"]).toEqual(["Voertuig AB-12-CD (Bestelbus Ford Transit) is in die tijd ook ingepland bij R-2026-0002."]);
    expect(w["2026-0002"]).toEqual(["Voertuig AB-12-CD (Bestelbus Ford Transit) is in die tijd ook ingepland bij R-2026-0001."]);
  });
  it("waarschuwt voor dezelfde chauffeur (hoofdletterongevoelig) met een ander voertuig", () => {
    const a = rit({ id: "2026-0001", voertuigId: "aaaaaaaa", chauffeur: "Piet" });
    const b = rit({ id: "2026-0002", nummer: "R-2026-0002", voertuigId: "bbbbbbbb", chauffeur: "piet", start: "2026-11-05T09:00:00.000Z", eind: "2026-11-05T11:00:00.000Z" });
    const w = dubbeleBoekingen([a, b], v);
    expect(w["2026-0001"]?.[0]).toMatch(/^Chauffeur Piet is in die tijd ook ingepland bij R-2026-0002/);
  });
  it("aansluitende ritten, geannuleerde ritten en een andere dag geven geen waarschuwing", () => {
    const a = rit({ id: "2026-0001" });
    const aansluitend = rit({ id: "2026-0002", start: "2026-11-05T10:30:00.000Z", eind: "2026-11-05T12:00:00.000Z" });
    const geannuleerd = rit({ id: "2026-0003", status: "geannuleerd" });
    const anderDag = rit({ id: "2026-0004", start: "2026-11-06T08:00:00.000Z", eind: "2026-11-06T10:00:00.000Z" });
    expect(dubbeleBoekingen([a, aansluitend, geannuleerd, anderDag], v)).toEqual({});
  });
  it("ziet ook een overlap over middernacht", () => {
    const a = rit({ id: "2026-0001", chauffeur: "", start: "2026-11-05T22:00:00.000Z", eind: "2026-11-06T04:00:00.000Z" });
    const b = rit({ id: "2026-0002", chauffeur: "", start: "2026-11-06T03:00:00.000Z", eind: "2026-11-06T05:00:00.000Z" });
    expect(Object.keys(dubbeleBoekingen([a, b], v)).sort()).toEqual(["2026-0001", "2026-0002"]);
  });
  it("een gewiste chauffeur (Verwijderd) wordt niet als dezelfde persoon gezien", () => {
    const a = rit({ id: "2026-0001", voertuigId: null, chauffeur: VERWIJDERD });
    const b = rit({ id: "2026-0002", voertuigId: null, chauffeur: VERWIJDERD });
    expect(dubbeleBoekingen([a, b], v)).toEqual({});
  });
});

describe("dagen en weken", () => {
  it("Nederlandse dagnamen", () => {
    expect(dagNaam("2026-11-02")).toBe("maandag 2 november");
    expect(dagNaam("2026-11-08")).toBe("zondag 8 november");
  });
  it("een week loopt van maandag tot zondag", () => {
    expect(weekVan("2026-11-12")).toEqual({ van: "2026-11-09", tot: "2026-11-15" });
    expect(weekVan("2026-11-09")).toEqual({ van: "2026-11-09", tot: "2026-11-15" });
    expect(weekVan("2026-11-15")).toEqual({ van: "2026-11-09", tot: "2026-11-15" });
    expect(huidigeWeek(new Date())).toEqual({ van: "2026-11-09", tot: "2026-11-15" });
  });
  it("dagen optellen over een zomertijdgrens blijft kloppen", () => {
    expect(plusDagen("2026-03-28", 1)).toBe("2026-03-29");
    expect(plusDagen("2026-03-29", 1)).toBe("2026-03-30");
    expect(plusDagen("2026-10-31", 1)).toBe("2026-11-01");
    expect(plusDagen("2026-12-31", 1)).toBe("2027-01-01");
    expect(plusDagen("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("groepeert per dag op begintijd, ook lege dagen", () => {
    const a = rit({ id: "2026-0001", start: "2026-11-05T12:00:00.000Z", eind: "2026-11-05T13:00:00.000Z" });
    const b = rit({ id: "2026-0002", start: "2026-11-05T07:00:00.000Z", eind: "2026-11-05T08:00:00.000Z" });
    const g = groepeerPerDag([a, b], "2026-11-04", "2026-11-06");
    expect(g.map((d) => d.dag)).toEqual(["2026-11-04", "2026-11-05", "2026-11-06"]);
    expect(g[1]?.ritten.map((r) => r.id)).toEqual(["2026-0002", "2026-0001"]);
  });
  it("filtert op status, voertuig en chauffeur", () => {
    const l = [rit({ id: "2026-0001" }), rit({ id: "2026-0002", status: "onderweg", voertuigId: "bbbbbbbb", chauffeur: "Kees" })];
    expect(filterRitten(l, { status: "onderweg" }).map((r) => r.id)).toEqual(["2026-0002"]);
    expect(filterRitten(l, { voertuigId: "aaaaaaaa" }).map((r) => r.id)).toEqual(["2026-0001"]);
    expect(filterRitten(l, { chauffeur: "kees" }).map((r) => r.id)).toEqual(["2026-0002"]);
    expect(filterRitten(l, { chauffeur: "" })).toHaveLength(2);
  });
});
