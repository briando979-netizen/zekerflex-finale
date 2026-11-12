import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bevestigOverzicht, type OverzichtInvoer } from "@/lib/werker/bevestig-overzicht";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

// Vóór het insturen van de verificatie vraagt het scherm: "Weet je zeker dat je alles hebt ingevuld?", met een overzicht van
// wat er wordt ingestuurd en "Terug" / "Ja, insturen" in een eigen dialoog (geen window.confirm).

const LABELS: OverzichtInvoer["labels"] = { naam: "Naam op document", soort: "Soort", nummer: "Nummer", geldigTot: "Geldig tot", kvk: "KVK", btw: "Btw", postcode: "Postcode", fotos: "Foto's", methode: "Manier" };
const maakVeld = (w: Record<string, string>) => (n: string) => w[n] ?? "";

const basis = (over: Partial<OverzichtInvoer> = {}): OverzichtInvoer => ({
  methode: "upload",
  veld: maakVeld({ nameOnDocument: " Jan de Vries ", documentNumber: "NX1234567", documentExpiry: "2030-05-01", kvkNumber: "12345678", postalCode: "1011AB" }),
  labels: LABELS,
  soortNaam: "ID-kaart",
  bedrijf: "kvk",
  fotoNamen: ["de voorkant", "de achterkant", "de selfie"],
  viaStripe: "Via Stripe",
  ...over,
});

describe("overzicht van wat je instuurt", () => {
  it("bij zelf foto's insturen: naam, document, nummer, geldigheid, foto's, bedrijf en postcode", () => {
    expect(bevestigOverzicht(basis())).toEqual([
      ["Naam op document", "Jan de Vries"],
      ["Soort", "ID-kaart"],
      ["Nummer", "NX1234567"],
      ["Geldig tot", "2030-05-01"],
      ["Foto's", "de voorkant, de achterkant, de selfie"],
      ["KVK", "12345678"],
      ["Postcode", "1011AB"],
    ]);
  });

  it("een verplicht documentveld dat leeg is staat als streepje in het overzicht (de controle ervóór vangt het eerst)", () => {
    const rijen = bevestigOverzicht(basis({ veld: maakVeld({}) }));
    expect(rijen.filter(([, w]) => w === "—").map(([l]) => l)).toEqual(["Naam op document", "Nummer", "Geldig tot"]);
  });

  it("bij Stripe: de manier van controleren en het bedrijf, geen documentgegevens of foto's", () => {
    const rijen = bevestigOverzicht(basis({ methode: "stripe", fotoNamen: [] }));
    expect(rijen).toEqual([
      ["Manier", "Via Stripe"],
      ["KVK", "12345678"],
      ["Postcode", "1011AB"],
    ]);
  });

  it("een btw-nummer krijgt het btw-label; zonder bedrijf of zonder waarde komt er geen rij", () => {
    const btw = bevestigOverzicht(basis({ bedrijf: "vat", veld: maakVeld({ vatNumber: "NL123456789B01" }) }));
    expect(btw).toContainEqual(["Btw", "NL123456789B01"]);
    expect(bevestigOverzicht(basis({ bedrijf: null })).some(([l]) => l === "KVK" || l === "Btw")).toBe(false);
    expect(bevestigOverzicht(basis({ veld: maakVeld({ postalCode: "" }) })).some(([l]) => l === "Postcode")).toBe(false);
  });
});

describe("de dialoog in het verificatiescherm", () => {
  const ROOT = process.cwd();
  const form = readFileSync(path.join(ROOT, "components/app/OnboardingForm.tsx"), "utf8");
  const sheet = readFileSync(path.join(ROOT, "components/app/OnderSheet.tsx"), "utf8");

  it("gebruikt geen window.confirm maar de eigen sheet met dialoogrol, Escape en focus (OnderSheet + useDialog)", () => {
    expect(form).not.toMatch(/window\.confirm\(|[^\w.]confirm\(/);
    expect(form).toContain("<OnderSheet");
    expect(sheet).toContain('role="dialog"');
    expect(sheet).toContain('aria-modal="true"');
    expect(sheet).toContain("useDialog");
  });

  it("verstuurt pas na 'Ja, insturen': eerst het overzicht, dan verstuur(m, true)", () => {
    // sinds 13 nov alleen nog Stripe: de bestandskeuze is weg, de eigen scan heeft een eigen bevestiging (bevestig-idscan)
    expect(form).toContain("async function verstuur(m: \"stripe\", bevestigd = false)");
    expect(form).toContain("if (!bevestigd) {");
    expect(form).toContain("void verstuur(m, true)");
    // het overzicht komt na de controle van de velden, vóór de aanroep naar de server
    expect(form.indexOf("if (!bevestigd) {")).toBeGreaterThan(form.indexOf("if (!valideer(new FormData(form), { documenten: false"));
    expect(form.indexOf("if (!bevestigd) {")).toBeLessThan(form.indexOf('fetch("/api/onboarding", { method: "POST", body });', form.indexOf("if (!bevestigd) {")));
  });

  it("'Terug' en Escape sluiten zonder te versturen", () => {
    expect(form).toContain("onSluit={() => setBevestig(null)}");
    expect(form).toContain("{ft.bevestig.terug}");
    expect(form).toContain("{ft.bevestig.ja}");
  });
});

describe("de vraag in vijf talen", () => {
  it("titel, uitleg en knoppen bestaan in elke taal en zijn echt vertaald", () => {
    const nl = FREELANCER_DICTS.nl.bevestig;
    for (const taal of ["nl", "en", "pl", "ro", "uk"] as const) {
      const b = FREELANCER_DICTS[taal].bevestig;
      for (const sleutel of ["titel", "uitleg", "terug", "ja", "postcode", "fotos", "methode", "viaStripe"] as const) {
        expect(b[sleutel].trim().length, `${taal} ${sleutel}`).toBeGreaterThan(1);
      }
      if (taal !== "nl") {
        expect(b.titel, taal).not.toBe(nl.titel);
        expect(b.ja, taal).not.toBe(nl.ja);
      }
    }
  });
});
