import { describe, expect, it } from "vitest";
import { lijktEmail, ontbrekendInDemo } from "@/lib/demo/validatie";

const vol = { firstName: "Jan", lastName: "de Vries", email: "jan@bedrijf.test", company: "Bedrijf" };

describe("demoformulier: wat ontbreekt er nog", () => {
  it("noemt de lege velden bij naam, in leesbare volgorde", () => {
    expect(ontbrekendInDemo({ firstName: "", lastName: "", email: "", company: "" }, false)).toBe(
      "Vul nog in: je voornaam, je achternaam, je e-mailadres en de bedrijfsnaam.",
    );
    expect(ontbrekendInDemo({ ...vol, company: "  " }, true)).toBe("Vul nog in: de bedrijfsnaam.");
    expect(ontbrekendInDemo({ ...vol, lastName: "", company: "" }, true)).toBe("Vul nog in: je achternaam en de bedrijfsnaam.");
  });

  it("controleert het e-mailadres pas als alles is ingevuld, dan het vinkje, dan niets", () => {
    expect(ontbrekendInDemo({ ...vol, email: "jan@bedrijf" }, true)).toMatch(/e-mailadres/);
    expect(ontbrekendInDemo(vol, false)).toBe("Zet het vinkje voor akkoord om te bevestigen.");
    expect(ontbrekendInDemo(vol, true)).toBeNull();
  });

  it("herkent een e-mailadres zoals de server dat doet", () => {
    expect(lijktEmail("jan@bedrijf.test")).toBe(true);
    expect(lijktEmail(" jan@bedrijf.nl ")).toBe(true);
    expect(lijktEmail("jan@bedrijf")).toBe(false);
    expect(lijktEmail("jan bedrijf.nl")).toBe(false);
    expect(lijktEmail("")).toBe(false);
  });
});
