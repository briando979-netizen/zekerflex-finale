import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { kostenBedragen } from "@/lib/klusconcept/kosten-tekst";
import { kostenUitUren } from "@/lib/klusconcept/concept";
import { bedragTekst, centsUitTarief, geldTekst, tariefInvoer, tariefWeergave, urenTekst } from "@/lib/klusconcept/weergave";

// 23 nov 2026 (schermcontrole van de live wizard, 390 en 1366 px): "Bruto per plek € 146" had geen decimalen terwijl de kostenregel
// "€ 146,25" toonde, en "Duur 7.5 u" en het uurtariefveld "19.50" gebruikten een punt terwijl de rest een komma gebruikt. Eén hulpje
// voor geld, uren en het tariefveld per taal: Nederlands komma, Engels punt, geld op twee decimalen.

const lees = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

describe("geld per taal", () => {
  it("altijd twee decimalen: € 146,25 (Nederlands) en €146.25 (Engels)", () => {
    expect(geldTekst(14_625)).toMatch(/^€\s146,25$/);
    expect(geldTekst(14_625, "en")).toBe("€146.25");
    expect(geldTekst(14_600)).toMatch(/^€\s146,00$/);
    expect(geldTekst(14_600, "en")).toBe("€146.00");
  });

  it("zonder euroteken voor een tekst die het teken zelf heeft ('€ {bedrag}/u')", () => {
    expect(bedragTekst(1_950)).toBe("19,50");
    expect(bedragTekst(1_950, "en")).toBe("19.50");
    expect(bedragTekst(1_620)).toBe("16,20");
    expect(bedragTekst(1_700)).toBe("17,00");
  });

  it("'Bruto per plek' is hetzelfde bedrag als 'Loon kracht' in de kostenregel", () => {
    // 7,5 uur × € 19,50 = € 146,25 voor één plek op één dag
    const hours = 7.5;
    const rateCents = 1_950;
    const grossPerSeat = Math.round(hours * rateCents);
    const regel = kostenBedragen(kostenUitUren({ hours, positions: 1, rateCents }));
    expect(geldTekst(grossPerSeat)).toBe(regel.loon);
    expect(geldTekst(grossPerSeat, "en")).toBe(kostenBedragen(kostenUitUren({ hours, positions: 1, rateCents }), "en").loon);
  });
});

describe("uren per taal", () => {
  it("een komma in het Nederlands en een punt in het Engels, hele uren zonder decimalen, nooit meer dan twee", () => {
    expect(urenTekst(7.5)).toBe("7,5");
    expect(urenTekst(7.5, "en")).toBe("7.5");
    expect(urenTekst(8)).toBe("8");
    expect(urenTekst(7.25)).toBe("7,25");
    expect(urenTekst(7.25, "en")).toBe("7.25");
    expect(urenTekst(7.333)).toBe("7,33");
    expect(urenTekst(0)).toBe("0");
    expect(urenTekst(Number.NaN)).toBe("0");
  });
});

describe("het tariefveld", () => {
  it("toont een komma in het Nederlands en een punt in het Engels", () => {
    expect(tariefWeergave("19.50", "nl")).toBe("19,50");
    expect(tariefWeergave("19.50", "en")).toBe("19.50");
    expect(tariefWeergave("19.", "nl")).toBe("19,");
    expect(tariefWeergave("", "nl")).toBe("");
  });

  it("neemt wat de bezoeker typt over als waarde met een punt: komma of punt, hooguit twee decimalen", () => {
    expect(tariefInvoer("19,5")).toBe("19.5");
    expect(tariefInvoer("19.50")).toBe("19.50");
    expect(tariefInvoer("€ 19")).toBe("19");
    expect(tariefInvoer("19,")).toBe("19.");
    expect(tariefInvoer("19,555")).toBe("19.55");
    expect(tariefInvoer("1,2,3")).toBe("1.23");
    expect(tariefInvoer(",5")).toBe(".5");
    expect(tariefInvoer("abc")).toBe("");
    expect(tariefInvoer("")).toBe("");
  });

  it("rekent het tarief om naar hele centen; leeg of onleesbaar is 0 en nooit NaN", () => {
    expect(centsUitTarief("19.5")).toBe(1_950);
    expect(centsUitTarief("19.50")).toBe(1_950);
    expect(centsUitTarief("19.")).toBe(1_900);
    expect(centsUitTarief(".5")).toBe(50);
    expect(centsUitTarief("16.2")).toBe(1_620);
    expect(centsUitTarief("0.07")).toBe(7);
    expect(centsUitTarief("")).toBe(0);
    expect(centsUitTarief(".")).toBe(0);
  });

  it("wat het veld toont en de bezoeker terugtypt, geeft hetzelfde tarief (beide talen, elke tien cent)", () => {
    for (const taal of ["nl", "en"] as const) {
      for (let cents = 1_000; cents <= 6_000; cents += 5) {
        const bewaard = (cents / 100).toFixed(2);
        const getoond = tariefWeergave(bewaard, taal);
        expect(getoond, `${taal} ${cents}`).toMatch(taal === "nl" ? /^\d+,\d{2}$/ : /^\d+\.\d{2}$/);
        expect(centsUitTarief(tariefInvoer(getoond)), `${taal} ${cents}`).toBe(cents);
      }
    }
  });
});

describe("de wizard en het voorbeeld gebruiken het hulpje (bron-controle)", () => {
  const form = lees("components/app/NewShiftForm.tsx");

  it("het uurtariefveld is een tekstveld met decimaaltoetsenbord en toont komma of punt volgens de taal", () => {
    expect(form).toContain('inputMode="decimal"');
    expect(form).toContain("value={tariefWeergave(rateEuro, taal)}");
    expect(form).toContain("onChange={(e) => setRateEuro(tariefInvoer(e.target.value))}");
    expect(form).not.toContain('step="0.10"');
    // het bewaarde tarief (en dus het bedrag dat naar de server gaat) blijft hetzelfde: hele centen
    expect(form).toContain("const hourlyRateCents = centsUitTarief(rateEuro);");
    expect(form).toContain('<input type="hidden" name="hourlyRateCents"');
  });

  it("het voorbeeld toont tarief, duur en bruto per plek met dezelfde hulpjes, in de taal van de pagina", () => {
    expect(form).toContain("const taal: WeergaveTaal = locale === \"en\" ? \"en\" : \"nl\";");
    expect(form).toContain("bedrag: bedragTekst(hourlyRateCents, taal)");
    expect(form).toContain("u: urenTekst(hours, taal)");
    expect(form).toContain("geldTekst(grossPerSeat, taal)");
    // het minimum: in Nederland minRateCents, bij een werklocatie in België het Belgische (minRate, lib/belgie/lonen.ts)
    expect(form).toContain("min: bedragTekst(minRate, taal)");
    expect(form).toContain("const minRate = beKlus ? belgischMinimumCents(beSoort, beHoreca) : minRateCents;");
    // geen eigen opmaak meer: geen komma-hulpje, geen hele euro's, geen ruwe getallen in de tekst
    expect(form).not.toContain("komma(");
    expect(form).not.toContain(".toFixed(0)");
    expect(form).not.toContain("{ u: hours }");
  });

  it("Snel een klus plaatsen toont het uurtarief ook met het hulpje", () => {
    expect(lees("components/werkgever/SnelPlaatsen.tsx")).toContain("const tariefLabel = geldTekst(tariefCent, locale);");
  });
});
