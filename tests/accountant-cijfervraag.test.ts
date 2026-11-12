import { describe, expect, it } from "vitest";
import type { ProefbalansRij } from "@/lib/boekhouding/lezen-kern";
import type { TermijnRij } from "@/lib/accountant/maandcontrole-kern";
import { btwTekst, herkenCijfervraag, openstaandTekst, periodeUit, termijnTekst, wvCijfers, wvTekst } from "@/lib/accountant/cijfervraag";

const VANDAAG = "2026-11-12"; // vaste dag: geen klok in deze test

describe("herkennen", () => {
  it.each([
    ["Wat is mijn omzet dit kwartaal?", "omzet"],
    ["Hoeveel kosten hebben we vorige maand gemaakt?", "kosten"],
    ["Hoeveel winst in 2026?", "resultaat"],
    ["Hoeveel btw moet ik dit kwartaal betalen?", "btw"],
    ["Welke facturen staan nog open bij ons?", "openstaand"],
    ["Wanneer moet de 83(b) uiterlijk weg?", "termijn"],
  ])("%s → %s", (vraag, wat) => {
    expect(herkenCijfervraag(vraag, VANDAAG)?.wat).toBe(wat);
  });

  it.each([
    "Moet ik btw betalen over diensten aan klanten in het buitenland?",
    "Is omzet uit Amerika belast in Nederland?",
    "Hoe werkt de Delaware franchise tax?",
    "Moet ik me inschrijven bij de KvK?",
  ])("een regelvraag gaat naar de kennisbank: %s", (vraag) => {
    expect(herkenCijfervraag(vraag, VANDAAG)).toBeNull();
  });

  it("kiest bij een termijnvraag het onderwerp", () => {
    expect(herkenCijfervraag("Wanneer moet de 83(b) uiterlijk weg?", VANDAAG)?.onderwerp).toBe("83b");
    expect(herkenCijfervraag("Wat is de termijn voor de btw-aangifte?", VANDAAG)?.onderwerp).toBe("btw");
    expect(herkenCijfervraag("Welke deadlines komen eraan?", VANDAAG)?.onderwerp).toBeNull();
  });
});

describe("periode", () => {
  it.each([
    ["dit kwartaal", "2026-10-01", "2026-12-31"],
    ["vorig kwartaal", "2026-07-01", "2026-09-30"],
    ["Q2 2026", "2026-04-01", "2026-06-30"],
    ["kwartaal 1", "2026-01-01", "2026-03-31"],
    ["vorige maand", "2026-10-01", "2026-10-31"],
    ["deze maand", "2026-11-01", "2026-11-30"],
    ["vorig jaar", "2025-01-01", "2025-12-31"],
    ["in 2026", "2026-01-01", "2026-12-31"],
    ["zonder periode", "2026-10-01", "2026-12-31"],
  ])("%s", (tekst, van, tot) => {
    const p = periodeUit(tekst, VANDAAG);
    expect([p.van, p.tot]).toEqual([van, tot]);
  });

  it("vorig kwartaal in januari is het 4e kwartaal van vorig jaar", () => {
    expect(periodeUit("vorig kwartaal", "2027-01-15").naam).toBe("het 4e kwartaal van 2026 (1 oktober t/m 31 december)");
  });
});

describe("antwoordteksten uit de boeken", () => {
  const rijen: ProefbalansRij[] = [
    { rekeningNummer: "8000", naam: "Omzet", kant: "WV", debetCents: 0, creditCents: 150_000 },
    { rekeningNummer: "4000", naam: "Hosting", kant: "WV", debetCents: 40_000, creditCents: 0 },
    { rekeningNummer: "1100", naam: "Bank", kant: "BALANS", debetCents: 110_000, creditCents: 0 },
  ];
  const p = periodeUit("dit kwartaal", VANDAAG);

  it("rekent omzet, kosten en resultaat alleen uit winst-en-verlies", () => {
    expect(wvCijfers(rijen)).toEqual({ omzet: 150_000, kosten: 40_000, resultaat: 110_000 });
    expect(wvTekst("omzet", p, "zekerflex, Inc.", "EUR", rijen)).toBe("zekerflex, Inc.: de omzet over het 4e kwartaal van 2026 (1 oktober t/m 31 december) is € 1.500,00.");
    expect(wvTekst("resultaat", p, "Inc", "USD", rijen)).toContain("$ 1.100,00 (winst)");
  });

  it("zegt bij btw of je moet betalen of terugkrijgt, en dat het geen aangifte is", () => {
    expect(btwTekst(p, "Inc", "EUR", 21_000)).toContain("€ 210,00 btw te betalen");
    expect(btwTekst(p, "Inc", "EUR", -5_000)).toContain("€ 50,00 btw terug te vragen");
    expect(btwTekst(p, "Inc", "EUR", 0)).toContain("geen aangifte");
  });

  it("telt alleen debiteuren bij openstaande facturen", () => {
    const t = openstaandTekst("Inc", "EUR", [
      { postSleutel: "factuur:a", rekeningNummer: "1200", saldoCents: 12_100, oudsteDatum: "2026-09-03", soort: "DEBITEUR" },
      { postSleutel: "factuur:b", rekeningNummer: "1200", saldoCents: 5_000, oudsteDatum: "2026-10-20", soort: "DEBITEUR" },
      { postSleutel: "inkoop:c", rekeningNummer: "2200", saldoCents: 99_900, oudsteDatum: "2026-01-01", soort: "CREDITEUR" },
    ], VANDAAG);
    expect(t).toBe("Inc: er staan 2 facturen open, samen € 171,00. De oudste is van 3 september 2026.");
    expect(openstaandTekst("Inc", "EUR", [], VANDAAG)).toBe("Inc: er staan geen facturen open.");
  });

  it("noemt de eerstvolgende termijnen, gefilterd op onderwerp en zonder wat klaar is", () => {
    const termijnen: TermijnRij[] = [
      { sleutel: "irs-83b-2026", titel: "83(b)-verklaring", dag: "2026-12-09", dagenTot: 27, wat: "Versturen naar de IRS.", waarschuwing: null, bevestigDoor: "-", klaar: false },
      { sleutel: "btw-2026-k4", titel: "Btw-aangifte K4", dag: "2027-01-31", dagenTot: 80, wat: "Aangifte doen.", waarschuwing: null, bevestigDoor: "-", klaar: false },
      { sleutel: "btw-2026-k3", titel: "Btw-aangifte K3", dag: "2026-10-31", dagenTot: -12, wat: "Klaar.", waarschuwing: null, bevestigDoor: "-", klaar: true },
    ];
    expect(termijnTekst(termijnen, "83b")).toBe("83(b)-verklaring: uiterlijk 9 december 2026 (nog 27 dagen). Versturen naar de IRS.");
    expect(termijnTekst(termijnen, "btw")).toContain("Btw-aangifte K4");
    expect(termijnTekst(termijnen, "btw")).not.toContain("K3");
    expect(termijnTekst(termijnen, "icp")).toMatch(/geen komende termijn/);
  });
});
