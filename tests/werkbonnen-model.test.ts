import { describe, expect, it } from "vitest";
import {
  MAX_MATERIALEN,
  MAX_MEDEWERKERS,
  MAX_TEAM,
  MAX_UREN,
  OVERGANGEN,
  STATUSSEN,
  adresRegel,
  controleerInvoer,
  controleerTeam,
  filterBonnen,
  isStatus,
  leegeKlant,
  magVerwijderen,
  planningDuurMin,
  regelTotaalCent,
  totalen,
  wisKlantgegevens,
  wisselStatus,
  type Werkbon,
  type WerkbonStatus,
} from "@/lib/werkbonnen/model";

let teller = 0;
const id = () => `id${String(++teller).padStart(6, "0")}`;
const NU = new Date("2026-11-12T06:00:00Z");

const invoer = (over: Record<string, unknown> = {}) => ({ omschrijving: "Badkamer betegelen", ...over });
const goed = (over: Record<string, unknown> = {}) => {
  const r = controleerInvoer(invoer(over), id);
  if (!r.ok) throw new Error(r.fout);
  return r.waarde;
};
const fout = (over: Record<string, unknown>) => {
  const r = controleerInvoer(invoer(over), id);
  if (r.ok) throw new Error("had een fout moeten geven");
  return r.fout;
};

const bon = (over: Partial<Werkbon> = {}): Werkbon => ({
  ...goed(),
  id: "2026-0001",
  nummer: "WB-2026-0001",
  status: "nieuw",
  afgerondOp: null,
  gemaaktOp: NU.toISOString(),
  bijgewerktOp: NU.toISOString(),
  ...over,
});
const uren = (minuten: number) => ({ id: id(), medewerker: "Piet", datum: "2026-11-12", minuten, opmerking: "" });

describe("statusovergangen", () => {
  it("kent vijf statussen en bevraagt de tabel met hasOwn", () => {
    expect(STATUSSEN).toEqual(["nieuw", "ingepland", "bezig", "afgerond", "geannuleerd"]);
    expect(isStatus("bezig")).toBe(true);
    expect(isStatus("constructor")).toBe(false);
    expect(isStatus("__proto__")).toBe(false);
    expect(isStatus(5)).toBe(false);
  });

  it("elke toegestane overgang lukt, elke andere geeft een Nederlandse fout", () => {
    for (const van of STATUSSEN) {
      for (const naar of STATUSSEN) {
        if (van === naar) continue;
        const r = wisselStatus(bon({ status: van, uren: [uren(60)] }), naar, { nu: NU });
        if (OVERGANGEN[van].includes(naar)) expect(r.ok, `${van} → ${naar}`).toBe(true);
        else {
          expect(r.ok, `${van} → ${naar}`).toBe(false);
          if (!r.ok) expect(r.fout).toMatch(/kan niet naar/);
        }
      }
    }
  });

  it("afgerond kan terug naar bezig; geannuleerd alleen terug naar nieuw", () => {
    expect(OVERGANGEN.afgerond).toEqual(["bezig"]);
    expect(OVERGANGEN.geannuleerd).toEqual(["nieuw"]);
    const r = wisselStatus(bon({ status: "afgerond", afgerondOp: NU.toISOString() }), "bezig", { nu: NU });
    expect(r.ok && r.waarde.afgerondOp).toBe(null);
    const geen = wisselStatus(bon({ status: "afgerond" }), "nieuw", { nu: NU });
    expect(geen.ok).toBe(false);
  });

  it("dezelfde status is geen wijziging", () => {
    const b = bon({ status: "bezig" });
    const r = wisselStatus(b, "bezig", { nu: NU });
    expect(r.ok && r.waarde).toBe(b);
  });

  it("afronden bewaart het tijdstip", () => {
    const r = wisselStatus(bon({ status: "bezig", uren: [uren(90)] }), "afgerond", { nu: NU });
    expect(r.ok && r.waarde.afgerondOp).toBe(NU.toISOString());
  });

  it("afronden zonder uren en materiaal mag niet, tenzij de gebruiker het bevestigt", () => {
    const leeg = bon({ status: "bezig" });
    const r = wisselStatus(leeg, "afgerond", { nu: NU });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ZONDER_UREN");
    expect(wisselStatus(leeg, "afgerond", { nu: NU, zonderUren: false }).ok).toBe(false);
    expect(wisselStatus(leeg, "afgerond", { nu: NU, zonderUren: true }).ok).toBe(true);
  });

  it("alleen materiaal is genoeg om af te ronden", () => {
    const b = bon({ status: "bezig", materialen: [{ id: id(), omschrijving: "Tegels", aantal: 10, prijsCent: 500 }] });
    expect(wisselStatus(b, "afgerond", { nu: NU }).ok).toBe(true);
  });

  it("verwijderen mag alleen bij nieuw en geannuleerd", () => {
    const mag = (s: WerkbonStatus) => magVerwijderen({ status: s });
    expect(STATUSSEN.filter(mag)).toEqual(["nieuw", "geannuleerd"]);
  });
});

