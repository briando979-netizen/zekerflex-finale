import { beforeEach, describe, expect, it, vi } from "vitest";

// Webshop → Op locatie op de server: een verkoop in de winkel wordt een bestelling met kanaal
// "winkel", meteen afgerond en betaald; de prijzen komen van de winkel (nooit van de browser),
// varianten en voorraad worden gecontroleerd, de btw volgt de winkel, en de voorraad gaat omlaag.

const h = vi.hoisted(() => ({ kv: new Map<string, unknown>(), opgeslagen: [] as unknown[], vers: null as unknown }));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
  kvListValues: async (prefix: string) => [...h.kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v),
  kvDelete: async (k: string) => void h.kv.delete(k),
}));
vi.mock("@/lib/sites/store", () => ({
  saveWinkel: async (_id: string, w: unknown) => (h.opgeslagen.push(w), {}),
  // de winkel zoals hij nu is (verkoopInWinkel leest hem opnieuw vóór het verlagen van de voorraad)
  getSite: async () => h.vers,
}));

import { kassaConcept, kassaDag, bonVanVerkoop, bonOpmaak } from "@/lib/sites/kassa";
import { kassaVerkoopSchema, verkoopInWinkel } from "@/lib/sites/kassa-server";
import type { SiteDoc, SiteProduct, Winkel } from "@/lib/sites/types";

const product = (over: Partial<SiteProduct>): SiteProduct => ({ id: "p", naam: "Product", slug: "p", prijsCents: 1000, korteTekst: "", omschrijving: "", fotos: [], categorie: "", zichtbaar: true, uitverkocht: false, ...over });
const winkel = (over: Partial<Winkel> = {}): Winkel => ({
  producten: [
    product({ id: "hoodie", naam: "Hoodie", prijsCents: 2995, voorraad: 3, opties: [{ naam: "Maat", waarden: ["S", "M"] }] }),
    product({ id: "pet", naam: "Pet", prijsCents: 1495 }),
    product({ id: "boek", naam: "Boek", prijsCents: 1090, btw: 9 }),
    product({ id: "geheim", naam: "Alleen in de winkel", prijsCents: 500, zichtbaar: false }),
    product({ id: "op", naam: "Op", prijsCents: 500, uitverkocht: true }),
  ],
  bestellen: false,
  levering: { afhalen: true, bezorgen: false, bezorgkostenCents: 0, gratisVanafCents: null },
  betaalTekst: "",
  ...over,
});

beforeEach(() => {
  h.kv.clear();
  h.opgeslagen.length = 0;
});

describe("kassaConcept", () => {
  it("rekent met de prijzen van de winkel, ook voor wat niet online staat, en met een los bedrag", () => {
    const uit = kassaConcept(winkel(), [
      { productId: "pet", variant: "", aantal: 2 },
      { productId: "geheim", variant: "", aantal: 1 },
      { los: "Cadeaubon", prijsCents: 2500, aantal: 1 },
    ]);
    expect(uit.fouten).toEqual([]);
    expect(uit.concept?.totaalCents).toBe(2 * 1495 + 500 + 2500);
    expect(uit.concept?.regels.map((r) => r.naam)).toEqual(["Pet", "Alleen in de winkel", "Cadeaubon"]);
    expect(uit.concept?.invoer.naam).toBe("Verkoop in de winkel");
  });

  it("controleert varianten, voorraad (alle maten samen) en uitverkocht", () => {
    expect(kassaConcept(winkel(), [{ productId: "hoodie", variant: "XL", aantal: 1 }]).fouten[0]).toMatch(/Kies opnieuw de maat van Hoodie/);
    expect(kassaConcept(winkel(), [{ productId: "hoodie", variant: "S", aantal: 2 }, { productId: "hoodie", variant: "M", aantal: 2 }]).fouten).toEqual(["Van Hoodie zijn er nog 3."]);
    expect(kassaConcept(winkel(), [{ productId: "op", variant: "", aantal: 1 }]).fouten).toEqual(["Op is uitverkocht."]);
    expect(kassaConcept(winkel(), [{ productId: "weg", variant: "", aantal: 1 }]).fouten[0]).toMatch(/bestaat niet meer/);
    expect(kassaConcept(winkel(), []).fouten).toEqual(["Het mandje is leeg."]);
    const ok = kassaConcept(winkel(), [{ productId: "hoodie", variant: "M", aantal: 3 }]);
    expect(ok.concept?.regels[0]).toMatchObject({ naam: "Hoodie (M)", variant: "M", totaalCents: 3 * 2995 });
  });

  it("btw zoals de winkel hem instelt: inclusief, exclusief (erbij) of KOR", () => {
    const regels = [{ productId: "pet", variant: "", aantal: 1 }, { productId: "boek", variant: "", aantal: 1 }];
    const incl = kassaConcept(winkel({ btw: { inclusief: true, standaard: 21, kor: false } }), regels).concept!;
    expect(incl.totaalCents).toBe(1495 + 1090);
    expect(incl.btw?.regels.map((r) => [r.tarief, r.btwCents])).toEqual([[21, 259], [9, 90]]);
    const excl = kassaConcept(winkel({ btw: { inclusief: false, standaard: 21, kor: false } }), regels).concept!;
    expect(excl.totaalCents).toBe(1495 + 1090 + 314 + 98);
    const kor = kassaConcept(winkel({ btw: { inclusief: true, standaard: 21, kor: true } }), regels).concept!;
    expect(kor.btw).toMatchObject({ kor: true, totaalCents: 0 });
    expect(kassaConcept(winkel(), regels).concept?.btw).toBeUndefined();
  });
});

