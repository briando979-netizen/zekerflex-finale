import { describe, expect, it } from "vitest";
import {
  beginInstellingen,
  controleerInstellingen,
  controleerKlant,
  dagVanId,
  isVrij,
  klantSleutel,
  klantenUit,
  laatsteDag,
  schoneEmail,
  schoneTelefoon,
  slugUit,
  tijdNaarMin,
  vrijeTijden,
  weekdagVan,
  type Afspraak,
  type Instellingen,
} from "@/lib/afspraken/model";

// Alle tijden hebben een zone (Z): de server draait in UTC en tests met kale tijden worden tijdbommen (AGENTS.md).
let teller = 0;
const nieuwId = () => `id${String(++teller).padStart(4, "0")}`;
const basis = (over: Partial<Instellingen> = {}): Instellingen => ({ ...beginInstellingen("Kapper Jan", nieuwId), ...over });
const NU = new Date("2026-11-12T06:00:00Z"); // donderdag 12 november, 07:00 in Nederland (wintertijd)
const DAG = "2026-11-12";

const afspraak = (over: Partial<Afspraak> & Pick<Afspraak, "start" | "eind" | "medewerkerId">): Afspraak => ({
  id: "2026-11-12~abcdef12",
  dienstId: "d",
  dienstNaam: "Knippen",
  duurMin: 30,
  prijsCent: null,
  medewerkerNaam: "Jan",
  klant: { naam: "Piet", telefoon: "0612345678", email: "" },
  opmerking: "",
  status: "bevestigd",
  bron: "online",
  gemaaktOp: "2026-11-10T10:00:00Z",
  ...over,
});

describe("tijden en slugs", () => {
  it("tijdNaarMin leest klokken en weigert onzin", () => {
    expect(tijdNaarMin("09:30")).toBe(570);
    expect(tijdNaarMin("9:05")).toBe(545);
    expect(tijdNaarMin("24:00")).toBe(1440);
    for (const x of ["24:30", "25:00", "09:60", "9", "abc", "", null, 900]) expect(tijdNaarMin(x), String(x)).toBeNull();
  });

  it("slugUit maakt een nette naam uit een bedrijfsnaam, en niets uit te weinig", () => {
    expect(slugUit("Kapper Jan & Zn.")).toBe("kapper-jan-zn");
    expect(slugUit("Café Zoë")).toBe("cafe-zoe");
    expect(slugUit("  --A-- ")).toBe("");
  });

  it("weekdagVan geeft 0 voor zondag en weigert een datum die niet bestaat", () => {
    expect(weekdagVan("2026-11-12")).toBe(4); // donderdag
    expect(weekdagVan("2026-11-15")).toBe(0); // zondag
    expect(weekdagVan("2026-02-30")).toBeNull();
    expect(weekdagVan("12-11-2026")).toBeNull();
  });

  it("het id van een afspraak draagt zijn dag", () => {
    expect(dagVanId("2026-11-12~abcdef12")).toBe("2026-11-12");
    expect(dagVanId("../etc/passwd")).toBeNull();
    expect(dagVanId("2026-11-12~")).toBeNull();
  });
});

