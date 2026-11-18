import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { VRAAG_LABEL, bedrijfsConcept, herkenVragen } from "@/lib/mail/info-antwoorden";
import { loopInfoNa, type InfoAfhankelijkheden, type InfoEnvelop, type InfoMerk, type InfoStand } from "@/lib/mail/info-ronde";
import { BASE_FEE_PER_HOUR_CENTS } from "@/lib/pricing/tiers";

// Het antwoordenpakket voor bedrijven (concept, nooit automatisch) en het herkennen van een reactie op een verkoopmail.

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

// de mail van het café in Rotterdam (18 nov), ingekort
const CAFE =
  "Goedemorgen, mijn naam is Sofia en ik ben de eigenaresse van Café Orquídea in Rotterdam Overschie. Ik ben op zoek naar betrouwbare flexmedewerkers voor de bar en bediening, voornamelijk op vrijdag en zaterdag van 17:00 tot 03:00 uur. " +
  "Kunt u mij informeren over: De totale kosten per gewerkt uur; Eventuele extra kosten, toeslagen of abonnementen; De keuze tussen zzp'ers en uitzendkrachten; Verzekeringen en aansprakelijkheid; Annuleringsvoorwaarden; De procedure bij ziekte of een no-show; Of wij eerst vrijblijvend kennis kunnen maken.";

describe("antwoordenpakket: vragen herkennen", () => {
  it("vindt alle zes de vragen van het café", () => {
    expect(herkenVragen("Informatie over flexmedewerkers", CAFE)).toEqual(["kosten", "extra", "soort", "verzekering", "annuleren", "ziekte"]);
  });

  it("een losse vraag geeft alleen die vraag; geciteerde tekst telt niet mee", () => {
    expect(herkenVragen("Vraag", "Wat zijn de tarieven?")).toEqual(["kosten"]);
    expect(herkenVragen("Re: hallo", "Dank je wel.\n> eerder schreven jullie over verzekering en annuleren")).toEqual([]);
  });
});

describe("antwoordenpakket: het concept", () => {
  const c = bedrijfsConcept("Informatie over flexmedewerkers", CAFE);

  it("beantwoordt elke gestelde vraag en eindigt met het aanbod om kennis te maken", () => {
    expect(c.vragen).toHaveLength(6);
    expect(c.onderwerp).toBe("Re: Informatie over flexmedewerkers");
    for (const kop of ["Wat kost het per gewerkt uur?", "Toeslagen of andere kosten?", "Zzp'ers of uitzendkrachten?", "Verzekeringen en aansprakelijkheid", "Annuleren", "Ziekte of niet komen opdagen"]) {
      expect(c.tekst).toContain(kop);
    }
    expect(c.tekst).toContain("https://zekerflex.com/demo");
    expect(c.tekst.endsWith("Groet,\nTeam ZekerFlex")).toBe(true);
  });

  it("noemt alleen de platformvergoeding uit de ene bron, en geen verzonnen bedragen", () => {
    expect(BASE_FEE_PER_HOUR_CENTS).toBe(350);
    expect(c.tekst).toContain("€ 3,50 per gewerkt uur");
    expect([...c.tekst.matchAll(/€\s?[\d.,]+/g)].map((m) => m[0])).toEqual(["€ 3,50"]);
  });

  it("is eerlijk over de verzekering en over uitzenden, en belooft niets over toeslagen of annuleren", () => {
    expect(c.tekst).toContain("ZekerFlex biedt zelf geen verzekering aan");
    expect(c.tekst).toContain("nog in opbouw");
    expect(c.tekst).not.toMatch(/gratis verzekerd|verzekerd tegen|dekking|gedekt/i);
    expect(c.tekst).not.toMatch(/geen (extra )?kosten|gratis|garantie|binnenkort/i);
  });

  it("heeft geen invulplekken en geen streepjes als scheidingsteken", () => {
    expect(c.tekst).not.toMatch(/\[.*\]|\.\.\.|xxx|invullen/i);
    expect(c.tekst).not.toMatch(/ — | – /);
  });

  it("zonder herkenbare vraag een korte uitleg met de uitnodiging om te vragen", () => {
    const k = bedrijfsConcept("Hallo", "Wij zoeken personeel.");
    expect(k.vragen).toEqual([]);
    expect(k.tekst).toContain("brengt bedrijven en flexwerkers");
    expect(k.tekst).toContain("https://zekerflex.com/demo");
    expect(Object.keys(VRAAG_LABEL)).toHaveLength(6);
  });
});

