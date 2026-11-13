import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { doelIndex, verplaatsNaar } from "@/lib/ontwerp/sleep";

// Verslepen in de Site-ontwerper (13 nov, eigenaar: "alles moet ik kunnen verslepen"): de rekenregels, en dat de vier lijsten
// (blokken van de homepage, blokken van een pagina, knoppen van het hoofdmenu, links in de voettekst) een greep hebben.
// De pijlknoppen blijven: slepen komt erbij, er gaat niets weg.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

describe("verplaatsNaar", () => {
  it("zet een onderdeel op een andere plek en laat de rest in volgorde", () => {
    expect(verplaatsNaar(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(verplaatsNaar(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(verplaatsNaar(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });

  it("een plek buiten de lijst verandert niets, en de oorspronkelijke lijst blijft heel", () => {
    const lijst = ["a", "b", "c"];
    expect(verplaatsNaar(lijst, -1, 1)).toEqual(lijst);
    expect(verplaatsNaar(lijst, 0, 3)).toEqual(lijst);
    expect(verplaatsNaar(lijst, 0.5, 1)).toEqual(lijst);
    verplaatsNaar(lijst, 0, 2);
    expect(lijst).toEqual(["a", "b", "c"]);
  });

  it("is gelijk aan stap voor stap omhoog of omlaag (de pijlknoppen)", () => {
    const stap = <T,>(l: T[], i: number, d: number) => verplaatsNaar(l, i, i + d);
    let l = ["a", "b", "c", "d"];
    l = stap(l, 0, 1);
    l = stap(l, 1, 1);
    expect(l).toEqual(verplaatsNaar(["a", "b", "c", "d"], 0, 2));
  });
});

describe("doelIndex: waar komt de gesleepte rij terecht", () => {
  // vier rijen van 40 hoog: middens op 20, 60, 100 en 140
  const middens = [20, 60, 100, 140];

  it("boven de eerste rij: plek 0; onder de laatste: de laatste plek", () => {
    expect(doelIndex(middens, 0, 2)).toBe(0);
    expect(doelIndex(middens, 999, 0)).toBe(3);
  });

  it("de rij komt na elke andere rij waarvan het midden vóór de aanwijzer ligt", () => {
    expect(doelIndex(middens, 70, 0)).toBe(1); // rij 0 voorbij het midden van rij 1
    expect(doelIndex(middens, 50, 0)).toBe(0); // nog niet voorbij het midden van rij 1: blijft
    expect(doelIndex(middens, 50, 3)).toBe(1); // rij 3 naar boven, tot onder rij 0
    expect(doelIndex(middens, 110, 1)).toBe(2);
  });

  it("op de eigen plek verandert er niets", () => {
    for (let i = 0; i < middens.length; i++) expect(doelIndex(middens, middens[i]!, i)).toBe(i);
  });

  it("een lege lijst geeft 0", () => {
    expect(doelIndex([], 10, 0)).toBe(0);
  });
});

describe("de vier lijsten in de ontwerper zijn versleepbaar", () => {
  it("elke lijst geeft de sleepeigenschappen door en elke rij heeft een greep; de pijlknoppen blijven", () => {
    const home = bron("components/admin/ontwerper/HomePaneel.tsx");
    const paginas = bron("components/admin/ontwerper/PaginasPaneel.tsx");
    const menu = bron("components/admin/ontwerper/MenuPaneel.tsx");
    const hoofd = bron("components/admin/ontwerper/HoofdmenuPaneel.tsx");
    for (const [naam, src] of [["home", home], ["paginas", paginas], ["menu", menu], ["hoofdmenu", hoofd]] as const) {
      expect(src, naam).toContain("{...sleep.lijst}");
      expect(src, naam).toContain("<SleepGreep");
      expect(src, naam).toContain("data-sleep-rij");
      expect(src, naam).toContain("verplaatsNaar(");
    }
    expect(home).toContain('aria-label={`${info?.naam ?? id} omhoog`}');
    expect(paginas).toContain('aria-label="Omhoog"');
    expect(menu).toContain('aria-label="Omlaag"');
    expect(hoofd).toContain('aria-label="Knop naar links"');
  });

  it("een vast blok (de vertaling van een pagina) is niet te verslepen", () => {
    expect(bron("components/admin/ontwerper/PaginasPaneel.tsx")).toContain('{...(vast ? {} : { "data-sleep-rij": "" })}');
  });

  it("de greep is met het toetsenbord te bedienen en houdt het scherm stil onder een vinger", () => {
    const sleep = bron("components/admin/ontwerper/Sleep.tsx");
    expect(sleep).toContain('touchAction: "none"');
    expect(sleep).toContain("ArrowUp");
    expect(sleep).toContain("ArrowDown");
    expect(sleep).toContain("verslepen (of gebruik de pijltjestoetsen)");
  });
});