describe("controleerInstellingen", () => {
  const goed = () => ({ ...beginInstellingen("Kapper Jan", nieuwId), actief: true });

  it("neemt een goede opzet over, maakt ids en zet de dagen in de juiste vorm", () => {
    const r = controleerInstellingen({ ...goed(), diensten: [{ naam: " Knippen  heren ", duurMin: 30, prijsCent: 2500 }], medewerkers: [{ naam: "Jan" }, { naam: "Els" }] }, nieuwId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.waarde.actief).toBe(true);
    expect(r.waarde.diensten[0]).toMatchObject({ naam: "Knippen heren", duurMin: 30, prijsCent: 2500 });
    expect(r.waarde.diensten[0]!.id).toMatch(/^[a-z0-9]{4,16}$/);
    expect(r.waarde.medewerkers).toHaveLength(2);
    expect(r.waarde.uren).toHaveLength(7);
    expect(r.waarde.uren[1]).toEqual([{ van: "09:00", tot: "17:00" }]);
  });

  it("houdt bestaande ids vast en vervangt dubbele", () => {
    const r = controleerInstellingen({ ...goed(), diensten: [{ id: "abcd1", naam: "A", duurMin: 30 }, { id: "abcd1", naam: "B dienst", duurMin: 30 }].map((d) => ({ ...d, naam: d.naam + " dienst" })) }, nieuwId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.waarde.diensten[0]!.id).toBe("abcd1");
    expect(r.waarde.diensten[1]!.id).not.toBe("abcd1");
  });

  it("geeft Nederlandse fouten bij ontbrekende of foute velden", () => {
    const fout = (o: object) => {
      const r = controleerInstellingen({ ...goed(), ...o }, nieuwId);
      return r.ok ? null : r.fout;
    };
    expect(fout({ bedrijfsnaam: "" })).toMatch(/naam van je bedrijf/);
    expect(fout({ slug: "Hoofdletters!" })).toMatch(/kleine letters/);
    expect(fout({ slug: "ab" })).toMatch(/kleine letters/);
    expect(fout({ diensten: [] })).toMatch(/minstens één dienst/);
    expect(fout({ diensten: [{ naam: "Knippen", duurMin: 3 }] })).toMatch(/duur van "Knippen"/);
    expect(fout({ diensten: [{ naam: "Knippen", duurMin: 30, prijsCent: -5 }] })).toMatch(/prijs/);
    expect(fout({ diensten: [{ naam: "K", duurMin: 30 }] })).toMatch(/naam nodig/);
    expect(fout({ medewerkers: [] })).toMatch(/minstens één medewerker/);
    expect(fout({ stapMin: 7 })).toMatch(/hoe vaak per uur/);
    expect(fout({ voorlopMin: -1 })).toMatch(/voorlooptijd/);
    expect(fout({ maxDagenVooruit: 0 })).toMatch(/dagen vooruit/);
    expect(fout({ uren: [[], [], [], [], [], [], []] })).toMatch(/minstens één dag open/);
    expect(fout({ uren: [[], [{ van: "17:00", tot: "09:00" }], [], [], [], [], []] })).toMatch(/einde na het begin/);
    expect(fout({ uren: [[], [{ van: "09:00", tot: "12:00" }, { van: "11:00", tot: "13:00" }], [], [], [], [], []] })).toMatch(/overlappen/);
    expect(fout({ uren: [[], [{ van: "9 uur", tot: "12:00" }], [], [], [], [], []] })).toMatch(/Gebruik bijvoorbeeld 09:00/);
  });

  it("zet 'actief' alleen aan bij een echte true", () => {
    for (const actief of ["true", 1, "ja", null]) {
      const r = controleerInstellingen({ ...goed(), actief }, nieuwId);
      expect(r.ok && r.waarde.actief).toBe(false);
    }
  });
});

