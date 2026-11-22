import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adresUitKeuze } from "@/lib/geo/adres-keuze";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";

// Een vestiging toevoegen (components/werkgever/VestigingFormulier.tsx). 22 nov 2026, gebruikersonderzoek B16–B19: wie
// "Grote Markt 1, 9712HN Groningen" koos, moest postcode en plaats nog eens typen (anders bleef "Opslaan" grijs), de velden
// hadden geen label en er stonden GPS-coördinaten onder het adres.

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("een gekozen adres → de velden van de vestiging", () => {
  it("neemt postcode en plaats van PDOK over en houdt alleen straat en huisnummer als adresregel", () => {
    expect(adresUitKeuze({ label: "Grote Markt 1, 9712HN Groningen", postcode: "9712HN", plaats: "Groningen" })).toEqual({
      straat: "Grote Markt 1",
      postcode: "9712HN",
      plaats: "Groningen",
    });
  });

  it("zonder postcode (een straat of plaats) blijft de hele naam staan en blijven postcode en plaats leeg of zoals PDOK ze gaf", () => {
    expect(adresUitKeuze({ label: "Grote Markt, Groningen", plaats: "Groningen" })).toEqual({ straat: "Grote Markt, Groningen", postcode: "", plaats: "Groningen" });
    expect(adresUitKeuze({ label: "  Damrak 1  ", postcode: null, plaats: null })).toEqual({ straat: "Damrak 1", postcode: "", plaats: "" });
  });
});

describe("het formulier", () => {
  const form = lees("components/werkgever/VestigingFormulier.tsx");

  it("elk veld heeft een gekoppeld label", () => {
    for (const veld of ["adres", "postcode", "plaats", "naam", "kostenplaats"]) {
      expect(form, veld).toContain(`htmlFor={\`\${id}-${veld}\`}`);
      expect(form, veld).toContain(`id={\`\${id}-${veld}\`}`);
    }
    // een melding wordt voorgelezen
    expect(form).toContain('role="alert"');
  });

  it("zoekt alleen echte adressen en vult postcode, plaats en (als die leeg is) de naam zelf in", () => {
    expect(form).toContain("alleenAdressen");
    expect(form).toContain("setPostalCode(velden.postcode)");
    expect(form).toContain("setCity(velden.plaats)");
    expect(form).toContain("setName((nu) => (nu.trim() ? nu : velden.plaats))");
    const zoeker = lees("components/app/AddressAutocomplete.tsx");
    expect(zoeker).toContain('alleenAdressen ? "&soort=adres" : ""');
    // geen coördinaten meer onder het adres
    expect(zoeker).not.toMatch(/toFixed\(5\)/);
  });

  it("Locaties en Klus uitzetten gebruiken hetzelfde formulier", () => {
    expect(lees("components/app/BranchesBoard.tsx")).toContain("<VestigingFormulier");
    expect(lees("components/werkgever/EersteVestiging.tsx")).toContain("<VestigingFormulier");
    // de plaats van een klus die al klaarstaat (/klus-plaatsen) staat alvast in de zoeker
    expect(lees("components/werkgever/EersteVestiging.tsx")).toContain('beginPlaats={concept?.city ?? ""}');
  });

  it("de teksten staan in het Nederlands en het Engels", () => {
    expect(Object.keys(en.vestigingForm).sort()).toEqual(Object.keys(nl.vestigingForm).sort());
    for (const v of Object.values(nl.vestigingForm)) expect(v.trim()).not.toBe("");
  });
});
