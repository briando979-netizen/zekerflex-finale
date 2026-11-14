import { describe, expect, it } from "vitest";
import { eersteOntbrekend, opsomming, vulNogIn } from "@/lib/formulieren/ontbreekt";

// Het gedeelde hulpje achter "Vul nog in: …" (lib/formulieren/ontbreekt.ts), in elke taal.

describe("vul nog in", () => {
  it("somt op in gewoon Nederlands", () => {
    expect(opsomming(["a"])).toBe("a");
    expect(opsomming(["a", "b"])).toBe("a en b");
    expect(opsomming(["a", "b", "c"])).toBe("a, b en c");
    expect(vulNogIn(["je naam", "je e-mailadres"])).toBe("Vul nog in: je naam en je e-mailadres.");
  });

  it("neemt de woorden van een andere taal mee (werker-app, vijf talen)", () => {
    expect(vulNogIn(["full name", "e-mail"], { vulNogIn: "Please fill in", en: "and" })).toBe("Please fill in: full name and e-mail.");
    expect(vulNogIn(["ім'я"], { vulNogIn: "Заповніть", en: "та" })).toBe("Заповніть: ім'я.");
  });

  it("noemt alle lege velden, met de code van het eerste; een eigen zin komt pas als niets meer leeg is", () => {
    const velden = [
      { code: "naam", naam: "je naam", mist: false },
      { code: "email", naam: "je e-mailadres", mist: true },
      { code: "bedrijf", naam: "de bedrijfsnaam", mist: true },
      { code: "wachtwoord-zwak", naam: "wachtwoord", mist: true, eigenTekst: "Kies een sterker wachtwoord." },
    ];
    expect(eersteOntbrekend(velden)).toEqual({ veld: "email", tekst: "Vul nog in: je e-mailadres en de bedrijfsnaam." });
    expect(eersteOntbrekend([velden[0]!, velden[3]!])).toEqual({ veld: "wachtwoord-zwak", tekst: "Kies een sterker wachtwoord." });
    expect(eersteOntbrekend([velden[0]!])).toBeNull();
    expect(eersteOntbrekend([])).toBeNull();
  });
});