describe("totalen", () => {
  it("telt minuten om naar uren met 2 decimalen en materiaal in centen", () => {
    const t = totalen({
      uren: [uren(90), uren(45), uren(20)],
      materialen: [
        { id: id(), omschrijving: "Tegels", aantal: 2.5, prijsCent: 1999 },
        { id: id(), omschrijving: "Kit", aantal: 3, prijsCent: 450 },
      ],
    });
    expect(t.minuten).toBe(155);
    expect(t.uren).toBe(2.58);
    expect(t.materiaalCent).toBe(Math.round(2.5 * 1999) + 1350);
    expect(t.regelsZonderPrijs).toBe(0);
    expect(t.urenRegels).toBe(3);
    expect(t.materiaalRegels).toBe(2);
  });

  it("een regel zonder prijs telt niet mee en geeft een waarschuwing; een prijs van 0 is wel een prijs", () => {
    const t = totalen({
      uren: [],
      materialen: [
        { id: id(), omschrijving: "Schroeven", aantal: 100, prijsCent: null },
        { id: id(), omschrijving: "Gratis proefstuk", aantal: 1, prijsCent: 0 },
        { id: id(), omschrijving: "Plug", aantal: 4, prijsCent: 25 },
      ],
    });
    expect(t.regelsZonderPrijs).toBe(1);
    expect(t.materiaalCent).toBe(100);
    expect(regelTotaalCent({ id: "x", omschrijving: "a", aantal: 4, prijsCent: null })).toBeNull();
    expect(regelTotaalCent({ id: "x", omschrijving: "a", aantal: 4, prijsCent: 25 })).toBe(100);
  });

  it("een lege bon geeft nullen", () => {
    expect(totalen({ uren: [], materialen: [] })).toEqual({ minuten: 0, uren: 0, materiaalCent: 0, regelsZonderPrijs: 0, urenRegels: 0, materiaalRegels: 0 });
  });
});

