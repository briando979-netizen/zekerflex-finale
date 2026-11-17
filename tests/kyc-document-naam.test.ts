import { describe, expect, it } from "vitest";
import { ROEPNAMEN, documentNaamPast, naamveldVol, vouwLetters } from "@/lib/kyc/document-naam";

// Verzonnen namen in echte vormen (zoals de MRZ ze geeft: hoofdletters, zonder accenten, voornamen in één veld).
// 17 nov 2026: soepeler op de voornaam (elke voornaam, verkorting, roepnaam, voorletters, MRZ-omzetting, afkapping);
// de achternaam blijft streng en de documentcontrole zelf (MRZ, chip, gezicht) staat hier los van.

describe("naam op het document tegen het account (review M3)", () => {
  it("dezelfde persoon, anders geschreven", () => {
    expect(documentNaamPast("Briando van Essen", { achternaam: "VAN ESSEN", voornamen: "BRIANDO" })).toBe(true);
    expect(documentNaamPast("Jan Jansen", { achternaam: "JANSEN", voornamen: "JAN PIETER HENDRIK" })).toBe(true);
    expect(documentNaamPast("Bilal Elbouti", { achternaam: "EL BOUTI", voornamen: "BILAL" })).toBe(true);
    expect(documentNaamPast("Zoë Müller", { achternaam: "MULLER", voornamen: "ZOE" })).toBe(true);
    // volgorde en hoofdletters maken niet uit
    expect(documentNaamPast("de Vries, Anna", { achternaam: "DE VRIES", voornamen: "ANNA MARIA" })).toBe(true);
    expect(documentNaamPast("ANNA DE VRIES", { achternaam: "De Vries", voornamen: "Anna" })).toBe(true);
  });

  it("een gedeelde achternaam is niet genoeg", () => {
    expect(documentNaamPast("Jan Jansen", { achternaam: "JANSEN", voornamen: "PIET" })).toBe(false);
    expect(documentNaamPast("Piet Jansen", { achternaam: "JANSEN", voornamen: "JAN" })).toBe(false);
    expect(documentNaamPast("Jan Jansen", { achternaam: "JANSEN", voornamen: "JANNEKE" })).toBe(false);
  });

  it("een gedeelde voornaam ook niet: de achternaam blijft streng", () => {
    expect(documentNaamPast("Jan Jansen", { achternaam: "DE VRIES", voornamen: "JAN" })).toBe(false);
    expect(documentNaamPast("Jan Jansen", { achternaam: "JANSE", voornamen: "JAN" })).toBe(false);
    expect(documentNaamPast("Jan Jansen-Smit", { achternaam: "SMIT DE VRIES", voornamen: "JAN" })).toBe(false);
  });

  it("de roepnaam is een tweede of derde voornaam op het document (gemeten: de meest voorkomende reden)", () => {
    expect(documentNaamPast("Pieter Jansen", { achternaam: "JANSEN", voornamen: "JAN PIETER KAREL" })).toBe(true);
    expect(documentNaamPast("Maria de Boer", { achternaam: "DE BOER", voornamen: "ANNA MARIA THERESIA" })).toBe(true);
  });

  it("een bekende roepnaam bij de officiële voornaam", () => {
    expect(documentNaamPast("Hans de Boer", { achternaam: "DE BOER", voornamen: "JOHANNES" })).toBe(true);
    expect(documentNaamPast("Kees Bakker", { achternaam: "BAKKER", voornamen: "CORNELIS WILLEM" })).toBe(true);
    expect(documentNaamPast("Els Smit", { achternaam: "SMIT", voornamen: "ELISABETH" })).toBe(true);
    expect(documentNaamPast("Mohamed El Amrani", { achternaam: "EL AMRANI", voornamen: "MOHAMMED" })).toBe(true);
    // een roepnaam zonder enig verband met de officiële naam: een mens kijkt
    expect(documentNaamPast("Bo de Boer", { achternaam: "DE BOER", voornamen: "JOHANNES" })).toBe(false);
    expect(documentNaamPast("Hans de Boer", { achternaam: "DE BOER", voornamen: "CORNELIS" })).toBe(false);
  });

  it("de lijst roepnamen is klein, zonder accenten en wijst alleen naar officiële namen", () => {
    for (const [roep, officieel] of Object.entries(ROEPNAMEN)) {
      expect(roep).toMatch(/^[a-z]+$/);
      expect(officieel.length).toBeGreaterThan(0);
      for (const o of officieel) expect(o).toMatch(/^[a-z]+$/);
    }
  });

  it("een verkorting met dezelfde letters, minstens vier", () => {
    expect(documentNaamPast("Alex Vermeer", { achternaam: "VERMEER", voornamen: "ALEXANDER" })).toBe(true);
    expect(documentNaamPast("Chris van Dijk", { achternaam: "VAN DIJK", voornamen: "CHRISTIAAN" })).toBe(true);
    expect(documentNaamPast("Fred Kok", { achternaam: "KOK", voornamen: "FREDERIK" })).toBe(true);
    // drie letters is geen verkorting (anders is "Jan" ook "Janneke"); korte roepnamen staan in de lijst
    expect(documentNaamPast("Max Kok", { achternaam: "KOK", voornamen: "MAXIMILIAAN" })).toBe(true);
    expect(documentNaamPast("Jan Kok", { achternaam: "KOK", voornamen: "JANNEKE" })).toBe(false);
  });

  it("alleen voorletters in het account", () => {
    expect(documentNaamPast("J. de Vries", { achternaam: "DE VRIES", voornamen: "JOHANNES" })).toBe(true);
    expect(documentNaamPast("J.P. de Vries", { achternaam: "DE VRIES", voornamen: "JOHANNES PETRUS" })).toBe(true);
    expect(documentNaamPast("K. de Vries", { achternaam: "DE VRIES", voornamen: "JOHANNES" })).toBe(false);
    // met een volle voornaam ernaast telt de voorletter niet als bewijs
    expect(documentNaamPast("Piet J. de Vries", { achternaam: "DE VRIES", voornamen: "JOHANNES" })).toBe(false);
  });

  it("de MRZ zet bijzondere letters om: ue, oe, ae, ss en ij/y", () => {
    expect(vouwLetters("mueller")).toBe(vouwLetters("muller"));
    expect(documentNaamPast("Jürgen Müller", { achternaam: "MUELLER", voornamen: "JUERGEN" })).toBe(true);
    expect(documentNaamPast("Thijs Smeijers", { achternaam: "SMEYERS", voornamen: "THYS" })).toBe(true);
    expect(documentNaamPast("Søren Strauß", { achternaam: "STRAUSS", voornamen: "SOEREN" })).toBe(true);
  });

  it("een afgekapte naam alleen als het naamveld van de MRZ vol staat", () => {
    // TD1 (ID-kaart, 30 tekens): "VAN DER HEIJDEN<<ALEXANDER<FRE" is precies 30 breed
    const vol = { achternaam: "VAN DER HEIJDEN", voornamen: "ALEXANDER FRE" };
    expect(naamveldVol(vol)).toBe(true);
    expect(documentNaamPast("Frederik van der Heijden", vol)).toBe(true);
    // niet vol: dan is "Jong" gewoon een andere naam dan "Jonge"
    expect(naamveldVol({ achternaam: "JONG", voornamen: "JAN" })).toBe(false);
    expect(documentNaamPast("Jan de Jonge", { achternaam: "JONG", voornamen: "JAN" })).toBe(false);
    expect(documentNaamPast("Jan de Jong", { achternaam: "DE JONG", voornamen: "JAN" })).toBe(true);
  });

  it("leeg past nooit", () => {
    expect(documentNaamPast("", { achternaam: "JANSEN", voornamen: "JAN" })).toBe(false);
    expect(documentNaamPast("Jan Jansen", { achternaam: "", voornamen: "JAN" })).toBe(false);
    expect(documentNaamPast("Jan Jansen", { achternaam: "JANSEN", voornamen: "" })).toBe(false);
  });
});
