import { describe, expect, it } from "vitest";
import { documentNaamPast } from "@/lib/kyc/document-naam";

describe("naam op het document tegen het account (review M3)", () => {
  it("dezelfde persoon, anders geschreven", () => {
    expect(documentNaamPast("Briando van Essen", { achternaam: "VAN ESSEN", voornamen: "BRIANDO" })).toBe(true);
    expect(documentNaamPast("Jan Jansen", { achternaam: "JANSEN", voornamen: "JAN PIETER HENDRIK" })).toBe(true);
    expect(documentNaamPast("Bilal Elbouti", { achternaam: "EL BOUTI", voornamen: "BILAL" })).toBe(true);
    expect(documentNaamPast("Zoë Müller", { achternaam: "MULLER", voornamen: "ZOE" })).toBe(true);
  });

  it("een gedeelde achternaam is niet genoeg", () => {
    expect(documentNaamPast("Jan Jansen", { achternaam: "JANSEN", voornamen: "PIET" })).toBe(false);
    expect(documentNaamPast("Piet Jansen", { achternaam: "JANSEN", voornamen: "JAN" })).toBe(false);
  });

  it("een gedeelde voornaam ook niet", () => {
    expect(documentNaamPast("Jan Jansen", { achternaam: "DE VRIES", voornamen: "JAN" })).toBe(false);
  });

  it("een roepnaam die anders is dan de eerste voornaam: een mens kijkt", () => {
    expect(documentNaamPast("Hans de Boer", { achternaam: "DE BOER", voornamen: "JOHANNES" })).toBe(false);
  });

  it("aaneengeschreven alleen als hele woorden: 'Jong' is niet 'Jan de Jonge'", () => {
    expect(documentNaamPast("Jan de Jonge", { achternaam: "JONG", voornamen: "JAN" })).toBe(false);
    expect(documentNaamPast("Jan de Jong", { achternaam: "DE JONG", voornamen: "JAN" })).toBe(true);
  });

  it("leeg past nooit", () => {
    expect(documentNaamPast("", { achternaam: "JANSEN", voornamen: "JAN" })).toBe(false);
    expect(documentNaamPast("Jan Jansen", { achternaam: "", voornamen: "JAN" })).toBe(false);
  });
});