describe("controle van de invoer", () => {
  it("een minimale werkbon is genoeg, de klant is optioneel", () => {
    const w = goed();
    expect(w.klant).toEqual(leegeKlant());
    expect(w.start).toBeNull();
    expect(w.eind).toBeNull();
    expect(w.uren).toEqual([]);
  });

  it("vraagt een omschrijving", () => {
    expect(fout({ omschrijving: " " })).toMatch(/omschrijving/);
    expect(controleerInvoer(null, id).ok).toBe(false);
  });

  it("schoont de klantgegevens op en controleert e-mail, telefoon en postcode", () => {
    const w = goed({ klant: { naam: "  Piet \n Jansen ", telefoon: "06 1234 5678", email: " PIET@Voorbeeld.NL ", straat: "Hoofdstraat", huisnummer: "12a", postcode: "1234 ab", plaats: "Utrecht" } });
    expect(w.klant).toMatchObject({ naam: "Piet Jansen", email: "piet@voorbeeld.nl", postcode: "1234 AB" });
    expect(adresRegel(w.klant)).toBe("Hoofdstraat 12a, 1234 AB Utrecht");
    expect(fout({ klant: { email: "geen-mail" } })).toMatch(/e-mail/);
    expect(fout({ klant: { telefoon: "bel mij maar" } })).toMatch(/telefoon/);
    expect(fout({ klant: { postcode: "!!" } })).toMatch(/postcode/);
  });

  it("adresRegel laat lege delen weg", () => {
    expect(adresRegel(leegeKlant())).toBe("");
    expect(adresRegel({ ...leegeKlant(), plaats: "Breda" })).toBe("Breda");
    expect(adresRegel({ ...leegeKlant(), straat: "Dijk", huisnummer: "3" })).toBe("Dijk 3");
  });

  it("planning is Nederlandse klokkentijd, opgeslagen als UTC", () => {
    const winter = goed({ start: "2026-11-12T08:00", eind: "2026-11-12T16:30" });
    expect(winter.start).toBe("2026-11-12T07:00:00.000Z");
    expect(winter.eind).toBe("2026-11-12T15:30:00.000Z");
    const zomer = goed({ start: "2026-07-01T08:00", eind: "2026-07-01T09:00" });
    expect(zomer.start).toBe("2026-07-01T06:00:00.000Z");
    expect(planningDuurMin(zomer.start, zomer.eind)).toBe(60);
  });

  it("de tijden rond de omschakeling kloppen: de nacht van 29 maart is 1 uur korter, die van 25 oktober 1 uur langer", () => {
    const voorjaar = goed({ start: "2026-03-29T01:00", eind: "2026-03-29T04:00" });
    expect(planningDuurMin(voorjaar.start, voorjaar.eind)).toBe(120); // 02:00 bestaat niet
    const najaar = goed({ start: "2026-10-25T01:00", eind: "2026-10-25T04:00" });
    expect(planningDuurMin(najaar.start, najaar.eind)).toBe(240); // 02:00 komt twee keer
    // over de dag heen: 28 maart 22:00 tot 29 maart 06:00 is 7 uur, niet 8
    const nacht = goed({ start: "2026-03-28T22:00", eind: "2026-03-29T06:00" });
    expect(planningDuurMin(nacht.start, nacht.eind)).toBe(420);
  });

  it("einde voor begin, einde zonder begin en onzin als tijd geven een fout", () => {
    expect(fout({ start: "2026-11-12T10:00", eind: "2026-11-12T09:00" })).toMatch(/einde ligt voor het begin/i);
    expect(fout({ start: "2026-11-12T10:00", eind: "2026-11-12T10:00" })).toMatch(/einde ligt voor het begin/i);
    expect(fout({ eind: "2026-11-12T09:00" })).toMatch(/begintijd/);
    expect(fout({ start: "morgenochtend" })).toMatch(/begintijd/);
    expect(fout({ start: "2026-11-12T08:00", eind: 5 })).toMatch(/eindtijd/);
    expect(fout({ start: "1850-01-01T08:00" })).toMatch(/begintijd/);
    expect(goed({ start: "", eind: null }).start).toBeNull();
  });

  it("medewerkers: dubbele namen vallen weg en er zijn er hooguit 20", () => {
    expect(goed({ medewerkers: ["Piet", " Piet ", "Klaas", "", 5] }).medewerkers).toEqual(["Piet", "Klaas"]);
    const twintig = Array.from({ length: MAX_MEDEWERKERS }, (_, n) => `Medewerker ${n}`);
    expect(goed({ medewerkers: twintig }).medewerkers).toHaveLength(20);
    expect(fout({ medewerkers: [...twintig, "Een te veel"] })).toMatch(/20 medewerkers/);
  });

  it("urenregels: medewerker, geldige datum en 1 tot 1440 minuten", () => {
    expect(goed({ uren: [{ medewerker: "Piet", datum: "2026-11-12", minuten: 90, opmerking: "Voegen" }] }).uren[0]).toMatchObject({ minuten: 90, opmerking: "Voegen" });
    expect(fout({ uren: [{ medewerker: "", datum: "2026-11-12", minuten: 60 }] })).toMatch(/Urenregel 1: kies een medewerker/);
    expect(fout({ uren: [{ medewerker: "P", datum: "2026-02-30", minuten: 60 }] })).toMatch(/datum/);
    expect(fout({ uren: [{ medewerker: "P", datum: "12-11-2026", minuten: 60 }] })).toMatch(/datum/);
    expect(fout({ uren: [{ medewerker: "P", datum: "2026-11-12", minuten: 0 }] })).toMatch(/minuten/);
    expect(fout({ uren: [{ medewerker: "P", datum: "2026-11-12", minuten: 1441 }] })).toMatch(/minuten/);
    expect(fout({ uren: [{ medewerker: "P", datum: "2026-11-12", minuten: 1.5 }] })).toMatch(/minuten/);
    expect(fout({ uren: [{ medewerker: "P", datum: "2026-11-12", minuten: "60" }] })).toMatch(/minuten/);
    expect(fout({ uren: [uren(60), { medewerker: "P", datum: "2026-11-12", minuten: null }] })).toMatch(/Urenregel 2/);
  });

  it("precies 200 urenregels mag, 201 niet", () => {
    const regels = (n: number) => Array.from({ length: n }, () => ({ medewerker: "Piet", datum: "2026-11-12", minuten: 15 }));
    const w = goed({ uren: regels(MAX_UREN) });
    expect(w.uren).toHaveLength(200);
    expect(new Set(w.uren.map((r) => r.id)).size).toBe(200);
    expect(fout({ uren: regels(MAX_UREN + 1) })).toMatch(/200 urenregels/);
  });

  it("materiaalregels: omschrijving, aantal en optionele prijs in centen; precies 200 mag, 201 niet", () => {
    const w = goed({ materialen: [{ omschrijving: "Tegels", aantal: 2.5, prijsCent: 1999 }, { omschrijving: "Kit", aantal: 1 }, { omschrijving: "Plug", aantal: 1, prijsCent: "" }] });
    expect(w.materialen.map((m) => m.prijsCent)).toEqual([1999, null, null]);
    expect(fout({ materialen: [{ omschrijving: "", aantal: 1 }] })).toMatch(/Materiaalregel 1: vul een omschrijving/);
    expect(fout({ materialen: [{ omschrijving: "a", aantal: 0 }] })).toMatch(/aantal/);
    expect(fout({ materialen: [{ omschrijving: "a", aantal: -2 }] })).toMatch(/aantal/);
    expect(fout({ materialen: [{ omschrijving: "a", aantal: 1.234 }] })).toMatch(/2 decimalen/);
    expect(fout({ materialen: [{ omschrijving: "a", aantal: 1, prijsCent: -1 }] })).toMatch(/prijs/);
    expect(fout({ materialen: [{ omschrijving: "a", aantal: 1, prijsCent: 1.5 }] })).toMatch(/prijs/);
    expect(fout({ materialen: [{ omschrijving: "a", aantal: 1, prijsCent: "ongeldig" }] })).toMatch(/prijs/);
    const regels = (n: number) => Array.from({ length: n }, () => ({ omschrijving: "Schroef", aantal: 1 }));
    expect(goed({ materialen: regels(MAX_MATERIALEN) }).materialen).toHaveLength(200);
    expect(fout({ materialen: regels(MAX_MATERIALEN + 1) })).toMatch(/200 materiaalregels/);
  });

  it("een bestaand regel-id blijft, een dubbel of ongeldig id wordt vervangen", () => {
    const w = goed({ uren: [{ id: "abcd1234", medewerker: "P", datum: "2026-11-12", minuten: 5 }, { id: "abcd1234", medewerker: "P", datum: "2026-11-12", minuten: 5 }, { id: "NIET GELDIG!", medewerker: "P", datum: "2026-11-12", minuten: 5 }] });
    expect(w.uren[0]!.id).toBe("abcd1234");
    expect(new Set(w.uren.map((r) => r.id)).size).toBe(3);
  });

  it("notities houden hun regels maar verliezen stuurtekens", () => {
    const w = goed({ interneNotitie: "regel 1\r\nregel 2\u0007", afrondNotitie: "  klaar  " });
    expect(w.interneNotitie).toBe("regel 1\nregel 2");
    expect(w.afrondNotitie).toBe("klaar");
  });
});