describe("verkoopInWinkel", () => {
  const site = { id: "s1", winkel: winkel({ btw: { inclusief: true, standaard: 21, kor: false } }), bedrijf: { naam: "Jk test shop", straat: "Dorpsstraat 1", postcode: "1234 AB", plaats: "Ergens", telefoon: "0612345678" } } as unknown as SiteDoc;
  const nu = new Date("2026-11-10T15:00:00+01:00");
  beforeEach(() => {
    h.vers = site;
  });

  it("verlaagt de voorraad van de winkel zoals hij nu is, niet van een oudere kopie", async () => {
    // intussen kwam er voorraad bij (of verkocht de webshop iets): die stand telt
    h.vers = { ...site, winkel: { ...site.winkel, producten: site.winkel!.producten.map((p) => (p.id === "hoodie" ? { ...p, voorraad: 5 } : p)) } };
    h.opgeslagen.length = 0;
    await verkoopInWinkel(site, kassaVerkoopSchema.parse({ regels: [{ productId: "hoodie", variant: "S", aantal: 1 }], methode: "pin" }), nu);
    expect((h.opgeslagen[0] as Winkel).producten.find((p) => p.id === "hoodie")?.voorraad).toBe(4);
  });

  it("bewaart een afgeronde, betaalde bestelling met kanaal winkel, verlaagt de voorraad en geeft de bon", async () => {
    const invoer = kassaVerkoopSchema.parse({ regels: [{ productId: "hoodie", variant: "M", aantal: 2 }, { los: "Reparatie", prijsCents: 750, aantal: 1 }], methode: "contant", ontvangenCents: 10_000 });
    const { bestelling, bon } = await verkoopInWinkel(site, invoer, nu);
    expect(bestelling).toMatchObject({ status: "afgerond", betaaldAt: nu.toISOString(), kanaal: "winkel", kassa: { methode: "contant", ontvangenCents: 10_000, wisselgeldCents: 10_000 - (2 * 2995 + 750) } });
    expect(h.kv.get(`site-bestelling:s1:${bestelling.id}`)).toMatchObject({ kanaal: "winkel" });
    const w = h.opgeslagen[0] as Winkel;
    expect(w.producten.find((p) => p.id === "hoodie")?.voorraad).toBe(1);
    expect(bon).toMatchObject({ nr: bestelling.nr, methode: "contant", totaalCents: 2 * 2995 + 750, winkel: { naam: "Jk test shop", adres: "Dorpsstraat 1, 1234 AB Ergens" } });
    const tekst = bonOpmaak(bon, 32).regels.join("\n");
    expect(tekst).toMatch(/Hoodie \(M\)/);
    expect(tekst).not.toMatch(/\(M\) \(M\)/);
    expect(tekst).toMatch(/Waarvan btw 21%/);
  });

  it("weigert contant als de klant te weinig gaf, en een prijs voor een product uit de browser telt niet", async () => {
    await expect(verkoopInWinkel(site, kassaVerkoopSchema.parse({ regels: [{ productId: "pet", aantal: 1 }], methode: "contant", ontvangenCents: 1000 }), nu)).rejects.toThrow(/minder dan het totaal/);
    const invoer = kassaVerkoopSchema.parse({ regels: [{ productId: "pet", aantal: 1, prijsCents: 1 }], methode: "pin" });
    const { bestelling } = await verkoopInWinkel(site, invoer, nu);
    expect(bestelling.totaalCents).toBe(1495);
    expect(bestelling.kassa).toEqual({ methode: "pin" });
    // de pet houdt geen voorraad bij: de winkel hoeft dan niet opnieuw opgeslagen te worden (net als in de webshop)
    expect(h.opgeslagen).toHaveLength(0);
  });
});

describe("dagtotaal", () => {
  it("telt alleen de winkelverkopen van vandaag (Nederlandse dag), per betaalwijze, zonder geannuleerde", () => {
    const nu = new Date("2026-11-10T23:30:00+01:00");
    const v = (at: string, totaalCents: number, methode: "contant" | "pin", extra: Record<string, unknown> = {}) => ({ at, totaalCents, status: "afgerond", kanaal: "winkel", kassa: { methode }, ...extra });
    const dag = kassaDag(
      [
        v("2026-11-10T08:00:00+01:00", 1000, "contant"),
        v("2026-11-10T23:10:00+01:00", 2500, "pin"),
        v("2026-11-09T23:59:00+01:00", 999, "pin"),
        v("2026-11-10T12:00:00+01:00", 700, "pin", { status: "geannuleerd" }),
        { at: "2026-11-10T12:00:00+01:00", totaalCents: 5000, status: "nieuw" },
      ],
      nu,
    );
    expect(dag).toEqual({ aantal: 2, totaalCents: 3500, contantCents: 1000, pinCents: 2500 });
  });

  it("een bon van een verkoop met pin heeft geen wisselgeld", () => {
    const bon = bonVanVerkoop({ nr: "AAAAAA", at: "2026-11-10T14:00:00Z", regels: [{ productId: "", naam: "Los", prijsCents: 500, aantal: 1, totaalCents: 500 }], totaalCents: 500, btw: undefined, kassa: { methode: "pin" } }, { naam: "Winkel" });
    expect(bon.ontvangenCents).toBeUndefined();
    expect(bon.regels[0]?.productId).toBeNull();
  });
});
