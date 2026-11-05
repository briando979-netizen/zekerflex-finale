import { describe, expect, it } from "vitest";
import { btwOverzicht, btwTarief, leesModus, prijsRegel, zonderBtw } from "@/lib/shop/modus";
import { PAKKETTEN, lijstAlsCsv, lijstSamenvatting, lijstTotaal, verdeelOverMaten } from "@/lib/shop/zakelijk";
import { isTestOfferte, offerteNotitie, offerteSchema } from "@/lib/shop/offerte-schema";
import { pasvormVoor } from "@/lib/shop/paskamer";

describe("particulier of zakelijk", () => {
  it("leest het cookie veilig: alles behalve zakelijk is particulier", () => {
    expect(leesModus("zakelijk")).toBe("zakelijk");
    expect(leesModus("particulier")).toBe("particulier");
    expect(leesModus("iets-anders")).toBe("particulier");
    expect(leesModus(undefined)).toBe("particulier");
  });

  it("boeken 9 % btw, de rest 21 %", () => {
    expect(btwTarief({ slug: "vca-basis-boek", name: "VCA Basisveiligheid — lesboek (NL)" })).toBe(0.09);
    expect(btwTarief({ slug: "veiligheidshesje", name: "Reflecterend veiligheidshesje" })).toBe(0.21);
    expect(btwTarief({ slug: "workday-tote", name: "Workday Tote" })).toBe(0.21);
  });

  it("zakelijk toont de prijs zonder btw, particulier met", () => {
    expect(zonderBtw(1210, 0.21)).toBe(1000);
    expect(prijsRegel(1210, "zakelijk", 0.21)).toEqual({ hoofd: 1000, incl: 1210, btw: 210, exclusief: true });
    expect(prijsRegel(1210, "particulier", 0.21)).toEqual({ hoofd: 1210, incl: 1210, btw: 210, exclusief: false });
  });

  it("het btw-overzicht van een winkelwagen telt op tot het totaal incl. btw", () => {
    const o = btwOverzicht(
      [
        { centenIncl: 1995, tarief: 0.21, aantal: 3 },
        { centenIncl: 2495, tarief: 0.09, aantal: 1 },
      ],
      495,
    );
    expect(o.incl).toBe(1995 * 3 + 2495 + 495);
    expect(o.excl + o.btw).toBe(o.incl);
    expect(o.excl).toBe(1649 * 3 + 2289 + 409);
  });
});

describe("teambestelling", () => {
  it("verdeelt medewerkers over de maten en de som klopt altijd", () => {
    for (const n of [1, 7, 10, 23, 100]) {
      const v = verdeelOverMaten(["S", "M", "L", "XL", "XXL"], n);
      expect(Object.values(v).reduce((a, b) => a + b, 0)).toBe(n);
    }
    const tien = verdeelOverMaten(["S", "M", "L", "XL", "XXL"], 10);
    expect((tien.M ?? 0) + (tien.L ?? 0)).toBeGreaterThanOrEqual(5);
    const schoenen = verdeelOverMaten(["38", "39", "40", "41", "42", "43", "44", "45", "46", "47"], 20);
    expect(Object.values(schoenen).reduce((a, b) => a + b, 0)).toBe(20);
    expect(verdeelOverMaten(["98", "110"], 4)).toEqual({ "98": 2, "110": 2 });
    expect(verdeelOverMaten([], 5)).toEqual({});
  });

  const regels = [
    { naam: "Werk-T-shirt", slug: "werk-tshirt-2pack", maat: "M", kleur: null, aantal: 4, centenIncl: 1995 },
    { naam: "Lesboek; VCA", slug: "vca-basis-boek", maat: null, kleur: null, aantal: 1, centenIncl: 2495 },
    { naam: "Hesje", slug: "veiligheidshesje", maat: "L", kleur: null, aantal: 0, centenIncl: 695 },
  ];

  it("telt stuks en btw per product met het eigen tarief", () => {
    const t = lijstTotaal(regels);
    expect(t.stuks).toBe(5);
    expect(t.incl).toBe(1995 * 4 + 2495);
    expect(t.excl).toBe(1649 * 4 + 2289);
    expect(t.excl + t.btw).toBe(t.incl);
  });

  it("maakt een CSV voor Excel zonder lege regels en met veilige velden", () => {
    const csv = lijstAlsCsv(regels, { artikel: "Artikel", maat: "Maat", kleur: "Kleur", aantal: "Aantal", stukExcl: "Stuk", totaalExcl: "Totaal" });
    const rijen = csv.split("\r\n");
    expect(rijen).toHaveLength(3);
    expect(rijen[1]).toBe("Werk-T-shirt;M;;4;16,49;65,96");
    expect(rijen[2]).toBe('"Lesboek; VCA";;;1;22,89;22,89');
    expect(lijstSamenvatting(regels)).toBe("4× Werk-T-shirt (maat M)\n1× Lesboek; VCA");
  });

  it("elk pakket verwijst naar draagbare of bekende producten", () => {
    for (const pk of PAKKETTEN) expect(pk.slugs.length, pk.id).toBeGreaterThanOrEqual(2);
    expect(pasvormVoor({ slug: "veiligheidshelm", name: "Veiligheidshelm wit" })).not.toBeNull();
  });
});

describe("offerteverzoek", () => {
  const geldig = { bedrijf: "Bouwbedrijf Test", naam: "Sam Test", email: "sam@bouw.nl", wensen: ["logo", "vestigingen"], medewerkers: 12, lijst: "4× Hesje (maat L)", akkoord: true };

  it("accepteert een volledig verzoek en maakt er een leesbare notitie van", () => {
    const o = offerteSchema.parse(geldig);
    const n = offerteNotitie(o);
    expect(n).toContain("Medewerkers: 12.");
    expect(n).toContain("logo of bedrukking, leveren op meerdere adressen");
    expect(n).toContain("4× Hesje (maat L)");
  });

  it("weigert zonder akkoord of met een onbekende wens", () => {
    expect(offerteSchema.safeParse({ ...geldig, akkoord: false }).success).toBe(false);
    expect(offerteSchema.safeParse({ ...geldig, wensen: ["gratis"] }).success).toBe(false);
    expect(offerteSchema.safeParse({ ...geldig, email: "geen-mail" }).success).toBe(false);
  });

  it("herkent testadressen, zodat sales geen nepleads krijgt", () => {
    expect(isTestOfferte("iemand@example.com")).toBe(true);
    expect(isTestOfferte("qa@shop.test")).toBe(true);
    expect(isTestOfferte("inkoop@bouwbedrijf.nl")).toBe(false);
  });
});

describe("onlangs bekeken", () => {
  it("houdt de nieuwste vooraan, zonder dubbele, hooguit 12", async () => {
    const { leesBekeken, metBekeken } = await import("@/components/marketing/useOnlangsBekeken");
    expect(leesBekeken(null)).toEqual([]);
    expect(leesBekeken("{kapot")).toEqual([]);
    expect(leesBekeken(JSON.stringify(["a", "b", "a", 3, ""]))).toEqual(["a", "b"]);
    expect(metBekeken(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    const veel = Array.from({ length: 12 }, (_, i) => `p${i}`);
    expect(metBekeken(veel, "nieuw")).toHaveLength(12);
    expect(metBekeken(veel, "nieuw")[0]).toBe("nieuw");
  });
});
