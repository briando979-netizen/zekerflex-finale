import { describe, expect, it } from "vitest";
import { IMPORT_MAX, leesLeerlingen } from "@/lib/rijschool/import";
import { beheerActieSchema } from "@/lib/rijschool/schema";

// Leerlingen overnemen uit een export (lib/rijschool/import.ts): kolommen herkennen, regels afkeuren met een reden.

describe("leesLeerlingen", () => {
  it("leest een Excel-export met puntkomma en herkent de kolommen", () => {
    const u = leesLeerlingen("Naam;E-mail;Telefoon;Adres\nAnna de Vries;Anna@Voorbeeld.nl;06 12345678;Kerkstraat 1, Groningen\n");
    expect(u.fouten).toEqual([]);
    expect(u.rijen).toEqual([{ naam: "Anna de Vries", email: "anna@voorbeeld.nl", telefoon: "06 12345678", adres: "Kerkstraat 1, Groningen" }]);
    expect(u.kolommen).toEqual(["naam", "email", "telefoon", "adres"]);
  });

  it("plakt voornaam, tussenvoegsel en achternaam aan elkaar en voegt postcode en plaats bij het adres", () => {
    const u = leesLeerlingen("Voornaam,Tussenvoegsel,Achternaam,E-mailadres,Straat,Postcode,Woonplaats\nJan,van der,Berg,jan@x.nl,Dorpsweg 2,9711 AB,Groningen");
    expect(u.rijen[0]).toMatchObject({ naam: "Jan van der Berg", email: "jan@x.nl", adres: "Dorpsweg 2, 9711 AB Groningen" });
  });

  it("kent aanhalingstekens, een BOM, tabs en lege regels", () => {
    const u = leesLeerlingen('﻿naam\temail\n"Piet, de Groot"\tpiet@x.nl\n\n');
    expect(u.rijen).toEqual([{ naam: "Piet, de Groot", email: "piet@x.nl", telefoon: "", adres: "" }]);
  });

  it("slaat regels over met een reden: geen naam, slecht adres, dubbel", () => {
    const u = leesLeerlingen("naam;email\n;a@x.nl\nKees;geen-adres\nLies;lies@x.nl\nLies Twee;LIES@x.nl");
    expect(u.rijen.map((r) => r.naam)).toEqual(["Lies"]);
    expect(u.fouten.map((f) => f.regel)).toEqual([2, 3, 5]);
    expect(u.fouten[2]?.reden).toContain("staat er al in");
  });

  it("zegt wat er mis is als de kopregel niet te herkennen is, en leest een lege invoer als leeg", () => {
    expect(leesLeerlingen("a;b\n1;2").fouten[0]?.regel).toBe(1);
    expect(leesLeerlingen("   ")).toEqual({ rijen: [], fouten: [], kolommen: [] });
  });

  it("stopt bij het maximum", () => {
    const regels = ["naam;email", ...Array.from({ length: IMPORT_MAX + 5 }, (_, i) => `Leerling ${i};l${i}@x.nl`)].join("\n");
    const u = leesLeerlingen(regels);
    expect(u.rijen).toHaveLength(IMPORT_MAX);
    expect(u.fouten.at(-1)?.reden).toContain("maximaal");
  });

  it("de rijen van de uitslag passen in het schema van de actie", () => {
    const u = leesLeerlingen("naam;email;telefoon\nAnna;anna@x.nl;+31 6 1234 5678");
    expect(beheerActieSchema.safeParse({ actie: "importeer", rijen: u.rijen }).success).toBe(true);
  });
});
