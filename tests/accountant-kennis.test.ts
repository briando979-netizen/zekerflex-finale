import { describe, expect, it } from "vitest";
import { antwoordUitBronnen, bedragenKloppen, cijfersIn, onbekend } from "@/lib/accountant/antwoord";
import { KENNIS, zoekKennis } from "@/lib/accountant/kennis";
import { STRUCTUUR, dagenTot, structuurToestand } from "@/lib/accountant/structuur";

describe("kennisbank van de accountant", () => {
  it("elke regel heeft een bron, een zekerheid en (bij gelezen) een datum; ids zijn uniek", () => {
    expect(new Set(KENNIS.map((r) => r.id)).size).toBe(KENNIS.length);
    for (const r of KENNIS) {
      expect(r.bron.naam.length, r.id).toBeGreaterThan(3);
      expect(r.bron.url.startsWith("http") || r.bron.url.startsWith("/"), r.id).toBe(true);
      if (r.zekerheid === "gelezen") expect(r.gelezen, r.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("vindt de juiste regel bij gewone vragen", () => {
    expect(zoekKennis("Hoeveel is de Delaware franchise tax met 10 miljoen aandelen?")[0]?.regel.id).toBe("de-franchise-methodes");
    expect(zoekKennis("Wat is Form 5472 en wat is de boete?")[0]?.regel.id).toBe("irs-5472");
    expect(zoekKennis("Moet ik me inschrijven bij de KvK als buitenlandse rechtspersoon?")[0]?.regel.id).toBe("nl-kvk");
    expect(zoekKennis("Wanneer moet ik me aanmelden voor de Wtta overgangsregeling?")[0]?.regel.id).toBe("nl-wtta");
    expect(zoekKennis("Hoe hoog is de waarborgsom voor de toelating?")[0]?.regel.id).toBe("nl-wtta-waarborgsom");
    expect(zoekKennis("Ben ik als bestuurder hoofdelijk aansprakelijk, formeel buitenlandse vennootschap?")[0]?.regel.id).toBe("nl-wfbv");
  });

  it("weet het niet bij een vraag zonder bron en verzint dan niets", () => {
    expect(zoekKennis("kan ik mijn lunch en mijn nieuwe fiets aftrekken van de belasting")).toEqual([]);
    const a = onbekend("kan ik mijn fiets aftrekken?");
    expect(a.soort).toBe("onbekend");
    expect(a.bronnen).toEqual([]);
    expect(a.vraagVoorMens).toContain("fiets");
  });
});

describe("controle van het modelantwoord", () => {
  const hits = zoekKennis("Delaware franchise tax authorized shares methode");
  it("leest bedragen en percentages", () => {
    expect(cijfersIn("De tax is $85.165 en de rente 1,5% per maand.")).toEqual(["85165", "15"]);
  });
  it("laat bedragen uit de bronnen toe en weigert verzonnen bedragen", () => {
    expect(bedragenKloppen("Je betaalt $85.165 of minimaal $400.", hits)).toBe(true);
    expect(bedragenKloppen("Je betaalt $12.345.", hits)).toBe(false);
  });
  it("antwoordt zonder model met de bronregels zelf", () => {
    const a = antwoordUitBronnen(hits);
    expect(a.door).toBe("kennisbank");
    expect(a.bronnen.length).toBeGreaterThan(0);
  });
});

describe("structuurcheck", () => {
  it("heeft de tien punten en verwijst naar bestaande bronregels", () => {
    expect(STRUCTUUR.map((p) => p.id)).toEqual(["kvk", "wfbv", "wtta", "waadi", "btw", "fiscaal", "83b", "ein", "bank", "stripe"]);
    for (const p of STRUCTUUR) if (p.bronId) expect(KENNIS.some((r) => r.id === p.bronId), p.id).toBe(true);
  });
  it("neemt alleen geldige opgeslagen statussen over", () => {
    const t = structuurToestand({ kvk: "klaar", btw: "raar", onbekend: "klaar" });
    expect(t.kvk).toBe("klaar");
    expect(t.btw).toBe("open");
    expect(t["83b"]).toBe("bezig");
    expect(Object.keys(t).length).toBe(STRUCTUUR.length);
  });
  it("de Wtta-melding heeft 31 december 2026 als uiterste dag", () => {
    expect(STRUCTUUR.find((p) => p.id === "wtta")?.uiterlijk).toBe("2026-12-31");
    expect(dagenTot("2026-12-31", new Date("2026-11-12T12:00:00+01:00"))).toBe(50);
  });
  it("gelezen bronnen van een algemene site zijn de precieze pagina, niet de voorpagina", () => {
    const algemeen = new Set(["www.kvk.nl", "www.belastingdienst.nl", "www.irs.gov", "corp.delaware.gov", "wetten.overheid.nl", "www.rijksoverheid.nl"]);
    for (const r of KENNIS) {
      if (r.zekerheid !== "gelezen" || !r.bron.url.startsWith("http")) continue;
      const u = new URL(r.bron.url);
      if (algemeen.has(u.host)) expect(u.pathname.length, r.id).toBeGreaterThan(1);
    }
  });
  it("telt dagen tot de 83(b)-datum met een vaste klok", () => {
    expect(dagenTot("2026-12-09", new Date("2026-11-12T12:00:00+01:00"))).toBe(28);
    expect(dagenTot("2026-12-09", new Date("2026-12-11T12:00:00+01:00"))).toBeLessThan(0);
  });
});
