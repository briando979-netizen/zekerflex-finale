import { describe, expect, it } from "vitest";
import { bouwRegels, type KaartItem } from "@/lib/horeca/bestellen";
import { kies, leesGroepRegel, leesOptieTekst, leesOpties, optieTekst } from "@/lib/horeca/opties";

const TEKST = "Bakwijze*: Rare, Medium, Well done\nSaus: Pepersaus, Champignonsaus (+1,00)\nExtra's+: Bacon (+1,50), Kaas (+ 1), Ei (€0,75)";

describe("horeca-opties: tekst lezen", () => {
  it("groepen met verplicht (*), meer (+) en meerprijs", () => {
    const g = leesOptieTekst(TEKST);
    expect(g).toHaveLength(3);
    expect(g[0]).toEqual({ naam: "Bakwijze", verplicht: true, meer: false, keuzes: [{ naam: "Rare", prijsCent: 0 }, { naam: "Medium", prijsCent: 0 }, { naam: "Well done", prijsCent: 0 }] });
    expect(g[1]?.keuzes[1]).toEqual({ naam: "Champignonsaus", prijsCent: 100 });
    expect(g[2]).toMatchObject({ naam: "Extra's", verplicht: false, meer: true });
    expect(g[2]?.keuzes.map((k) => k.prijsCent)).toEqual([150, 100, 75]);
  });

  it("onleesbare regels vallen weg; dubbele keuzes één keer", () => {
    expect(leesGroepRegel("zonder dubbele punt")).toBeNull();
    expect(leesGroepRegel("Leeg:  ,  ")).toBeNull();
    expect(leesGroepRegel("Saus: Mayo, mayo, Ketchup")?.keuzes.map((k) => k.naam)).toEqual(["Mayo", "Ketchup"]);
    expect(leesGroepRegel("Formaat+*: Klein, Groot")).toMatchObject({ naam: "Formaat", verplicht: true, meer: true });
  });

  it("terug naar tekst en weer terug geeft hetzelfde", () => {
    const g = leesOptieTekst(TEKST);
    expect(leesOptieTekst(optieTekst(g))).toEqual(g);
  });

  it("uit de database: alleen geldige groepen", () => {
    expect(leesOpties([{ naam: "Saus", keuzes: [{ naam: "Mayo", prijsCent: 50 }, { naam: 3 }], verplicht: true }, { naam: "Leeg", keuzes: [] }, "onzin"])).toEqual([{ naam: "Saus", keuzes: [{ naam: "Mayo", prijsCent: 50 }], verplicht: true, meer: false }]);
    expect(leesOpties(null)).toEqual([]);
  });
});

describe("horeca-opties: kiezen", () => {
  const g = leesOptieTekst(TEKST);
  it("verplichte groep moet gekozen zijn", () => {
    expect(kies(g, [], "Biefstuk")).toEqual({ fout: "Kies bij Biefstuk een bakwijze." });
  });
  it("tekst en meerprijs", () => {
    expect(kies(g, [{ groep: "Bakwijze", keuzes: ["Medium"] }, { groep: "Extra's", keuzes: ["Bacon", "Ei"] }], "Biefstuk")).toEqual({ tekst: "Medium · Bacon, Ei", meerprijsCent: 225 });
  });
  it("één keuze waar er één mag; onbekende keuzes of groepen geweigerd", () => {
    expect("fout" in kies(g, [{ groep: "Bakwijze", keuzes: ["Rare", "Medium"] }], "Biefstuk")).toBe(true);
    expect("fout" in kies(g, [{ groep: "Bakwijze", keuzes: ["Blauw"] }], "Biefstuk")).toBe(true);
    expect("fout" in kies(g, [{ groep: "Bakwijze", keuzes: ["Rare"] }, { groep: "Toetje", keuzes: ["Ijs"] }], "Biefstuk")).toBe(true);
  });
});

describe("horeca-opties: bestellen met keuzes en voorraad", () => {
  const kaart: KaartItem[] = [
    { id: "steak", naam: "Biefstuk", prijsCent: 2450, beschikbaar: true, station: "keuken", opties: leesOptieTekst(TEKST) },
    { id: "taart", naam: "Appeltaart", prijsCent: 450, beschikbaar: true, station: "keuken", voorraad: 3 },
  ];

  it("meerprijs telt mee, de keuze staat op de regel, gelijke keuzes worden samengevoegd", () => {
    const r = bouwRegels(
      [
        { itemId: "steak", aantal: 1, opties: [{ groep: "Bakwijze", keuzes: ["Rare"] }] },
        { itemId: "steak", aantal: 1, opties: [{ groep: "Bakwijze", keuzes: ["Rare"] }] },
        { itemId: "steak", aantal: 1, opties: [{ groep: "Bakwijze", keuzes: ["Well done"] }, { groep: "Extra's", keuzes: ["Bacon"] }] },
      ],
      kaart,
    );
    expect("fout" in r).toBe(false);
    if ("fout" in r) return;
    expect(r.regels.map((x) => `${x.aantal}× ${x.naam} [${x.keuze ?? ""}] ${x.prijsCent}`)).toEqual(["2× Biefstuk [Rare] 2450", "1× Biefstuk [Well done · Bacon] 2600"]);
    expect(r.totaalCent).toBe(2 * 2450 + 2600);
  });

  it("zonder verplichte keuze een nette fout", () => {
    expect(bouwRegels([{ itemId: "steak", aantal: 1 }], kaart)).toEqual({ fout: "Kies bij Biefstuk een bakwijze." });
  });

  it("nooit meer dan de voorraad, ook over regels heen", () => {
    expect("fout" in bouwRegels([{ itemId: "taart", aantal: 3 }], kaart)).toBe(false);
    expect(bouwRegels([{ itemId: "taart", aantal: 2 }, { itemId: "taart", aantal: 2, opmerking: "met slagroom" }], kaart)).toEqual({ fout: "Van Appeltaart zijn er nog maar 3." });
    expect(bouwRegels([{ itemId: "taart", aantal: 1 }], [{ ...(kaart[1] as KaartItem), voorraad: 0 }])).toEqual({ fout: "Appeltaart is helaas uitverkocht." });
  });
});