describe("medewerkerslijst", () => {
  it("schoont namen op en begrenst op 50", () => {
    const r = controleerTeam({ namen: [" Piet ", "Piet", "Klaas", ""] });
    expect(r.ok && r.waarde).toEqual(["Piet", "Klaas"]);
    expect(controleerTeam({ namen: Array.from({ length: MAX_TEAM }, (_, n) => `M${n}`) }).ok).toBe(true);
    expect(controleerTeam({ namen: Array.from({ length: MAX_TEAM + 1 }, (_, n) => `M${n}`) }).ok).toBe(false);
    expect(controleerTeam({}).ok).toBe(false);
    expect(controleerTeam(null).ok).toBe(false);
  });
});

describe("klantgegevens wissen", () => {
  it("leegt naam, telefoon, e-mail en adres; de rest van de bon blijft", () => {
    const b = bon({ klant: { naam: "Piet", telefoon: "0612345678", email: "p@v.nl", straat: "Dijk", huisnummer: "1", postcode: "1234 AB", plaats: "Breda" }, uren: [uren(60)] });
    const w = wisKlantgegevens(b, NU);
    expect(w.klant).toEqual(leegeKlant());
    expect(w.uren).toHaveLength(1);
    expect(w.omschrijving).toBe(b.omschrijving);
    expect(w.nummer).toBe(b.nummer);
  });
});

