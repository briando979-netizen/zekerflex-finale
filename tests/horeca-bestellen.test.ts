import { describe, expect, it } from "vitest";
import { VOLGENDE, bouwRegels, isOpen, leesRegels, regelsVoor, type KaartItem } from "@/lib/horeca/bestellen";

const kaart: KaartItem[] = [
  { id: "soep", naam: "Tomatensoep", prijsCent: 695, beschikbaar: true, station: "keuken" },
  { id: "pils", naam: "Pils", prijsCent: 395, beschikbaar: true, station: "bar" },
  { id: "op", naam: "Dame blanche", prijsCent: 750, beschikbaar: false, station: "keuken" },
];

describe("horeca-bestellen", () => {
  it("prijs en naam komen van de kaart, niet van de gast", () => {
    const r = bouwRegels([{ itemId: "soep", aantal: 2 }, { itemId: "pils", aantal: 3 }], kaart);
    expect("regels" in r && r.totaalCent).toBe(2 * 695 + 3 * 395);
    expect("regels" in r && r.regels.map((x) => [x.naam, x.station])).toEqual([
      ["Tomatensoep", "keuken"],
      ["Pils", "bar"],
    ]);
  });

  it("voegt gelijke regels samen, maar niet met een andere opmerking", () => {
    const r = bouwRegels(
      [
        { itemId: "pils", aantal: 1 },
        { itemId: "pils", aantal: 2 },
        { itemId: "pils", aantal: 1, opmerking: " zonder schuim " },
      ],
      kaart,
    );
    expect("regels" in r && r.regels.map((x) => [x.aantal, x.opmerking])).toEqual([
      [3, ""],
      [1, "zonder schuim"],
    ]);
  });

  it("weigert lege mand, onbekend, uitverkocht en rare aantallen", () => {
    expect(bouwRegels([], kaart)).toEqual({ fout: "Je mandje is leeg." });
    expect(bouwRegels([{ itemId: "x", aantal: 1 }], kaart)).toMatchObject({ fout: expect.stringContaining("niet (meer) op de kaart") });
    expect(bouwRegels([{ itemId: "op", aantal: 1 }], kaart)).toEqual({ fout: "Dame blanche is helaas uitverkocht." });
    expect(bouwRegels([{ itemId: "soep", aantal: 0 }], kaart)).toMatchObject({ fout: expect.stringContaining("aantal") });
    expect(bouwRegels([{ itemId: "soep", aantal: 1.5 }], kaart)).toMatchObject({ fout: expect.stringContaining("aantal") });
    expect(bouwRegels([{ itemId: "soep", aantal: 30 }, { itemId: "soep", aantal: 30 }], kaart)).toMatchObject({ fout: expect.stringContaining("aantal") });
  });

  it("keuken en bar zien hun eigen regels", () => {
    const r = bouwRegels([{ itemId: "soep", aantal: 1 }, { itemId: "pils", aantal: 1 }], kaart);
    const regels = "regels" in r ? r.regels : [];
    expect(regelsVoor(regels, "bar").map((x) => x.naam)).toEqual(["Pils"]);
    expect(regelsVoor(regels, "keuken").map((x) => x.naam)).toEqual(["Tomatensoep"]);
    expect(regelsVoor(regels, "alles")).toHaveLength(2);
  });

  it("statussen: volgorde en open of af", () => {
    expect(VOLGENDE.NIEUW).toBe("IN_BEREIDING");
    expect(VOLGENDE.KLAAR).toBe("GESERVEERD");
    expect(VOLGENDE.GESERVEERD).toBeNull();
    expect(isOpen("KLAAR")).toBe(true);
    expect(isOpen("GEANNULEERD")).toBe(false);
  });

  it("leest regels uit de database veilig terug", () => {
    expect(leesRegels([{ naam: "Pils", prijsCent: 395, aantal: 2, station: "bar" }, "onzin", { naam: 1 }])).toEqual([
      { itemId: "", naam: "Pils", prijsCent: 395, aantal: 2, opmerking: "", station: "bar" },
    ]);
    expect(leesRegels(null)).toEqual([]);
  });
});
