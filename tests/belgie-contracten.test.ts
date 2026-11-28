import { describe, expect, it } from "vitest";
import { SJABLOON_KOP, contractBestandsnaam, contractTekst, type ContractGegevens } from "@/lib/belgie/contracten";

// De contractsjablonen voor een klus in België (lib/belgie/contracten.ts, spec-belgie.md 1.1, 1.2 en 9): bovenaan de zin over het
// sociaal secretariaat, de gegevens van de klus ingevuld, de verplichte vermeldingen uit de specificatie, geen rijksregisternummer
// en geen wetsartikelen die er niet in staan.

const gegevens: ContractGegevens = {
  bedrijf: { naam: "Brasserie De Meir BV", btwNummer: "BE0123456789" },
  werker: { naam: "Lotte Peeters" },
  klus: {
    titel: "Bediening terras",
    omschrijving: "Bestellingen opnemen en serveren.",
    werkplek: "Meir 1, 2000 Antwerpen, België",
    datum: "zaterdag 5 december 2026",
    van: "11:00",
    tot: "19:30",
    pauzeMinuten: 30,
    uren: 8,
    uurloonCents: 1450,
  },
};

describe("de drie sjablonen", () => {
  it("beginnen met de zin over het sociaal secretariaat", () => {
    expect(SJABLOON_KOP).toBe("Sjabloon. Laat het nakijken door je sociaal secretariaat voordat je tekent.");
    for (const s of ["student", "flexi-raam", "flexi-arbeid"] as const) expect(contractTekst(s, gegevens).startsWith(SJABLOON_KOP)).toBe(true);
  });

  it("vullen het bedrijf, de werker, de datum, de uren, het uurloon en de werkplek in", () => {
    const t = contractTekst("student", gegevens);
    for (const stuk of ["Brasserie De Meir BV", "BE0123456789", "Lotte Peeters", "zaterdag 5 december 2026", "van 11:00 tot 19:30", "30 minuten pauze: 8 uur", "€ 14,50 per uur", "Meir 1, 2000 Antwerpen, België", "Bediening terras"]) {
      expect(t).toContain(stuk);
    }
    const f = contractTekst("flexi-arbeid", gegevens);
    expect(f).toContain("Lotte Peeters");
    expect(f).toContain("€ 14,50 per uur");
    expect(f).toContain("Meir 1, 2000 Antwerpen, België");
  });

  it("zonder werker blijven zijn regels leeg om met de hand in te vullen", () => {
    const t = contractTekst("flexi-raam", { ...gegevens, werker: null });
    expect(t).not.toContain("Lotte Peeters");
    expect(t).toMatch(/Naam en voornaam: _{10,}/);
  });

  it("studentenovereenkomst: de verplichte vermeldingen (identiteit, duur, plaats en functie, uurrooster, loon, paritair comité)", () => {
    const t = contractTekst("student", gegevens);
    expect(t).toContain("Titel VII van de wet van 3 juli 1978");
    expect(t).toMatch(/Begin en einde/);
    expect(t).toMatch(/Plaats, functie en uurrooster/);
    expect(t).toMatch(/Brutoloon/);
    expect(t).toMatch(/Paritair comité/);
    expect(t).toContain("Dimona van het type STU");
    expect(t).toContain("Student@work");
    expect(t).toContain("650 uur");
    expect(t).toContain("in twee exemplaren");
  });

  it("raamovereenkomst flexi: de vijf vermeldingen (identiteit, hoe en wanneer werk voorstellen, functie, flexiloon, voorwaarden)", () => {
    const t = contractTekst("flexi-raam", gegevens);
    expect(t).toContain("Hoe en wanneer de werkgever werk voorstelt");
    expect(t).toContain("Korte functiebeschrijving");
    expect(t).toContain("Flexiloon");
    expect(t).toContain("7,67 %");
    expect(t).toContain("minstens 4/5");
    expect(t).toContain("Dimona van het type FLX");
  });

  it("flexi-arbeidsovereenkomst: per tewerkstelling, verwijst naar de raamovereenkomst", () => {
    const t = contractTekst("flexi-arbeid", gegevens);
    expect(t).toContain("raamovereenkomst flexi-job van");
    expect(t).toContain("bepaalde duur");
    expect(t).toContain("Dimona van het type FLX");
  });

  it("geen rijksregisternummer, ZekerFlex is geen partij, de Nederlandse tekst gaat voor", () => {
    for (const s of ["student", "flexi-raam", "flexi-arbeid"] as const) {
      const t = contractTekst(s, gegevens);
      expect(t.toLowerCase()).not.toContain("rijksregister");
      expect(t).toContain("ZekerFlex bemiddelt: het is geen partij bij deze overeenkomst en niet de werkgever.");
      expect(t).toContain("bij verschil geldt de Nederlandse tekst");
      // geen verzonnen wetsartikelen: alleen de wet van 3 juli 1978 uit de specificatie, en alleen bij de student
      expect(t.match(/\bart(ikel)?\.?\s*\d/gi) ?? []).toEqual([]);
      if (s !== "student") expect(t).not.toContain("1978");
    }
  });
});

describe("de bestandsnaam", () => {
  it("is kort en veilig", () => {
    expect(contractBestandsnaam("student", "Bediening terras (zaterdag)")).toBe("studentenovereenkomst-bediening-terras-zaterdag.txt");
    expect(contractBestandsnaam("flexi-raam", "Café & Bar")).toBe("raamovereenkomst-flexi-cafe-bar.txt");
    expect(contractBestandsnaam("flexi-arbeid", "!!!")).toBe("flexi-arbeidsovereenkomst.txt");
  });
});
