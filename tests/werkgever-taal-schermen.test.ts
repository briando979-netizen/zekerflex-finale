import { describe, expect, it } from "vitest";
import { nl, fmt } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";

// Het startscherm van /werkgever (en de werkruimte-kiezer en dashboardwisselaar), de facturen en het bedrijfsprofiel zijn tweetalig:
// Nederlands blijft woord voor woord wat er stond, Engels heeft dezelfde sleutels en dezelfde plaatshouders.

const SECTIES = [
  "werkgeverStart",
  "werkruimteInfo",
  "werkruimteKiezer",
  "werkruimteStart",
  "dashboardWisselaar",
  "efactuurForm",
  "fastPayForm",
  "volumeKaart",
  "orgForm",
  "newShiftForm",
  "teamPagina",
  "kandidaatKaart",
  "claimPaneel",
  "herhaalKnop",
  "poolPubliceer",
] as const;

const plaats = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort().join(",");

describe("werkgeversschermen in Nederlands en Engels", () => {
  it("Engels heeft alle sleutels, dezelfde plaatshouders en een echte vertaling", () => {
    for (const sectie of SECTIES) {
      const a = nl[sectie] as Record<string, string>;
      const b = en[sectie] as Record<string, string>;
      expect(Object.keys(b).sort(), sectie).toEqual(Object.keys(a).sort());
      for (const [k, tekst] of Object.entries(a)) {
        const x = b[k]!;
        expect(x.length, `${sectie}.${k}`).toBeGreaterThan(0);
        expect(plaats(x), `${sectie}.${k} plaatshouders`).toBe(plaats(tekst));
        // een lange zin die precies gelijk is aan het Nederlands is niet vertaald
        if (tekst.split(/\s+/).length >= 6) expect(x, `${sectie}.${k} is niet vertaald`).not.toBe(tekst);
      }
    }
  });

  it("Nederlands is gelijk aan wat er stond", () => {
    expect(fmt(nl.werkruimteStart.rijAanmEen, { n: 1 })).toBe("1 nieuwe aanmelding wacht op je.");
    expect(fmt(nl.werkruimteStart.rijAanmMeer, { n: 3 })).toBe("3 nieuwe aanmeldingen wachten op je.");
    expect(fmt(nl.werkruimteStart.horVandaag, { res: "2 reserveringen", gasten: "5 gasten" })).toBe("Vandaag 2 reserveringen, 5 gasten.");
    expect(fmt(nl.werkgeverStart.volgtMeer, { n: 4, org: "Bakkerij Zon" })).toBe("4 werkers volgen Bakkerij Zon.");
    expect(nl.werkgeverStart.greetKeurEen).toBe("1 urenregistratie wacht op je goedkeuring.");
    expect(nl.werkruimteInfo.personeelNaam).toBe("Personeel inhuren");
    expect(fmt(nl.werkruimteKiezer.opgeslagen, { soort: "rijschool" })).toBe("Opgeslagen: we openen je dashboard rijschool.");
    expect(nl.efactuurForm.introVoor + nl.efactuurForm.introVet).toBe("Elke factuur van ZekerFlex is ook een e-factuur");
    expect(fmt(nl.volumeKaart.nogTot, { uren: "5", naam: "Zilver", prijs: "€ 3,00" })).toBe(" · nog 5 uur tot Zilver (€ 3,00/uur)");
    expect(nl.orgForm.bezig).toBe("Opslaan…");
  });
});
