import { describe, expect, it } from "vitest";
import {
  controleerInhoud,
  controleerKlaarVoorVersturen,
  effectieveStatus,
  geldigeDag,
  inhoudVan,
  intrekken,
  kanBewerken,
  klantWissen,
  kopie,
  naarBeheer,
  naarOpenbaar,
  nieuweLink,
  nlDag,
  nummerTekst,
  plusDagen,
  reageer,
  standaardGeldigTot,
  totalenVan,
  versturen,
  type Offerte,
} from "@/lib/offertes/model";

// Vaste momenten met een zone: de tests hangen nooit af van de klok of de tijdzone van de computer.
const NU = new Date("2026-11-12T10:00:00+01:00"); // donderdag 12 november, Nederland
const REGEL = { omschrijving: "Arbeid", aantal: 8, eenheid: "uur", prijsCent: 6_500, btw: 21 };
const BODY = { klant: { naam: "Piet Jansen", email: "Piet@Voorbeeld.nl", telefoon: "06 1234 5678", adres: "Dorpsstraat 1\n1234 AB Dorp" }, titel: "Dakkapel", inleiding: "Dank voor je aanvraag.", regels: [REGEL], kortingPct: 10, geldigTot: "2026-12-12", voorwaarden: "Betaling binnen 14 dagen." };

function inhoud(over: Record<string, unknown> = {}) {
  const r = controleerInhoud({ ...BODY, ...over }, NU);
  if (!r.ok) throw new Error(r.fout);
  return r.waarde;
}
function concept(over: Partial<Offerte> = {}): Offerte {
  return { ...inhoud(), id: "o0123456789ab", nummer: "OF-2026-0001", status: "concept", bedrijfsnaam: "", gemaaktOp: NU.toISOString(), gewijzigdOp: NU.toISOString(), ...over };
}
const verstuurd = (over: Partial<Offerte> = {}): Offerte => concept({ status: "verstuurd", tokenHash: "hash1", bedrijfsnaam: "Bouw BV", verstuurdOp: NU.toISOString(), ...over });
const fout = (u: { ok: boolean; fout?: string }) => (u.ok ? "" : (u.fout ?? ""));

describe("dagen", () => {
  it("plusDagen over maand- en jaargrenzen, en de standaard van 30 dagen", () => {
    expect(plusDagen("2026-11-12", 30)).toBe("2026-12-12");
    expect(plusDagen("2026-12-31", 1)).toBe("2027-01-01");
    expect(plusDagen("2028-02-28", 1)).toBe("2028-02-29");
    expect(standaardGeldigTot(NU)).toBe("2026-12-12");
    // 23:30 UTC is al de volgende dag in Nederland
    expect(standaardGeldigTot(new Date("2026-11-12T23:30:00Z"))).toBe("2026-12-13");
  });
  it("geldigeDag weigert dagen die niet bestaan", () => {
    expect(geldigeDag("2026-02-28")).toBe(true);
    expect(geldigeDag("2026-02-30")).toBe(false);
    expect(geldigeDag("2026-13-01")).toBe(false);
    expect(geldigeDag("12-11-2026")).toBe(false);
  });
  it("een Nederlandse dag en een nummer", () => {
    expect(nlDag("2026-11-12")).toBe("donderdag 12 november 2026");
    expect(nummerTekst(2026, 1)).toBe("OF-2026-0001");
    expect(nummerTekst(2026, 12_345)).toBe("OF-2026-12345");
  });
});

