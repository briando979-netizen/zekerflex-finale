import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { conceptCost, kostenUitUren } from "@/lib/klusconcept/concept";
import { euroTweeDecimalen, kostenBedragen } from "@/lib/klusconcept/kosten-tekst";
import { SNEL_EN, SNEL_NL } from "@/components/werkgever/snel-teksten";

// 23 nov 2026 (schermcontrole van de live site, 390 en 1366 px): bij loon € 146,25 + platformkosten € 26,25 stond als totaal "€ 173" in
// plaats van € 172,50, en bij € 121,50 + € 26,25 stond er "€ 148" in plaats van € 147,75: het totaal werd op hele euro's afgerond terwijl
// de regels erboven op de cent staan. Nu staan loon, platformkosten en totaal op twee decimalen en is het totaal precies hun som.
// Op 390 px brak "Platformkosten (7,5 uur)" over twee regels en had de scheidingslijn boven het totaal een gat in het midden.

const lees = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

/** "€ 1.172,50" of "€1,172.50" → 117250: de bedragen staan altijd op twee decimalen, dus alle cijfers achter elkaar zijn de centen. */
const centsUit = (tekst: string): number => Number(tekst.replace(/\D/g, ""));

describe("de bedragen van de kostenregel", () => {
  it("€ 146,25 loon + € 26,25 platformkosten = € 172,50 (niet € 173)", () => {
    // 7,5 uur (09:00 tot 17:00 met een half uur pauze) × € 19,50
    const k = conceptCost({ start: "09:00", end: "17:00", breakMinutes: 30, positions: 1, rateCents: 1_950 });
    expect(k.grossTotalCents).toBe(14_625);
    expect(k.feeTotalCents).toBe(2_625);
    const b = kostenBedragen(k);
    expect(b.loon).toMatch(/€\s146,25$/);
    expect(b.platform).toMatch(/€\s26,25$/);
    expect(b.totaal).toMatch(/€\s172,50$/);
    expect(b.totaalCents).toBe(17_250);
  });

  it("€ 121,50 loon + € 26,25 platformkosten = € 147,75 (niet € 148)", () => {
    const k = conceptCost({ start: "09:00", end: "17:00", breakMinutes: 30, positions: 1, rateCents: 1_620 });
    expect(k.grossTotalCents).toBe(12_150);
    const b = kostenBedragen(k);
    expect(b.loon).toMatch(/€\s121,50$/);
    expect(b.platform).toMatch(/€\s26,25$/);
    expect(b.totaal).toMatch(/€\s147,75$/);
  });

  it("toont altijd twee decimalen, ook bij hele bedragen en duizendtallen, in het Nederlands en het Engels", () => {
    expect(euroTweeDecimalen(17_250)).toMatch(/^€\s172,50$/);
    expect(euroTweeDecimalen(20_000)).toMatch(/^€\s200,00$/);
    expect(euroTweeDecimalen(117_250)).toMatch(/^€\s1\.172,50$/);
    expect(euroTweeDecimalen(5)).toMatch(/^€\s0,05$/);
    expect(euroTweeDecimalen(17_250, "en")).toBe("€172.50");
    expect(euroTweeDecimalen(20_000, "en")).toBe("€200.00");
    expect(euroTweeDecimalen(117_250, "en")).toBe("€1,172.50");
  });

  it("de som klopt altijd op de cent met wat er staat, voor veel uren, mensen, dagen en tarieven", () => {
    let gecontroleerd = 0;
    for (let kwartier = 1; kwartier <= 48; kwartier += 1) {
      const hours = kwartier / 4;
      for (const positions of [1, 3, 25]) {
        for (const days of [1, 5]) {
          for (let rateCents = 1_620; rateCents <= 4_000; rateCents += 420) {
            const k = kostenUitUren({ hours, positions, rateCents, days });
            for (const taal of ["nl", "en"] as const) {
              const b = kostenBedragen(k, taal);
              // wat er staat: loon + platformkosten = totaal, op de cent
              expect(centsUit(b.loon) + centsUit(b.platform), `${hours} uur × ${positions} × ${days} dagen à ${rateCents}`).toBe(centsUit(b.totaal));
              // en dat is ook wat de rekenregel zegt (nooit eerst afronden en dan optellen)
              expect(centsUit(b.totaal)).toBe(k.totalCents);
              expect(b.totaalCents).toBe(k.totalCents);
              // altijd twee decimalen
              for (const t of [b.loon, b.platform, b.totaal]) expect(t).toMatch(taal === "nl" ? /,\d{2}$/ : /\.\d{2}$/);
            }
            gecontroleerd += 1;
          }
        }
      }
    }
    expect(gecontroleerd).toBeGreaterThan(1_000);
  });

  it("rondt eerst elk bedrag op hele centen en telt dan op, zodat de regels samen het totaal geven", () => {
    const b = kostenBedragen({ grossTotalCents: 10_049.6, feeTotalCents: 2_625.4 });
    expect(b.totaalCents).toBe(12_675);
    expect(centsUit(b.loon) + centsUit(b.platform)).toBe(centsUit(b.totaal));
    expect(b.totaal).toMatch(/€\s126,75$/);
  });

  it("zonder uren of tarief is alles € 0,00", () => {
    const b = kostenBedragen(kostenUitUren({ hours: 0, positions: 1, rateCents: 1_700 }));
    expect([b.loon, b.platform, b.totaal].every((t) => /€\s0,00$/.test(t))).toBe(true);
  });
});