describe("filteren en zoeken", () => {
  const a = bon({ id: "2026-0001", nummer: "WB-2026-0001", status: "nieuw", klant: { ...leegeKlant(), naam: "Jansen", plaats: "Utrecht", straat: "Domstraat", huisnummer: "4" } });
  const b = bon({ id: "2026-0002", nummer: "WB-2026-0002", status: "bezig", klant: { ...leegeKlant(), naam: "De Vries", plaats: "Breda" }, omschrijving: "Dakgoot vervangen" });
  const c = bon({ id: "2026-0010", nummer: "WB-2026-0010", status: "bezig" });

  it("filtert op status en geeft de nieuwste eerst", () => {
    expect(filterBonnen([a, b, c], { status: "bezig" }).map((x) => x.id)).toEqual(["2026-0010", "2026-0002"]);
    expect(filterBonnen([a, b, c], {}).map((x) => x.id)).toEqual(["2026-0010", "2026-0002", "2026-0001"]);
  });

  it("zoekt op nummer, klant, adres en omschrijving, zonder op hoofdletters te letten", () => {
    expect(filterBonnen([a, b, c], { q: "wb-2026-0002" }).map((x) => x.id)).toEqual(["2026-0002"]);
    expect(filterBonnen([a, b, c], { q: "JANSEN" }).map((x) => x.id)).toEqual(["2026-0001"]);
    expect(filterBonnen([a, b, c], { q: "domstraat 4" }).map((x) => x.id)).toEqual(["2026-0001"]);
    expect(filterBonnen([a, b, c], { q: "breda" }).map((x) => x.id)).toEqual(["2026-0002"]);
    expect(filterBonnen([a, b, c], { q: "dakgoot" }).map((x) => x.id)).toEqual(["2026-0002"]);
    expect(filterBonnen([a, b, c], { q: "bestaat niet" })).toEqual([]);
  });
});
