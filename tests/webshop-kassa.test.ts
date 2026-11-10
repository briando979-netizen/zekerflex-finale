import { describe, expect, it } from "vitest";
import {
  aantalStuks,
  bonOpmaak,
  bonTijd,
  losBedrag,
  mandjeTotaal,
  snelBedragen,
  tweeKolommen,
  variantVan,
  voegToe,
  wisselgeld,
  zetAantal,
  type KassaBon,
  type KassaUitslag,
  type Mandje,
} from "@/lib/sites/kassa";
import { bonNaarEscPos } from "@/lib/sites/kassa-escpos";
import { labelNaarEscPos } from "@/lib/locatie/escpos";
import type { SiteProduct } from "@/lib/sites/types";

// Webshop → Op locatie: het mandje houdt de voorraad aan (alle varianten samen), een los bedrag
// mag, wisselgeld en snelknoppen kloppen, en de bon past op een rol van 58 of 80 mm.

const product = (over: Partial<SiteProduct> = {}): SiteProduct => ({
  id: "p1",
  naam: "Hoodie",
  slug: "hoodie",
  prijsCents: 2995,
  korteTekst: "",
  omschrijving: "",
  fotos: [],
  categorie: "Kleding",
  zichtbaar: true,
  uitverkocht: false,
  ...over,
});

function mandjeVan(u: KassaUitslag): Mandje {
  if ("fout" in u) throw new Error(u.fout);
  return u.mandje;
}

describe("mandje", () => {
  it("telt hetzelfde product op en houdt varianten apart", () => {
    const p = product({ opties: [{ naam: "Maat", waarden: ["S", "M"] }] });
    let m = mandjeVan(voegToe([], p, "M"));
    m = mandjeVan(voegToe(m, p, "M"));
    m = mandjeVan(voegToe(m, p, "S"));
    expect(m).toHaveLength(2);
    expect(aantalStuks(m)).toBe(3);
    expect(mandjeTotaal(m)).toBe(3 * 2995);
  });

  it("houdt de voorraad aan over alle varianten samen, en een uitverkocht product mag niet", () => {
    const p = product({ voorraad: 2, opties: [{ naam: "Maat", waarden: ["S", "M"] }] });
    let m = mandjeVan(voegToe([], p, "S"));
    m = mandjeVan(voegToe(m, p, "M"));
    expect(voegToe(m, p, "M")).toEqual({ fout: "Van Hoodie zijn er nog 2." });
    expect(zetAantal(m, m[0]!.sleutel, 2, [p])).toEqual({ fout: "Van Hoodie zijn er nog 2." });
    expect(voegToe([], product({ uitverkocht: true }))).toEqual({ fout: "Hoodie is uitverkocht." });
    expect(voegToe([], product({ voorraad: 0 }))).toEqual({ fout: "Hoodie is uitverkocht." });
  });

  it("aantal 0 haalt de regel weg; een los bedrag gaat erbij zonder product", () => {
    let m = mandjeVan(voegToe([], product()));
    m = mandjeVan(losBedrag(m, "Cadeaubon", 2500));
    expect(m[1]).toMatchObject({ productId: null, naam: "Cadeaubon", prijsCents: 2500, aantal: 1 });
    expect(mandjeTotaal(m)).toBe(2995 + 2500);
    m = mandjeVan(zetAantal(m, m[0]!.sleutel, 0, [product()]));
    expect(m).toHaveLength(1);
    expect(losBedrag(m, "x", 0)).toEqual({ fout: "Vul een bedrag in." });
  });

  it("een variant telt pas als elke optie gekozen is", () => {
    const p = product({ opties: [{ naam: "Maat", waarden: ["S", "M"] }, { naam: "Kleur", waarden: ["Zwart", "Wit"] }] });
    expect(variantVan(p, { Maat: "M" })).toBeNull();
    expect(variantVan(p, { Maat: "M", Kleur: "Zwart" })).toBe("M, Zwart");
    expect(variantVan(p, { Maat: "XL", Kleur: "Zwart" })).toBeNull();
    expect(variantVan(product(), {})).toBe("");
  });
});