describe("controleerInhoud", () => {
  it("schoont de invoer op en rekent de korting om naar honderdsten", () => {
    const i = inhoud();
    expect(i.klant.email).toBe("piet@voorbeeld.nl");
    expect(i.klant.adres).toBe("Dorpsstraat 1\n1234 AB Dorp");
    expect(i.kortingBp).toBe(1_000);
    expect(i.regels).toEqual([REGEL]);
    expect(inhoud({ kortingPct: 7.5 }).kortingBp).toBe(750);
    expect(inhoud({ kortingPct: 0 }).kortingBp).toBe(0);
    expect(inhoud({ kortingPct: 100 }).kortingBp).toBe(10_000);
    expect(inhoud({ kortingPct: undefined }).kortingBp).toBe(0);
  });

  it("zonder 'geldig tot' wordt het 30 dagen vanaf nu", () => {
    expect(inhoud({ geldigTot: undefined }).geldigTot).toBe("2026-12-12");
    expect(inhoud({ geldigTot: "" }).geldigTot).toBe("2026-12-12");
  });

  it("een eenheid die ontbreekt wordt 'stuk'", () => {
    expect(inhoud({ regels: [{ ...REGEL, eenheid: "" }] }).regels[0]?.eenheid).toBe("stuk");
  });

  it("lege regels worden overgeslagen, een prijs zonder omschrijving is een fout", () => {
    expect(inhoud({ regels: [{ omschrijving: "", aantal: 1, prijsCent: 0, btw: 21 }, {}, REGEL, { omschrijving: "  ", aantal: "x" }] }).regels).toEqual([REGEL]);
    expect(inhoud({ regels: [] }).regels).toEqual([]);
    expect(fout(controleerInhoud({ ...BODY, regels: [{ omschrijving: "", aantal: 1, prijsCent: 500, btw: 21 }] }, NU))).toMatch(/Regel 1: vul een omschrijving in/);
  });

  it("weigert een slecht aantal, prijs of btw-tarief, met het regelnummer", () => {
    const f = (r: Record<string, unknown>) => fout(controleerInhoud({ ...BODY, regels: [REGEL, { ...REGEL, ...r }] }, NU));
    expect(f({ aantal: 0 })).toMatch(/Regel 2: het aantal moet groter zijn dan nul/);
    expect(f({ aantal: -1 })).toMatch(/Regel 2/);
    expect(f({ aantal: "2" })).toMatch(/Regel 2/);
    expect(f({ aantal: 1.2345 })).toMatch(/hoogstens 3 decimalen/);
    expect(f({ aantal: 1_000_001 })).toMatch(/te groot/);
    expect(f({ prijsCent: -1 })).toMatch(/prijs/);
    expect(f({ prijsCent: 10.5 })).toMatch(/prijs/);
    expect(f({ prijsCent: 100_000_001 })).toMatch(/te hoog/);
    expect(f({ btw: 20 })).toMatch(/0%, 9% of 21%/);
    expect(f({ btw: "21" })).toMatch(/0%, 9% of 21%/);
    expect(f({ aantal: 1_000_000, prijsCent: 100_000_000 })).toMatch(/bedrag is te hoog/);
  });

  it("aantallen met drie decimalen mogen, ook als de float ruis heeft", () => {
    expect(inhoud({ regels: [{ ...REGEL, aantal: 0.333 }] }).regels[0]?.aantal).toBe(0.333);
    expect(inhoud({ regels: [{ ...REGEL, aantal: 1.005 }] }).regels[0]?.aantal).toBe(1.005);
  });

  it("hoogstens 100 regels", () => {
    expect(inhoud({ regels: Array.from({ length: 100 }, () => REGEL) }).regels).toHaveLength(100);
    expect(fout(controleerInhoud({ ...BODY, regels: Array.from({ length: 101 }, () => REGEL) }, NU))).toMatch(/hoogstens 100 regels/);
  });

  it("korting: 0 tot 100 met hoogstens 2 decimalen", () => {
    for (const p of [-1, 100.01, 101, "10", Number.NaN]) expect(controleerInhoud({ ...BODY, kortingPct: p }, NU).ok).toBe(false);
    expect(fout(controleerInhoud({ ...BODY, kortingPct: 12.345 }, NU))).toMatch(/2 decimalen/);
  });

  it("voorwaarden: 2000 tekens mag, 2001 niet", () => {
    expect(inhoud({ voorwaarden: "x".repeat(2_000) }).voorwaarden).toHaveLength(2_000);
    expect(fout(controleerInhoud({ ...BODY, voorwaarden: "x".repeat(2_001) }, NU))).toMatch(/hoogstens 2000 tekens/);
  });

  it("geldig tot: een echte dag, niet meer dan drie jaar vooruit", () => {
    expect(controleerInhoud({ ...BODY, geldigTot: "2026-02-30" }, NU).ok).toBe(false);
    expect(controleerInhoud({ ...BODY, geldigTot: "morgen" }, NU).ok).toBe(false);
    expect(controleerInhoud({ ...BODY, geldigTot: "2031-01-01" }, NU).ok).toBe(false);
    expect(controleerInhoud({ ...BODY, geldigTot: "2026-11-01" }, NU).ok).toBe(true); // een concept in het verleden mag; versturen niet
  });

  it("e-mail en telefoon van de klant: leeg mag, onzin niet", () => {
    expect(inhoud({ klant: { naam: "Piet" } }).klant).toEqual({ naam: "Piet", email: "", telefoon: "", adres: "" });
    expect(controleerInhoud({ ...BODY, klant: { naam: "Piet", email: "geen-mail" } }, NU).ok).toBe(false);
    expect(controleerInhoud({ ...BODY, klant: { naam: "Piet", telefoon: "abc" } }, NU).ok).toBe(false);
  });

  it("stuurtekens verdwijnen, ook als de body geen object is", () => {
    expect(inhoud({ titel: "Dak\u0000kapel\n" }).titel).toBe("Dak kapel");
    expect(controleerInhoud(null, NU).ok).toBe(true);
    expect(controleerInhoud("tekst", NU).ok).toBe(true);
    expect(controleerInhoud({ regels: "geen lijst" }, NU)).toMatchObject({ ok: true, waarde: { regels: [] } });
  });
});

