import { describe, expect, it } from "vitest";
import { deelTekst, routeUrl, voornaam } from "@/lib/voorstel/uitje-tekst";

describe("deel-link van een uitje", () => {
  it("maakt een leesbare uitnodigingstekst", () => {
    expect(deelTekst("Buggy rijden", "2026-11-07", "14:00")).toBe("Buggy rijden bij Het Schwarzwald, zaterdag 7 november om 14:00");
  });

  it("plant een route naar het adres", () => {
    expect(routeUrl()).toBe("https://www.google.com/maps/dir/?api=1&destination=Het%20Schwarzwald%2C%20Markeloseweg%20115%2C%207461%20PB%20Rijssen");
  });

  it("toont van de organisator alleen de voornaam", () => {
    expect(voornaam("  Rita van den Berg ")).toBe("Rita");
    expect(voornaam("")).toBe("");
  });
});
