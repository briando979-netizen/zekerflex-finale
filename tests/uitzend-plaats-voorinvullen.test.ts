import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { plaatsBijPostcode } from "@/lib/geo/thuisbasis-plek";

// De uitzendovereenkomst vraagt geboortedatum en woonadres. Wat de werker bij "Je gegevens" al gaf, staat er vooraf in:
// de geboortedatum en de postcode (API), en sinds 15 nov ook de woonplaats bij die postcode (zelfde opzoekhulp als
// "Waar woon je?"), zodat de werker niets twee keer typt.

const kaart = readFileSync(join(process.cwd(), "components/app/UitzendContractCard.tsx"), "utf8").replace(/\r\n/g, "\n");
const route = readFileSync(join(process.cwd(), "app/api/me/uitzend/gegevens/route.ts"), "utf8").replace(/\r\n/g, "\n");

describe("uitzendovereenkomst: vooraf ingevuld", () => {
  it("geboortedatum en postcode komen uit wat de werker al gaf", () => {
    expect(route).toContain("geboortedatum: fiscal.birthDate");
    expect(route).toContain("postcodeVoorstel: netteNlPostcode(profiel?.homePostalCode");
  });

  it("de woonplaats wordt bij de postcode gezocht, alleen als er nog geen adres is en zonder iets te overschrijven", () => {
    expect(kaart).toContain("if (!d.woonadres && d.postcodeVoorstel) {");
    expect(kaart).toContain("plaatsBijPostcode(data?.results, pc)");
    expect(kaart).toContain("vorig.plaats || vorig.postcode !== pc ? vorig : { ...vorig, plaats }");
  });

  it("plaatsBijPostcode kiest de plaats bij precies die postcode", () => {
    const resultaten = [
      { label: "Dam 1, 1012 JS Amsterdam", lat: 52.37, lng: 4.89, postcode: "1012 JS", plaats: "Amsterdam" },
      { label: "Ergens 2, 9711 AA Groningen", lat: 53.2, lng: 6.56, postcode: "9711 AA", plaats: "Groningen" },
    ];
    expect(plaatsBijPostcode(resultaten, "1012 JS")).toBe("Amsterdam");
    expect(plaatsBijPostcode([], "1012 JS")).toBeNull();
  });
});