describe("klaar voor versturen", () => {
  it("vraagt klantnaam, titel en minstens één regel, en een datum die niet voorbij is", () => {
    expect(fout(controleerKlaarVoorVersturen(inhoud({ klant: { naam: "" } }), NU))).toMatch(/naam van de klant/);
    expect(fout(controleerKlaarVoorVersturen(inhoud({ titel: "" }), NU))).toMatch(/titel/);
    expect(fout(controleerKlaarVoorVersturen(inhoud({ regels: [] }), NU))).toMatch(/minstens één regel/);
    expect(fout(controleerKlaarVoorVersturen(inhoud({ geldigTot: "2026-11-11" }), NU))).toMatch(/al verlopen/);
    expect(controleerKlaarVoorVersturen(inhoud({ geldigTot: "2026-11-12" }), NU).ok).toBe(true); // vandaag mag nog
    expect(controleerKlaarVoorVersturen(inhoud(), NU).ok).toBe(true);
  });
});

describe("verlopen volgt uit de datum", () => {
  it("geldig tot is de laatste dag: op die dag nog verstuurd, de dag erna verlopen (Nederlandse dag)", () => {
    const o = { status: "verstuurd" as const, geldigTot: "2026-11-12" };
    expect(effectieveStatus(o, new Date("2026-11-12T22:30:00Z"))).toBe("verstuurd"); // 23:30 in Nederland
    expect(effectieveStatus(o, new Date("2026-11-12T23:30:00Z"))).toBe("verlopen"); // 00:30 op 13 november in Nederland
    expect(effectieveStatus(o, new Date("2026-11-20T10:00:00Z"))).toBe("verlopen");
  });
  it("alleen een verstuurde offerte kan verlopen; de opgeslagen status verandert niet", () => {
    const laat = new Date("2030-01-01T10:00:00Z");
    for (const status of ["concept", "geaccepteerd", "afgewezen"] as const) expect(effectieveStatus({ status, geldigTot: "2026-11-12" }, laat)).toBe(status);
    const o = verstuurd({ geldigTot: "2026-11-12" });
    expect(effectieveStatus(o, laat)).toBe("verlopen");
    expect(o.status).toBe("verstuurd");
  });
});