describe("vrijeTijden", () => {
  const i = basis();
  const dienst = i.diensten[0]!.id;
  const jan = i.medewerkers[0]!.id;

  it("een gewone donderdag: van 09:00 tot 16:30 om de half uur, in Nederlandse tijd", () => {
    const t = vrijeTijden(i, { dienstId: dienst, medewerkerId: jan, dag: DAG, afspraken: [], nu: NU });
    expect(t).toHaveLength(16);
    expect(t[0]!.start).toBe("2026-11-12T08:00:00.000Z"); // 09:00 CET
    expect(t.at(-1)!.start).toBe("2026-11-12T15:30:00.000Z"); // 16:30 CET: een afspraak van 30 minuten eindigt om 17:00
  });

  it("zomer- en wintertijd: 09:00 is in oktober 07:00Z en na het omschakelen 08:00Z", () => {
    const voor = vrijeTijden(i, { dienstId: dienst, medewerkerId: jan, dag: "2026-10-23", afspraken: [], nu: new Date("2026-10-20T06:00:00Z") });
    const na = vrijeTijden(i, { dienstId: dienst, medewerkerId: jan, dag: "2026-10-26", afspraken: [], nu: new Date("2026-10-20T06:00:00Z") });
    expect(voor[0]!.start).toBe("2026-10-23T07:00:00.000Z");
    expect(na[0]!.start).toBe("2026-10-26T08:00:00.000Z");
  });

  it("de voorlooptijd houdt de eerste uren vandaag dicht, maar een afspraak aan de balie mag wel eerder", () => {
    const nu = new Date("2026-11-12T09:30:00Z"); // 10:30 in Nederland, voorlooptijd 60 minuten
    const t = vrijeTijden(i, { dienstId: dienst, medewerkerId: jan, dag: DAG, afspraken: [], nu });
    expect(t[0]!.start).toBe("2026-11-12T10:30:00.000Z"); // 11:30
    expect(t).toHaveLength(11);
    const balie = vrijeTijden(i, { dienstId: dienst, medewerkerId: jan, dag: DAG, afspraken: [], nu, metVoorlooptijd: false });
    expect(balie[0]!.start).toBe("2026-11-12T09:30:00.000Z"); // 10:30: nu nog net mogelijk
  });

  it("een bestaande afspraak haalt zijn tijd weg, ook een gedeeltelijke overlap; geannuleerd maakt vrij", () => {
    const bezet = afspraak({ medewerkerId: jan, start: "2026-11-12T08:00:00.000Z", eind: "2026-11-12T08:30:00.000Z" });
    const t = vrijeTijden(i, { dienstId: dienst, medewerkerId: jan, dag: DAG, afspraken: [bezet], nu: NU });
    expect(t.some((s) => s.start === "2026-11-12T08:00:00.000Z")).toBe(false);
    expect(t).toHaveLength(15);
    const geannuleerd = vrijeTijden(i, { dienstId: dienst, medewerkerId: jan, dag: DAG, afspraken: [{ ...bezet, status: "geannuleerd" }], nu: NU });
    expect(geannuleerd).toHaveLength(16);
  });

  it("een langere dienst past niet tegen sluitingstijd en botst ook op het begin van een volgende afspraak", () => {
    const lang = basis({ diensten: [{ id: "lang1", naam: "Kleuren", duurMin: 90, prijsCent: null }], medewerkers: i.medewerkers });
    const volgende = afspraak({ medewerkerId: jan, start: "2026-11-12T10:00:00.000Z", eind: "2026-11-12T10:30:00.000Z" }); // 11:00-11:30
    const t = vrijeTijden(lang, { dienstId: "lang1", medewerkerId: jan, dag: DAG, afspraken: [volgende], nu: NU }).map((s) => s.start);
    expect(t.at(-1)).toBe("2026-11-12T14:30:00.000Z"); // 15:30-17:00 is de laatste die past
    expect(t).not.toContain("2026-11-12T09:30:00.000Z"); // 10:30-12:00 botst met 11:00-11:30
    expect(t).toContain("2026-11-12T08:00:00.000Z"); // 09:00-10:30 loopt tot 10:30 en dat is nog vrij
  });

  it("zonder voorkeur telt elke tijd één keer en gaat naar de eerste medewerker die vrij is", () => {
    const twee = basis({ medewerkers: [{ id: "jan01", naam: "Jan" }, { id: "els01", naam: "Els" }] });
    const bezetJan = afspraak({ medewerkerId: "jan01", start: "2026-11-12T08:00:00.000Z", eind: "2026-11-12T08:30:00.000Z" });
    const t = vrijeTijden(twee, { dienstId: twee.diensten[0]!.id, medewerkerId: null, dag: DAG, afspraken: [bezetJan], nu: NU });
    expect(t).toHaveLength(16);
    expect(new Set(t.map((s) => s.start)).size).toBe(16);
    expect(t.find((s) => s.start === "2026-11-12T08:00:00.000Z")!.medewerkerId).toBe("els01"); // Jan zit vast
    expect(t.find((s) => s.start === "2026-11-12T08:30:00.000Z")!.medewerkerId).toBe("jan01");
  });

  it("geeft niets voor gesloten dagen, het verleden, te ver vooruit, een onbekende dienst of medewerker of een onzindatum", () => {
    const geef = (o: Partial<Parameters<typeof vrijeTijden>[1]>) => vrijeTijden(i, { dienstId: dienst, medewerkerId: jan, dag: DAG, afspraken: [], nu: NU, ...o });
    expect(geef({ dag: "2026-11-15" })).toEqual([]); // zondag
    expect(geef({ dag: "2026-11-11" })).toEqual([]); // gisteren
    expect(geef({ dag: laatsteDag(NU, 60) }).length === 0 || weekdagVan(laatsteDag(NU, 60)) !== null).toBe(true);
    expect(geef({ dag: "2027-03-02" })).toEqual([]); // ruim voorbij 60 dagen
    expect(geef({ dienstId: "bestaatniet" })).toEqual([]);
    expect(geef({ medewerkerId: "bestaatniet" })).toEqual([]);
    expect(geef({ dag: "2026-02-30" })).toEqual([]);
    expect(geef({ dag: "morgen" })).toEqual([]);
  });

  it("laatsteDag telt in Nederlandse dagen, ook vlak na middernacht", () => {
    expect(laatsteDag(new Date("2026-11-12T06:00:00Z"), 60)).toBe("2027-01-11");
    // 23:30 UTC is al 00:30 de volgende dag in Nederland
    expect(laatsteDag(new Date("2026-11-12T23:30:00Z"), 1)).toBe("2026-11-14");
  });

  it("isVrij gebruikt dezelfde regels: een bezette of een tijd buiten de openingstijden is niet vrij", () => {
    const start = new Date("2026-11-12T08:00:00.000Z");
    expect(isVrij(i, { dienstId: dienst, medewerkerId: jan, start, afspraken: [], nu: NU })).toBe(true);
    const bezet = afspraak({ medewerkerId: jan, start: start.toISOString(), eind: "2026-11-12T08:30:00.000Z" });
    expect(isVrij(i, { dienstId: dienst, medewerkerId: jan, start, afspraken: [bezet], nu: NU })).toBe(false);
    expect(isVrij(i, { dienstId: dienst, medewerkerId: jan, start: new Date("2026-11-12T20:00:00.000Z"), afspraken: [], nu: NU })).toBe(false);
    // een tijd die niet op het raster van het begin valt, bestaat niet
    expect(isVrij(i, { dienstId: dienst, medewerkerId: jan, start: new Date("2026-11-12T08:07:00.000Z"), afspraken: [], nu: NU })).toBe(false);
  });
});

