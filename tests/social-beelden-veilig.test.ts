import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/ai/client", () => ({ chatJson: vi.fn(), llmConfigProblem: () => "geen model" }));

import { BEELDEN, beeldAdres, kiesBeeld } from "@/lib/social/beelden";
import { SJABLONEN, alleenVeilig, standaardAntwoord } from "@/lib/social/schrijf";
import { beoordeelTekst, vraagtMens } from "@/lib/social/veilig";

describe("beelden", () => {
  it("elke foto bestaat, is een JPEG (Instagram neemt niets anders aan) en blijft onder 8 MB", () => {
    for (const b of BEELDEN) {
      const bestand = join(process.cwd(), "public", b.pad);
      expect(existsSync(bestand), b.pad).toBe(true);
      const kop = readFileSync(bestand).subarray(0, 3);
      expect([...kop], `${b.pad} is geen JPEG`).toEqual([0xff, 0xd8, 0xff]);
      expect(statSync(bestand).size, b.pad).toBeLessThan(8 * 1024 * 1024);
    }
  });

  it("kiest de foto die bij het onderwerp past", () => {
    expect(kiesBeeld("Personeel nodig voor je horeca-zaak?", "werkgever").pad).toBe("/shifts/horeca.jpg");
    expect(kiesBeeld("Magazijn en logistiek zoeken orderpickers", "algemeen").pad).toBe("/shifts/logistiek.jpg");
  });

  it("zonder herkenbaar onderwerp: een standaardfoto per doelgroep, en bij een volgend bericht een andere", () => {
    const eerste = kiesBeeld("Een algemeen bericht", "freelancer", 0);
    expect(eerste.pad).toBe("/marketing/freelancer-at-work.jpg");
    const tweede = kiesBeeld("Een algemeen bericht", "freelancer", 1);
    expect(tweede.pad).not.toBe(eerste.pad);
  });

  it("maakt een volledig adres", () => {
    expect(beeldAdres("/shifts/horeca.jpg", "https://zekerflex.com/")).toBe("https://zekerflex.com/shifts/horeca.jpg");
  });
});

describe("vangnet voor tekst zonder mens", () => {
  it("alle vaste teksten en het standaardantwoord komen er zelf doorheen", () => {
    for (const s of SJABLONEN) expect(beoordeelTekst(s.tekst), s.tekst).toEqual({ veilig: true, reden: null });
    expect(beoordeelTekst(standaardAntwoord()).veilig).toBe(true);
  });

  it("houdt beloftes over de gestopte bank tegen", () => {
    for (const t of ["Open nu je eigen rekening bij ZekerFlex", "Met onze betaalpas betaal je overal", "Krijg een bonus als je een vriend doorverwijst", "Voorschot op je uren"]) {
      expect(beoordeelTekst(t).veilig, t).toBe(false);
    }
  });

  it("houdt verzonnen bedragen, percentages, garanties en korting tegen", () => {
    expect(beoordeelTekst("Slechts € 9,99 per uur").veilig).toBe(false);
    expect(beoordeelTekst("Nu 20% minder platformkosten").veilig).toBe(false);
    expect(beoordeelTekst("Gegarandeerd binnen een uur personeel").veilig).toBe(false);
    expect(beoordeelTekst("Winactie: win een iPad").veilig).toBe(false);
    expect(beoordeelTekst("Lees meer op https://andere-site.nl/aanbod").veilig).toBe(false);
  });

  it("laat de bedragen en percentages uit de vaste feiten door", () => {
    expect(beoordeelTekst("Je betaalt € 3,50 per gewerkt uur, bij veel uren € 2,50.").veilig).toBe(true);
    expect(beoordeelTekst("Direct uitbetaald kost 4% van de factuur, binnen 3 werkdagen 2%.").veilig).toBe(true);
    expect(beoordeelTekst("Meer weten? Kijk op https://zekerflex.com").veilig).toBe(true);
  });

  it("alleenVeilig vervangt een afgekeurd bericht door een vaste tekst en houdt het aantal gelijk", () => {
    const r = alleenVeilig(
      [
        { tekst: "Een gewoon bericht over werk dat past bij jou, kies zelf je klussen.", hashtags: [], beeldIdee: "" },
        { tekst: "Open nu je eigen rekening en krijg een betaalpas van ZekerFlex!", hashtags: [], beeldIdee: "" },
      ],
      "freelancer",
      2,
    );
    expect(r.afgekeurd).toBe(1);
    expect(r.posts).toHaveLength(2);
    for (const p of r.posts) expect(beoordeelTekst(p.tekst).veilig).toBe(true);
  });

  it("klachten en lastige onderwerpen gaan naar een mens, gewone reacties niet", () => {
    for (const t of ["Dit is oplichting!", "Ik wil mijn geld terug", "Verwijder mijn gegevens (AVG)", "Ik ga naar de advocaat", "Stop met die spam"]) {
      expect(vraagtMens(t), t).toBe(true);
    }
    for (const t of ["Wat leuk, hoe werkt het?", "Is dit ook in Utrecht?", "Super initiatief"]) {
      expect(vraagtMens(t), t).toBe(false);
    }
  });
});
