import { describe, expect, it } from "vitest";
import { controleerAanmelding, isPlekSoort, plekSoortNl, schoneTelefoon, schoneWebsite } from "@/lib/kaart/aanmelden";

const basis = { naam: "Bakkerij Jansen", soort: "winkel", adres: "Dorpsstraat 1, 1234 AB Dorp" };

describe("schoneWebsite", () => {
  it("laat alleen https toe en haalt de slash weg", () => {
    expect(schoneWebsite("https://jansen.nl/")).toBe("https://jansen.nl");
    expect(schoneWebsite("jansen.nl")).toBe("https://jansen.nl");
  });
  it("weigert http, javascript:, wachtwoorden en hosts zonder punt", () => {
    expect(schoneWebsite("http://jansen.nl")).toBe("");
    expect(schoneWebsite("javascript:alert(1)")).toBe("");
    expect(schoneWebsite("https://gebruiker:wachtwoord@jansen.nl")).toBe("");
    expect(schoneWebsite("https://localhost")).toBe("");
  });
});

describe("schoneTelefoon", () => {
  it("accepteert gewone nummers en weigert letters of te korte nummers", () => {
    expect(schoneTelefoon("+31 20 123 4567")).toBe("+31 20 123 4567");
    expect(schoneTelefoon("020-1234567")).toBe("020-1234567");
    expect(schoneTelefoon("bel mij")).toBe("");
    expect(schoneTelefoon("123")).toBe("");
  });
});

describe("controleerAanmelding", () => {
  it("accepteert een nette aanmelding", () => {
    const r = controleerAanmelding({ ...basis, website: "jansen.nl", omschrijving: "  Vers brood \n elke dag  " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.waarde.website).toBe("https://jansen.nl");
      expect(r.waarde.omschrijving).toBe("Vers brood elke dag");
      expect(r.waarde.telefoon).toBe("");
    }
  });
  it("geeft Nederlandse fouten bij ontbrekende of foute velden", () => {
    expect(controleerAanmelding({ ...basis, naam: "" })).toEqual({ ok: false, fout: "Vul de naam van je bedrijf in." });
    expect(controleerAanmelding({ ...basis, soort: "constructor" })).toEqual({ ok: false, fout: "Kies wat voor bedrijf het is." });
    expect(controleerAanmelding({ ...basis, adres: "x" }).ok).toBe(false);
    expect(controleerAanmelding({ ...basis, website: "http://jansen.nl" }).ok).toBe(false);
  });
  it("zet een telefoonnummer pas op de kaart met uitdrukkelijke toestemming", () => {
    expect(controleerAanmelding({ ...basis, telefoon: "020 123 4567" }).ok).toBe(false);
    expect(controleerAanmelding({ ...basis, telefoon: "020 123 4567", toestemming: "true" }).ok).toBe(false);
    expect(controleerAanmelding({ ...basis, telefoon: "020 123 4567", toestemming: true }).ok).toBe(true);
  });
  it("kapt een te lange omschrijving af op 200 tekens", () => {
    const r = controleerAanmelding({ ...basis, omschrijving: "a".repeat(500) });
    expect(r.ok && r.waarde.omschrijving.length).toBe(200);
  });
});

describe("soorten", () => {
  it("kent alleen eigen sleutels", () => {
    expect(isPlekSoort("horeca")).toBe(true);
    expect(isPlekSoort("constructor")).toBe(false);
    expect(plekSoortNl("constructor")).toBe("Bedrijf");
  });
});