describe("statusovergangen", () => {
  it("concept → verstuurd: bewaart de hash en de bedrijfsnaam, en wist een oude reactie niet nodig", () => {
    const r = versturen(concept(), "hash1", "Bouw BV", NU);
    expect(r.ok && r.waarde).toMatchObject({ status: "verstuurd", tokenHash: "hash1", bedrijfsnaam: "Bouw BV", verstuurdOp: NU.toISOString() });
  });
  it("versturen vraagt een complete offerte en kan niet twee keer", () => {
    expect(versturen(concept({ regels: [] }), "h", "B", NU).ok).toBe(false);
    const dubbel = versturen(verstuurd(), "h2", "B", NU);
    expect(dubbel).toMatchObject({ ok: false, code: "STATUS" });
    expect(versturen(verstuurd({ status: "geaccepteerd" }), "h2", "B", NU)).toMatchObject({ ok: false, code: "VERGRENDELD" });
  });

  it("de klant accepteert: reactie met naam en tijd, geen IP", () => {
    const r = reageer(verstuurd(), "geaccepteerd", "  Piet Jansen ", "", NU);
    expect(r.ok && r.waarde.status).toBe("geaccepteerd");
    expect(r.ok && r.waarde.reactie).toEqual({ keuze: "geaccepteerd", naam: "Piet Jansen", reden: "", op: NU.toISOString() });
  });
  it("akkoord vraagt een naam; afwijzen niet, en een reden is optioneel", () => {
    expect(fout(reageer(verstuurd(), "geaccepteerd", " ", "", NU))).toMatch(/naam/);
    const r = reageer(verstuurd(), "afgewezen", "", "Te duur", NU);
    expect(r.ok && r.waarde).toMatchObject({ status: "afgewezen", reactie: { naam: "", reden: "Te duur" } });
  });
  it("een tweede reactie, een concept en een verlopen offerte geven een nette fout", () => {
    expect(reageer(verstuurd({ status: "geaccepteerd" }), "afgewezen", "Piet", "", NU)).toMatchObject({ ok: false, code: "VERGRENDELD", fout: "Deze offerte is al geaccepteerd." });
    expect(reageer(verstuurd({ status: "afgewezen" }), "geaccepteerd", "Piet", "", NU)).toMatchObject({ ok: false, code: "VERGRENDELD" });
    expect(reageer(concept(), "geaccepteerd", "Piet", "", NU)).toMatchObject({ ok: false, code: "STATUS" });
    const laat = new Date("2026-12-13T10:00:00+01:00");
    expect(fout(reageer(verstuurd({ geldigTot: "2026-12-12" }), "geaccepteerd", "Piet", "", laat))).toMatch(/verlopen/);
    expect(reageer(verstuurd({ geldigTot: "2026-12-12" }), "geaccepteerd", "Piet", "", new Date("2026-12-12T20:00:00+01:00")).ok).toBe(true);
  });

  it("intrekken: verstuurd (ook verlopen) → concept zonder link; beantwoord kan niet", () => {
    const r = intrekken(verstuurd(), NU);
    expect(r.ok && r.waarde.status).toBe("concept");
    expect(r.ok && "tokenHash" in r.waarde).toBe(false);
    expect(r.ok && "verstuurdOp" in r.waarde).toBe(false);
    expect(intrekken(verstuurd({ geldigTot: "2020-01-01" }), NU).ok).toBe(true);
    expect(intrekken(verstuurd({ status: "geaccepteerd" }), NU)).toMatchObject({ ok: false, code: "VERGRENDELD" });
    expect(intrekken(concept(), NU)).toMatchObject({ ok: false, code: "STATUS" });
  });

  it("nieuwe link: alleen voor een verstuurde offerte", () => {
    const r = nieuweLink(verstuurd(), "hash2", NU);
    expect(r.ok && r.waarde.tokenHash).toBe("hash2");
    expect(nieuweLink(concept(), "h", NU).ok).toBe(false);
    expect(nieuweLink(verstuurd({ status: "afgewezen" }), "h", NU).ok).toBe(false);
  });

  it("bewerken mag alleen bij een concept; een beantwoorde offerte wijst naar een kopie", () => {
    expect(kanBewerken(concept()).ok).toBe(true);
    expect(fout(kanBewerken(verstuurd()))).toMatch(/Trek hem eerst in/);
    for (const status of ["geaccepteerd", "afgewezen"] as const) {
      const u = kanBewerken(verstuurd({ status }));
      expect(u).toMatchObject({ ok: false, code: "VERGRENDELD" });
      expect(fout(u)).toMatch(/kopie/);
    }
  });

  it("een kopie is een nieuw concept zonder link of reactie, 30 dagen geldig", () => {
    const bron = verstuurd({ status: "geaccepteerd", reactie: { keuze: "geaccepteerd", naam: "Piet", reden: "", op: NU.toISOString() } });
    const k = kopie(bron, "o999999999999", "OF-2026-0002", NU);
    expect(k).toMatchObject({ id: "o999999999999", nummer: "OF-2026-0002", status: "concept", geldigTot: "2026-12-12", kopieVan: "OF-2026-0001", titel: "Dakkapel" });
    expect("tokenHash" in k).toBe(false);
    expect("reactie" in k).toBe(false);
    expect(k.regels).toEqual(bron.regels);
  });

  it("een kopie neemt de klantgegevens mee als het origineel niet gewist is", () => {
    const k = kopie(verstuurd(), "o999999999999", "OF-2026-0002", NU);
    expect(k.klant).toEqual(verstuurd().klant);
    expect(k.klant.naam).toBe("Piet Jansen");
    expect(k.klantGewist).toBeUndefined();
  });

  it("een kopie van een offerte met gewiste klantgegevens houdt die leeg (ook na klantWissen van een beantwoorde offerte)", () => {
    const gewist = klantWissen(verstuurd({ status: "geaccepteerd", reactie: { keuze: "geaccepteerd", naam: "Piet Jansen", reden: "", op: NU.toISOString() } }), NU);
    const k = kopie(gewist, "o999999999999", "OF-2026-0002", NU);
    expect(k.klant).toEqual({ naam: "", email: "", telefoon: "", adres: "" });
    expect(k.klantGewist).toBeUndefined();
    expect(k.titel).toBe("Dakkapel");
    expect(JSON.stringify(k)).not.toMatch(/Piet|voorbeeld|Dorpsstraat|1234 AB|06 1234|Verwijderd/);
  });

  it("klantgegevens wissen: naam, adres, mail en telefoon weg, ook de naam in de reactie; bedragen blijven", () => {
    const o = verstuurd({ status: "geaccepteerd", reactie: { keuze: "geaccepteerd", naam: "Piet Jansen", reden: "", op: NU.toISOString() } });
    const w = klantWissen(o, NU);
    expect(w.klant).toEqual({ naam: "Verwijderd", email: "", telefoon: "", adres: "" });
    expect(w.reactie?.naam).toBe("Verwijderd");
    expect(w.klantGewist).toBe(true);
    expect("tokenHash" in w).toBe(false);
    expect(totalenVan(w)).toEqual(totalenVan(o));
    expect(JSON.stringify(w)).not.toMatch(/Piet|voorbeeld|Dorpsstraat|1234 AB|06 1234/);
  });
});

