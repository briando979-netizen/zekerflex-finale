import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";

// Bedrijfsprofiel (/werkgever/bedrijf), 20 nov 2026: rustiger voor een bedrijf dat net begint. De vijf staffels staan
// ingeklapt, het voorschot staat er alleen als het kan en de uitleg bij snelle uitbetaling is gewone taal.

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

describe("bedrijfsprofiel: staffelkorting", () => {
  const kaart = lees("components/werkgever/VolumeCard.tsx");

  it("de vijf treden staan in een inklapbaar deel dat standaard dicht is", () => {
    const begin = kaart.indexOf("<details>");
    const eind = kaart.indexOf("</details>");
    expect(begin).toBeGreaterThan(-1);
    expect(eind).toBeGreaterThan(begin);
    const deel = kaart.slice(begin, eind);
    expect(deel).toContain("{v.alleStaffels}</summary>");
    expect(deel).toContain("d.tiers.map(");
    // de treden staan nergens buiten het inklapbare deel, en het deel staat niet vanzelf open
    expect(kaart.match(/d\.tiers\.map\(/g)?.length).toBe(1);
    expect(kaart).not.toMatch(/<details[^>]*\bopen\b/);
  });

  it("kop, tarief per uur en de regel tot de volgende trede blijven altijd zichtbaar", () => {
    const boven = kaart.slice(0, kaart.indexOf("<details>"));
    for (const stuk of ["{v.kop}", "euro(d.feePerHourCents, loc)", "v.perUurStaffel", "v.urenMaand", "v.nogTot", "v.hoogste"]) {
      expect(boven, stuk).toContain(stuk);
    }
  });

  it("de kaart heeft geen eigen tarieven: de treden en bedragen komen van de server", () => {
    expect(kaart).toContain('fetch("/api/werkgever/volume"');
    expect(kaart).toContain("d.baseFeePerHourCents * t.factor");
    expect(lees("app/api/werkgever/volume/route.ts")).toContain("tiers: VOLUME_TIERS");
  });

  it("de knop heet in beide talen gewoon wat hij doet", () => {
    expect(nl.volumeKaart.alleStaffels).toBe("Bekijk alle staffels");
    expect(en.volumeKaart.alleStaffels).toBe("View all tiers");
  });
});

describe("bedrijfsprofiel: snelle uitbetaling", () => {
  it("de uitleg is twee gewone zinnen zonder vaktaal, in beide talen", () => {
    expect(nl.fastPayForm.uitleg).not.toMatch(/betaalprovider|kredietcheck|Handelsregister|betaalgedrag|bijschrijving|\+/i);
    expect(en.fastPayForm.uitleg).not.toMatch(/payment provider|credit check|Trade Register|\+/i);
    for (const tekst of [nl.fastPayForm.uitleg, en.fastPayForm.uitleg]) {
      expect(tekst.split(". ").length).toBe(2);
      expect(tekst.endsWith(".")).toBe(true);
    }
  });

  it("de uitleg zegt nog hetzelfde en belooft niets nieuws", () => {
    const u = nl.fastPayForm.uitleg;
    expect(u).toContain("meteen of binnen 3 werkdagen na jouw goedkeuring");
    expect(u).toContain("laten indienen");
    expect(u).toContain("ZekerFlex neemt hun factuur over");
    expect(u).toContain("op je eigen termijn");
    expect(u).toContain("hangt ook af van de betaaldienst en hun bank");
    expect(u).toContain("inschrijving bij de KVK");
    expect(u).toContain("op tijd betaalt");
    expect(u).not.toMatch(/gegarandeerd|altijd|binnen 1 minuut|direct op (je|hun) rekening/i);
    expect(en.fastPayForm.uitleg).not.toMatch(/guaranteed|always|instantly/i);
  });

  it("het vinkje werkt zoals het werkte en het voorschot staat er alleen als het kan", () => {
    const scherm = lees("components/werkgever/FastPaySettings.tsx");
    expect(scherm).toContain("onChange={(e) => save({ offerFastPay: e.target.checked })}");
    expect(scherm).toContain("onChange={(e) => save({ advancesForUitzend: e.target.checked })}");
    expect(scherm).toContain("s.voorschotKan ?");
    expect("voorschotNiet" in nl.fastPayForm).toBe(false);
    expect("voorschotNiet" in en.fastPayForm).toBe(false);
  });
});