describe("afrekenen", () => {
  it("wisselgeld, en null als de klant te weinig geeft", () => {
    expect(wisselgeld(1250, 2000)).toBe(750);
    expect(wisselgeld(1250, 1250)).toBe(0);
    expect(wisselgeld(1250, 1000)).toBeNull();
  });

  it("snelknoppen: gepast en de ronde bedragen erboven", () => {
    expect(snelBedragen(1250)).toEqual([1250, 1500, 2000, 5000, 10_000]);
    expect(snelBedragen(2000)).toEqual([2000, 5000, 10_000]);
    expect(snelBedragen(0)).toEqual([]);
  });
});

describe("de bon", () => {
  const bon: KassaBon = {
    nr: "K7Q2MX",
    op: "2026-11-10T21:05:00Z",
    winkel: { naam: "Jk test shop", adres: "Dorpsstraat 1, 1234 AB Ergens", telefoon: "0612345678" },
    regels: [
      { sleutel: "p1|M", productId: "p1", naam: "Hoodie met een heel lange naam die niet past", variant: "M", prijsCents: 2995, aantal: 2 },
      { sleutel: "los-1", productId: null, naam: "Cadeaubon", prijsCents: 2500, aantal: 1 },
    ],
    totaalCents: 8490,
    methode: "contant",
    ontvangenCents: 10_000,
    wisselgeldCents: 1510,
  };

  it("de tijd staat in Nederlandse tijd", () => {
    expect(bonTijd("2026-11-10T21:05:00Z")).toBe("10-11-2026 22:05");
    expect(bonTijd("2026-07-01T10:00:00Z")).toBe("01-07-2026 12:00");
  });

  it("elke regel past precies op de rol, met het bedrag rechts", () => {
    for (const kol of [32, 48]) {
      const o = bonOpmaak(bon, kol);
      for (const r of [...o.kop, ...o.regels]) expect(r.length, r).toBeLessThanOrEqual(kol);
      expect(o.regels.find((r) => r.startsWith("Totaal"))).toBe(tweeKolommen("Totaal", "€ 84,90", kol));
      expect(o.regels.some((r) => r.startsWith("Wisselgeld") && r.endsWith("€ 15,10"))).toBe(true);
      expect(o.regels.some((r) => r.includes("2 x € 29,95") && r.endsWith("€ 59,90"))).toBe(true);
    }
  });

  it("pin zet het bedrag als pin op de bon, zonder wisselgeld", () => {
    const o = bonOpmaak({ ...bon, methode: "pin", ontvangenCents: undefined, wisselgeldCents: undefined }, 32);
    expect(o.regels.some((r) => r.startsWith("Pin") && r.endsWith("€ 84,90"))).toBe(true);
    expect(o.regels.some((r) => r.startsWith("Wisselgeld"))).toBe(false);
  });

  it("ESC/POS: begint met een reset, heeft het euroteken, en snijdt af als dat moet", () => {
    const b = Array.from(bonNaarEscPos(bon, { rol: 58, snijden: true }));
    expect(b.slice(0, 2)).toEqual([0x1b, 0x40]);
    expect(b).toContain(0x80);
    expect(b.slice(-4)).toEqual([0x1d, 0x56, 0x42, 0x00]);
    expect(Array.from(bonNaarEscPos(bon, { rol: 80, snijden: false })).slice(-4)).not.toEqual([0x1d, 0x56, 0x42, 0x00]);
  });

  it("de labelprinter van Op locatie werkt nog zoals voorheen", () => {
    const b = labelNaarEscPos({ soort: "naamsticker", kop: "Sam", regels: ["ZekerFlex"] });
    expect(Array.from(b).slice(0, 2)).toEqual([0x1b, 0x40]);
  });
});
