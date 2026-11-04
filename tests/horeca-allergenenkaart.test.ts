import { describe, expect, it } from "vitest";
import { ALLERGEEN_VOLGORDE, allergenenKaart, tellingPerAllergeen } from "@/lib/horeca/allergenenkaart";

const item = (naam: string, categorieId: string | null, allergenen: string[], extra: Partial<{ vegetarisch: boolean; veganistisch: boolean; beschikbaar: boolean }> = {}) => ({
  naam,
  categorieId,
  allergenen,
  vegetarisch: false,
  veganistisch: false,
  beschikbaar: true,
  ...extra,
});

describe("allergenenkaart", () => {
  it("de 14 wettelijke allergenen in vaste volgorde", () => {
    expect(ALLERGEEN_VOLGORDE).toHaveLength(14);
    expect(ALLERGEEN_VOLGORDE[0]).toBe("gluten");
  });

  it("groepeert per categorie in menuvolgorde, zonder categorie onder Overig, lege groepen weg", () => {
    const g = allergenenKaart(
      [
        { id: "c1", naam: "Voorgerechten" },
        { id: "c2", naam: "Desserts" },
        { id: "c3", naam: "Leeg" },
      ],
      [
        item("Tiramisu", "c2", ["eieren", "melk", "gluten"]),
        item("Soep", "c1", ["selderij", "onzin"], { vegetarisch: true }),
        item("Friet", null, []),
        item("Spook", "c-weg", ["vis"]),
      ],
    );
    expect(g.map((x) => x.naam)).toEqual(["Voorgerechten", "Desserts", "Overig"]);
    // onbekende allergenen vallen weg; volgorde volgens de wet, niet zoals ingevoerd
    expect(g[0]?.items[0]).toMatchObject({ naam: "Soep", allergenen: ["selderij"], vegetarisch: true });
    expect(g[1]?.items[0]?.allergenen).toEqual(["gluten", "eieren", "melk"]);
    expect(g[2]?.items.map((i) => i.naam)).toEqual(["Friet", "Spook"]);
  });

  it("telt per allergeen", () => {
    const t = tellingPerAllergeen(allergenenKaart([], [item("A", null, ["melk", "gluten"]), item("B", null, ["melk"])]));
    expect(t.melk).toBe(2);
    expect(t.gluten).toBe(1);
    expect(t.vis).toBe(0);
  });
});