describe("de kostenregel op het scherm (bron-controle)", () => {
  const lijst = lees("components/app/KostenLijst.tsx");

  it("de eerste kolom neemt de ruimte die over is, zodat het label op een telefoon op één regel past", () => {
    expect(lijst).toContain("grid-cols-[minmax(0,1fr)_auto]");
    expect(lijst).not.toContain("grid-cols-2");
  });

  it("de scheidingslijn boven het totaal is één doorlopende lijn over beide kolommen (geen rand op elke cel)", () => {
    expect(lijst.match(/border-t/g)).toHaveLength(1);
    expect(lijst).toContain('<div className="col-span-2 flex items-baseline justify-between gap-4 border-t border-hair pt-2">');
    // het totaal (dt en dd) staat in die div: een div met dt en dd mag in een dl
    expect(lijst).toMatch(/border-t border-hair pt-2">\s*<dt[^>]*>\{totaalLabel\}<\/dt>\s*<dd[^>]*>\{totaal\}<\/dd>\s*<\/div>/);
  });

  it("het label is kort: 'Platformkosten, 7,5 uur' in plaats van 'Platformkosten (7,5 uur)'", () => {
    expect(SNEL_NL.kostenPlatform).toBe("Platformkosten, {u} uur");
    expect(SNEL_EN.kostenPlatform).toBe("Platform fee, {u} hours");
    expect(SNEL_NL.kostenPlatform.replace("{u}", "7,5").length).toBeLessThanOrEqual(24);
    const concept = lees("components/marketing/KlusConcept.tsx");
    expect(concept).toContain("platformLabel={`Platformkosten, ${uurNl(cost.totalHours)} uur`}");
    expect(concept).not.toMatch(/Platformkosten \(/);
  });

  it("/klus-plaatsen, de klus-wizard en Snel een klus plaatsen gebruiken dezelfde lijst en dezelfde bedragen", () => {
    const concept = lees("components/marketing/KlusConcept.tsx");
    const snel = lees("components/werkgever/SnelPlaatsen.tsx");
    const wizard = lees("components/app/NewShiftForm.tsx");
    expect(concept).toContain("const bedragen = kostenBedragen(cost);");
    expect(concept).toContain("totaal={bedragen.totaal}");
    expect(snel).toContain("const bedragen = kostenBedragen(kosten, locale);");
    expect(wizard).toContain("const bedragen = kostenBedragen(kosten,");
    for (const [naam, bron] of [["KlusConcept", concept], ["SnelPlaatsen", snel], ["NewShiftForm", wizard]] as const) {
      expect(bron, naam).toContain("<KostenLijst");
      expect(bron, naam).not.toMatch(/euroWhole\(/);
      expect(bron, naam).not.toMatch(/<dd[^>]*>\{euroCents\(/);
    }
  });
});