// ---- de info-ronde -------------------------------------------------------------------------------------------------

const NU = new Date("2026-11-18T12:00:00Z");
const MENS_KOP = "From: x@y.nl\r\nSubject: x\r\n";

function bouw(opties: { aan: boolean; mails: { uid: number; van: string; onderwerp: string; tekst: string }[]; lead?: string | null; metConcept?: boolean }) {
  const merken = new Map<number, InfoMerk>();
  const stuur = vi.fn(async () => true);
  const bewaarConcept = vi.fn(async () => true);
  const markeerReactie = vi.fn(async () => true);
  const herkenReactie = vi.fn(async (adres: string) => (opties.lead && adres === "lead@bedrijf.test" ? opties.lead : null));
  const meld = vi.fn(async () => true);
  let opgeslagen: InfoStand | null = null;
  const lijst: InfoEnvelop[] = opties.mails.map((m) => ({ uid: m.uid, date: new Date(NU.getTime() - 60_000).toUTCString(), fromAddress: m.van, fromName: null, replyToAddress: null, subject: m.onderwerp, messageId: `id${m.uid}@bedrijf.test` }));
  const d: InfoAfhankelijkheden = {
    aan: async () => opties.aan,
    lijst: async () => lijst,
    kop: async () => MENS_KOP,
    tekst: async (uid) => opties.mails.find((m) => m.uid === uid)?.tekst ?? null,
    merk: async (uid) => merken.get(uid) ?? null,
    zetMerk: async (uid, merk) => void merken.set(uid, merk),
    bounceVerwerkt: async () => true,
    verplaats: async () => true,
    markeerBeantwoord: async () => undefined,
    alGeantwoord: async () => false,
    onthoudAntwoord: async () => undefined,
    antwoordenDitUur: async () => 0,
    telAntwoord: async () => undefined,
    stuur,
    meld,
    vorigeStand: async () => null,
    bewaar: async (s) => void (opgeslagen = s),
    ruimOp: async () => undefined,
    ...(opties.metConcept === false ? {} : { bewaarConcept, herkenReactie, markeerReactie }),
  };
  return { d, stuur, bewaarConcept, markeerReactie, herkenReactie, meld, stand: () => opgeslagen };
}

describe("info-ronde: een bedrijf krijgt een concept en nooit een automatisch antwoord", () => {
  const cafe = { uid: 1, van: "sofia@cafe-orquidea.test", onderwerp: "Informatie over flexmedewerkers", tekst: CAFE };

  it("echt: melding aan de eigenaar en een concept klaargezet, maar er wordt niets verstuurd", async () => {
    const t = bouw({ aan: true, mails: [cafe] });
    const s = await loopInfoNa(t.d, NU);
    expect(t.meld).toHaveBeenCalledTimes(1);
    expect(t.bewaarConcept).toHaveBeenCalledTimes(1);
    expect(t.stuur).not.toHaveBeenCalled();
    const concept = (t.bewaarConcept.mock.calls[0] as unknown as [{ aan: string; onderwerp: string; tekst: string; inReplyTo: string | null }])[0];
    expect(concept).toMatchObject({ aan: "sofia@cafe-orquidea.test", onderwerp: "Re: Informatie over flexmedewerkers", inReplyTo: "id1@bedrijf.test" });
    expect(s.beslissingen[0]?.actie).toContain("concept-antwoord klaargezet");
    expect(s.gedaan).toEqual({ verplaatst: 0, beantwoord: 0, gemeld: 1 });
  });

  it("proef: schrijft alleen op wat hij zou doen", async () => {
    const t = bouw({ aan: false, mails: [cafe] });
    const s = await loopInfoNa(t.d, NU);
    expect(t.meld).not.toHaveBeenCalled();
    expect(t.bewaarConcept).not.toHaveBeenCalled();
    expect(s.beslissingen[0]?.actie).toContain("zou een melding aan jou sturen en een concept-antwoord klaarzetten");
  });

  it("zonder concept-functie gedraagt alles zich als vroeger", async () => {
    const t = bouw({ aan: true, mails: [cafe], metConcept: false });
    const s = await loopInfoNa(t.d, NU);
    expect(s.beslissingen[0]?.actie).toBe("melding aan jou gestuurd (geen automatisch antwoord)");
  });

  it("een mislukt concept laat de melding en de rest van de ronde ongemoeid", async () => {
    const t = bouw({ aan: true, mails: [cafe] });
    t.bewaarConcept.mockImplementation(async () => {
      throw new Error("kv stuk");
    });
    const s = await loopInfoNa(t.d, NU);
    expect(t.meld).toHaveBeenCalledTimes(1);
    expect(s.beslissingen[0]?.actie).toBe("melding aan jou gestuurd (geen automatisch antwoord)");
  });
});