describe("wat het bedrijf en de klant te zien krijgen", () => {
  it("naarBeheer: effectieve status, nooit de tokenhash", () => {
    const b = naarBeheer(verstuurd({ geldigTot: "2026-11-01" }), NU);
    expect(b.status).toBe("verlopen");
    expect(b.heeftLink).toBe(true);
    expect("tokenHash" in b).toBe(false);
    expect(naarBeheer(concept(), NU).heeftLink).toBe(false);
    expect(naarBeheer(verstuurd({ status: "geaccepteerd" }), NU).heeftLink).toBe(false);
  });
  it("naarOpenbaar: alleen wat de klant mag zien", () => {
    const o = naarOpenbaar(verstuurd(), NU);
    expect(Object.keys(o).sort()).toEqual(["beslistOp", "bedrijfsnaam", "geldigTot", "inleiding", "klantNaam", "kortingBp", "nummer", "regels", "status", "titel", "voorwaarden"].sort());
    expect(JSON.stringify(o)).not.toMatch(/hash1|voorbeeld|Dorpsstraat|06 1234|o0123456789ab/);
  });
  it("inhoudVan geeft precies de bewerkbare velden", () => {
    expect(Object.keys(inhoudVan(concept())).sort()).toEqual(["geldigTot", "inleiding", "klant", "kortingBp", "regels", "titel", "voorwaarden"]);
  });
});
