import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { boekhoudingIngevuld, toonFactuurTellers } from "@/lib/werkgever/facturen-instellingen";

// Werkgever → Facturen voor een nieuw bedrijf: geen drie vakken met "€ 0", "€ 0" en "0",
// en de instellingen voor de boekhouder (PO-nummers, e-factuur) in één inklapblok dat
// dicht is tot het bedrijf er zelf iets heeft ingevuld.

const lees = (pad: string) => readFileSync(join(process.cwd(), pad), "utf8");

describe("boekhoudingIngevuld: het inklapblok staat alleen open als er al iets is ingevuld", () => {
  it("is dicht voor een nieuw bedrijf", () => {
    expect(boekhoudingIngevuld({})).toBe(false);
    expect(boekhoudingIngevuld({ billingEmail: "", splitByCostCentre: false, costCentres: [], efactuur: {} })).toBe(false);
    expect(boekhoudingIngevuld({ billingEmail: "   ", costCentres: ["", "  "], efactuur: { automatisch: false } })).toBe(false);
  });

  it("is open bij een factuur-e-mailadres, PO-nummers of het vinkje", () => {
    expect(boekhoudingIngevuld({ billingEmail: "boekhouding@bedrijf.test" })).toBe(true);
    expect(boekhoudingIngevuld({ costCentres: ["PO-2026-001"] })).toBe(true);
    expect(boekhoudingIngevuld({ splitByCostCentre: true })).toBe(true);
  });

  it("is open bij een Peppol-adres, een mailadres van het boekhoudpakket of automatisch versturen", () => {
    expect(boekhoudingIngevuld({ efactuur: { peppolId: "0106:12345678" } })).toBe(true);
    expect(boekhoudingIngevuld({ efactuur: { ontvangstEmail: "inkoop@pakket.test" } })).toBe(true);
    expect(boekhoudingIngevuld({ efactuur: { automatisch: true } })).toBe(true);
  });
});

describe("toonFactuurTellers: de drie telvakken pas bij de eerste factuur", () => {
  it("verbergt ze zonder facturen en toont ze vanaf één", () => {
    expect(toonFactuurTellers(0)).toBe(false);
    expect(toonFactuurTellers(1)).toBe(true);
    expect(toonFactuurTellers(100)).toBe(true);
  });
});

describe("het scherm /werkgever/facturen", () => {
  const bron = lees("app/werkgever/facturen/page.tsx");

  it("toont de telvakken alleen als er een factuur is", () => {
    expect(bron).toContain("{toonFactuurTellers(invoices.length) && (");
    expect(bron.indexOf("toonFactuurTellers(invoices.length) &&")).toBeLessThan(bron.indexOf("<KpiCard"));
  });

  it("zet factuurgegevens en e-factuur samen in één inklapblok, open als er iets is ingevuld", () => {
    expect(bron.match(/<details/g)?.length).toBe(1);
    expect(bron).toContain("open={instellingenOpen}");
    expect(bron).toContain("const instellingenOpen = boekhoudingIngevuld(billing);");
    const begin = bron.indexOf("<details");
    const eind = bron.indexOf("</details>");
    const blok = bron.slice(begin, eind);
    expect(blok).toContain("{iv.moreSettings}");
    expect(blok).toContain("<BillingPrefsForm");
    expect(blok).toContain("<EfactuurSettings />");
    // het hulpcentrum linkt naar #factuurgegevens: dat anker blijft bestaan, op het blok zelf
    expect(blok).toContain('id="factuurgegevens"');
    expect(lees("lib/kennis/werkgevers-help.ts")).toContain("/werkgever/facturen#factuurgegevens");
  });

  it("klapt het blok open als de link een anker heeft (hulpcentrum → #factuurgegevens, #e-factuur)", () => {
    expect(bron).toContain('<OpenBijAnker blokId="factuurgegevens" ankers={["factuurgegevens", "e-factuur"]} />');
    expect(bron).toContain('id="e-factuur"');
    const onderdeel = lees("components/werkgever/OpenBijAnker.tsx");
    expect(onderdeel.startsWith('"use client";')).toBe(true);
    expect(onderdeel).toContain("window.location.hash");
    expect(onderdeel).toContain("blok.open = true;");
    expect(onderdeel).toContain('addEventListener("hashchange"');
    // useEffect geeft alleen een opruimfunctie terug, nooit de uitkomst van een aanroep
    expect(onderdeel).not.toMatch(/useEffect\(\(\) => [^{]/);
    expect(onderdeel).toContain("return null;");
    // een clientbestand zonder prisma, kv, mail of zod
    expect(onderdeel).not.toMatch(/from "@\/lib\/(prisma|kv|mail)|from "zod"/);
  });

  it("laat de lijst met facturen buiten het inklapblok", () => {
    expect(bron.indexOf("<InvoicesOverview")).toBeGreaterThan(bron.indexOf("</details>"));
    expect(bron).toContain("betaalwijze={betaalwijze}");
  });

  it("heeft de titel van het inklapblok in beide talen", () => {
    expect(lees("lib/i18n/dictionaries.ts")).toContain('moreSettings: "Meer instellingen voor je boekhouding"');
    expect(lees("lib/i18n/dictionary-en.ts")).toContain('moreSettings: "More settings for your bookkeeping"');
  });
});