describe("info-ronde: een reactie op een verkoopmail", () => {
  const reactie = { uid: 2, van: "lead@bedrijf.test", onderwerp: "Re: samenwerking", tekst: "Ja, interessant, bel me maar." };

  it("echt: de lead staat op gereageerd, de eigenaar krijgt een melding en er gaat niets uit", async () => {
    const t = bouw({ aan: true, mails: [reactie], lead: "lead-1" });
    const s = await loopInfoNa(t.d, NU);
    expect(t.markeerReactie).toHaveBeenCalledWith("lead-1");
    expect(t.meld).toHaveBeenCalledTimes(1);
    expect(t.stuur).not.toHaveBeenCalled();
    expect(t.bewaarConcept).not.toHaveBeenCalled();
    expect(s.beslissingen[0]?.actie).toContain("de lead staat op 'gereageerd'");
  });

  it("proef: zou het doen, maar doet het niet", async () => {
    const t = bouw({ aan: false, mails: [reactie], lead: "lead-1" });
    const s = await loopInfoNa(t.d, NU);
    expect(t.markeerReactie).not.toHaveBeenCalled();
    expect(s.beslissingen[0]?.actie).toContain("zou de lead op 'gereageerd' zetten");
  });

  it("een adres dat geen lead is, volgt de gewone weg", async () => {
    const t = bouw({ aan: true, mails: [{ ...reactie, uid: 3, van: "iemand@anders.test", onderwerp: "Personeel nodig", tekst: "Wij zoeken personeel." }], lead: "lead-1" });
    await loopInfoNa(t.d, NU);
    expect(t.markeerReactie).not.toHaveBeenCalled();
    expect(t.bewaarConcept).toHaveBeenCalledTimes(1);
  });
});

describe("aangesloten", () => {
  it("het voorstel-type bestaat en wordt alleen na Uitvoeren verstuurd, niet naar een eigen adres", () => {
    expect(lees("lib/ai-teams/index.ts")).toContain('type: "info-antwoord"');
    const uitvoer = lees("lib/ai-teams/execute.ts");
    expect(uitvoer).toContain('action.type === "info-antwoord"');
    expect(uitvoer).toMatch(/zekerflex\\\.\(com\|nl\)/);
    expect(uitvoer).toContain('kind: "info-antwoord"');
    expect(uitvoer).not.toMatch(/autoAntwoord: true/);
  });

  it("de echte afhankelijkheden zetten alleen een voorstel klaar en herkennen een lead aan zijn adres", () => {
    const db = lees("lib/mail/info-ronde-db.ts");
    expect(db).toContain('type: "info-antwoord"');
    expect(db).toContain("markLeadReplied(leadId, null)");
    expect(db).toMatch(/status: \{ in: \["QUEUED", "DRAFTED", "APPROVED", "SENT"\] \}/);
    // nergens verstuurt de ronde zelf een concept
    expect(db.match(/sendMail\(/g)).toHaveLength(1);
  });

  it("de medewerker staat in het register als 'na goedkeuring'", async () => {
    const { AI_MEDEWERKERS } = await import("@/lib/ai-medewerkers/register");
    expect(AI_MEDEWERKERS.find((m) => m.id === "aanvragen-beantwoorder")?.naarBuiten).toBe("na-goedkeuring");
  });
});
