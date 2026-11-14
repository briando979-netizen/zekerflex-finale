import { describe, expect, it } from "vitest";
import { eersteMelding, formulierLabel, leesFormulierLabel, telFormulieren } from "@/lib/analytics/formulier-meting";
import { ontbrekendInDemo, ontbrekendVeldInDemo } from "@/lib/demo/validatie";
import { conceptOntbreekt, conceptOntbreektVeld } from "@/lib/klusconcept/concept";

// Meten of de formulierfixes van 14 nov werken: melding gezien per veld, en echt verstuurd, per formulier.

describe("formulier-meting: labels", () => {
  it("maakt alleen labels van geldige codes", () => {
    expect(formulierLabel("demo", "melding", "voornaam")).toBe("formulier:demo:melding:voornaam");
    expect(formulierLabel("klus-plaatsen", "verstuurd")).toBe("formulier:klus-plaatsen:verstuurd");
    expect(formulierLabel("demo", "melding")).toBeNull();
    expect(formulierLabel("demo", "melding", "jan@voorbeeld.test")).toBeNull();
    expect(formulierLabel("Demo Form", "verstuurd")).toBeNull();
  });

  it("telt de melding één keer per veld per sessie", () => {
    const gezien = new Set<string>();
    expect(eersteMelding(gezien, "demo", "voornaam")).toBe(true);
    expect(eersteMelding(gezien, "demo", "voornaam")).toBe(false);
    expect(eersteMelding(gezien, "demo", "email")).toBe(true);
    expect(eersteMelding(gezien, "klus-plaatsen", "voornaam")).toBe(true);
    expect(eersteMelding(gezien, "demo", "niet geldig")).toBe(false);
  });

  it("leest labels terug en telt per formulier", () => {
    expect(leesFormulierLabel("formulier:demo:melding:email")).toEqual({ formulier: "demo", soort: "melding", veld: "email" });
    expect(leesFormulierLabel("formulier:demo:verstuurd")).toEqual({ formulier: "demo", soort: "verstuurd", veld: null });
    expect(leesFormulierLabel("rekentool:klus-concept")).toBeNull();
    expect(leesFormulierLabel("formulier:demo:melding")).toBeNull();
    expect(leesFormulierLabel(null)).toBeNull();
    const t = telFormulieren([
      { label: "formulier:demo:melding:email" },
      { label: "formulier:demo:melding:email" },
      { label: "formulier:demo:melding:akkoord" },
      { label: "formulier:demo:verstuurd" },
      { label: "formulier:klus-plaatsen:melding:plaats" },
      { label: "demo-request" },
      { label: null },
    ]);
    expect(t).toEqual({
      demo: { melding: 3, velden: { email: 2, akkoord: 1 }, verstuurd: 1 },
      "klus-plaatsen": { melding: 1, velden: { plaats: 1 }, verstuurd: 0 },
    });
  });
});

describe("welk veld ontbreekt (de code achter de melding)", () => {
  const vol = { firstName: "Jan", lastName: "de Vries", email: "jan@bedrijf.test", company: "Bedrijf" };
  it("demo: het eerste lege veld, dan het e-mailadres, dan het vinkje; en de tekst blijft gelijk", () => {
    expect(ontbrekendVeldInDemo({ ...vol, firstName: "", company: "" }, true)).toBe("voornaam");
    expect(ontbrekendVeldInDemo({ ...vol, company: "" }, true)).toBe("bedrijf");
    expect(ontbrekendVeldInDemo({ ...vol, email: "jan@bedrijf" }, true)).toBe("email-ongeldig");
    expect(ontbrekendVeldInDemo(vol, false)).toBe("akkoord");
    expect(ontbrekendVeldInDemo(vol, true)).toBeNull();
    expect(ontbrekendInDemo({ ...vol, company: "" }, true)).toBe("Vul nog in: de bedrijfsnaam.");
  });

  const klus = { title: "Magazijnmedewerker", city: "Groningen", date: "2026-11-20", today: "2026-11-14", hours: 7.5 };
  it("klus-plaatsen: functie, plaats, datum, datum-verleden, tijden", () => {
    expect(conceptOntbreektVeld({ ...klus, title: "" })).toBe("functie");
    expect(conceptOntbreektVeld({ ...klus, city: "" })).toBe("plaats");
    expect(conceptOntbreektVeld({ ...klus, date: "" })).toBe("datum");
    expect(conceptOntbreektVeld({ ...klus, date: "2026-11-01" })).toBe("datum-verleden");
    expect(conceptOntbreektVeld({ ...klus, hours: 0 })).toBe("tijden");
    expect(conceptOntbreektVeld(klus)).toBeNull();
    expect(conceptOntbreekt({ ...klus, city: "" })).toBe("Vul nog in: de plaats.");
  });
});