describe("de klant en de klantenkaart", () => {
  it("controleert naam en minstens één manier om te bereiken, met nette fouten", () => {
    expect(controleerKlant({ naam: "Piet Jansen", telefoon: "06 1234 5678", email: "" })).toEqual({ ok: true, waarde: { naam: "Piet Jansen", telefoon: "06 1234 5678", email: "" } });
    expect(controleerKlant({ naam: "P", telefoon: "0612345678", email: "" })).toMatchObject({ ok: false });
    expect(controleerKlant({ naam: "Piet", telefoon: "", email: "" })).toMatchObject({ ok: false, fout: expect.stringMatching(/telefoonnummer of een e-mailadres/) });
    expect(controleerKlant({ naam: "Piet", telefoon: "12", email: "" })).toMatchObject({ ok: false, fout: expect.stringMatching(/telefoonnummer klopt niet/) });
    expect(controleerKlant({ naam: "Piet", telefoon: "", email: "geen-adres" })).toMatchObject({ ok: false, fout: expect.stringMatching(/e-mailadres klopt niet/) });
    expect(schoneEmail("  Piet@Voorbeeld.NL ")).toBe("piet@voorbeeld.nl");
    expect(schoneTelefoon("bel mij")).toBe("");
  });

  it("de klantsleutel is het e-mailadres, anders het nummer; een buitenlandse notatie telt als hetzelfde nummer", () => {
    expect(klantSleutel({ email: "a@b.nl", telefoon: "0612345678" })).toBe("e-a@b.nl");
    expect(klantSleutel({ email: "", telefoon: "06 1234 5678" })).toBe("t-0612345678");
    expect(klantSleutel({ email: "", telefoon: "+31 6 1234 5678" })).toBe("t-0612345678");
    expect(klantSleutel({ email: "", telefoon: "" })).toBe("");
  });

  it("klantenUit voegt afspraken van dezelfde persoon samen, telt per status en neemt de nieuwste gegevens", () => {
    const a = (id: string, start: string, status: Afspraak["status"], naam = "Piet") =>
      afspraak({ id: `${start.slice(0, 10)}~${id}`, medewerkerId: "m", start, eind: start, status, klant: { naam, telefoon: "", email: "piet@voorbeeld.nl" } });
    const lijst = [
      a("aaaaaa01", "2026-10-01T08:00:00Z", "geweest", "Piet J."),
      a("aaaaaa02", "2026-10-15T08:00:00Z", "niet-gekomen"),
      a("aaaaaa03", "2026-10-20T08:00:00Z", "geannuleerd"),
      a("aaaaaa04", "2026-11-20T08:00:00Z", "bevestigd"),
      a("aaaaaa05", "2026-11-25T08:00:00Z", "bevestigd"),
    ];
    const [k] = klantenUit(lijst, new Map([["e-piet@voorbeeld.nl", "Wil graag een korte baard."]]), NU);
    expect(k).toMatchObject({ naam: "Piet", aantal: 4, geweest: 1, nietGekomen: 1, notitie: "Wil graag een korte baard." });
    expect(k!.laatste).toBe("2026-10-15T08:00:00Z");
    expect(k!.volgende).toBe("2026-11-20T08:00:00Z");
  });

  it("een klant met alleen een notitie blijft op de lijst; een leeg item niet", () => {
    const k = klantenUit([], new Map([["t-0612345678", "Belt liever na 17:00."]]), NU);
    expect(k).toHaveLength(1);
    expect(k[0]!.notitie).toMatch(/17:00/);
    expect(klantenUit([], new Map(), NU)).toEqual([]);
  });
});
