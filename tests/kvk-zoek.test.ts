import { describe, expect, it, vi } from "vitest";
import { bedrijfDetails, zoekBedrijven, type KvkBronnen } from "@/lib/kvk/zoek";
import type { KvkBedrijf, KvkTreffer } from "@/lib/kvk/types";

const b = (kvk: string, naam: string, plaats: string | null, over: Partial<KvkBedrijf> = {}): KvkBedrijf => ({
  kvk,
  naam,
  handelsnaam: null,
  rechtsvorm: null,
  straat: null,
  huisnummer: null,
  postcode: null,
  plaats,
  btw: null,
  actief: null,
  bron: "kvkbase",
  bijgewerkt: "2026-11-01T10:00:00.000Z",
  ...over,
});

function bronnen(
  over: {
    index?: KvkBedrijf[];
    register?: KvkBedrijf[] | Error;
    toegestaan?: boolean;
    registerNummer?: KvkBedrijf | null;
    osm?: KvkTreffer[];
    adres?: { street: string; houseNumber: string; postalCode: string; city: string } | null;
  } = {},
) {
  const spy = {
    indexZoek: vi.fn(async (_w: string[], _m: number) => over.index ?? []),
    indexNummer: vi.fn(async (k: string) => (over.index ?? []).find((x) => x.kvk === k) ?? null),
    onthoud: vi.fn(async (_b: KvkBedrijf[]) => 1),
    toegestaan: vi.fn(async () => over.toegestaan ?? true),
    registerZoek: vi.fn(async (_q: string) => {
      if (over.register instanceof Error) throw over.register;
      return over.register ?? [];
    }),
    registerNummer: vi.fn(async (_k: string) => over.registerNummer ?? null),
    osmZoek: vi.fn(async (_t: string) => over.osm ?? []),
    adres: vi.fn(async (_n: string, _p: string | null) => over.adres ?? null),
    zaai: vi.fn(async () => {}),
  };
  const bron: KvkBronnen = {
    index: { zoek: spy.indexZoek, opNummer: spy.indexNummer, onthoud: spy.onthoud },
    register: { toegestaan: spy.toegestaan, zoek: spy.registerZoek, opNummer: spy.registerNummer },
    osm: { zoek: spy.osmZoek, adresVoor: spy.adres },
    zaai: spy.zaai,
  };
  return { bron, spy };
}

const vijf = ["Bakkerij A", "Bakkerij B", "Bakkerij C", "Bakkerij D", "Bakkerij E"].map((n, i) => b(`1000000${i}`, n, "Utrecht"));

describe("zoekBedrijven: volgorde van de bronnen", () => {
  it("genoeg uit de eigen index: KVKBase wordt niet gevraagd", async () => {
    const { bron, spy } = bronnen({ index: vijf });
    const uit = await zoekBedrijven("bakkerij", bron);
    expect(uit.results).toHaveLength(5);
    expect(uit.bronnen).toEqual(["index"]);
    expect(spy.registerZoek).not.toHaveBeenCalled();
  });

  it("te weinig in de index: KVKBase vult aan en elk antwoord gaat in de index", async () => {
    const nieuw = b("20000000", "Bakkerij Nieuw", "Gouda");
    const { bron, spy } = bronnen({ index: [vijf[0] as KvkBedrijf], register: [nieuw] });
    const uit = await zoekBedrijven("bakkerij", bron);
    expect(uit.results.map((t) => t.kvkNumber)).toEqual(expect.arrayContaining(["10000000", "20000000"]));
    expect(uit.bronnen).toEqual(["index", "register"]);
    expect(spy.onthoud).toHaveBeenCalledWith([nieuw]);
  });

  it("niet toegestaan (eigenaar koos eigen bron of geen tegoed): geen vraag aan KVKBase, geen fout", async () => {
    const { bron, spy } = bronnen({ index: [], toegestaan: false });
    const uit = await zoekBedrijven("bakkerij", bron);
    expect(uit).toEqual({ results: [], bezet: false, bronnen: [] });
    expect(spy.registerZoek).not.toHaveBeenCalled();
  });

  it("een limiet van KVKBase geeft bezet en een lege lijst, geen crash", async () => {
    const { bron } = bronnen({ register: new Error("KVKBase rate limit reached, retry shortly") });
    const uit = await zoekBedrijven("bakkerij", bron);
    expect(uit.bezet).toBe(true);
    expect(uit.results).toEqual([]);
  });

  it("een andere storing in KVKBase of de index laat de eigen treffers staan", async () => {
    const { bron, spy } = bronnen({ index: [vijf[0] as KvkBedrijf], register: new Error("kapot") });
    const uit = await zoekBedrijven("bakkerij", bron);
    expect(uit.results).toHaveLength(1);
    expect(uit.bezet).toBe(false);
    spy.indexZoek.mockRejectedValueOnce(new Error("kv weg"));
    expect((await zoekBedrijven("bakkerij", bron)).results).toEqual([]);
  });

  it("een hangende bron wordt na de tijdslimiet losgelaten", async () => {
    vi.useFakeTimers();
    try {
      const { bron, spy } = bronnen();
      spy.registerZoek.mockImplementation(() => new Promise<KvkBedrijf[]>(() => {}));
      const p = zoekBedrijven("bakkerij", bron);
      await vi.advanceTimersByTimeAsync(6_500);
      expect((await p).results).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("te korte vraag of vestigingsnummer: niets gevraagd", async () => {
    const { bron, spy } = bronnen();
    expect((await zoekBedrijven("ab", bron)).results).toEqual([]);
    expect((await zoekBedrijven("000012345678", bron)).results).toEqual([]);
    expect(spy.indexZoek).not.toHaveBeenCalled();
  });

  it("OpenStreetMap alleen op verzoek, en alleen wat op de vraag lijkt", async () => {
    const osm: KvkTreffer[] = [
      { kvkNumber: null, name: "Bakkerij Jansen", city: "Utrecht", legalForm: null, street: "Oudegracht", houseNumber: "1", postalCode: "3511 AA", vatNumber: null, source: "osm", active: null },
      { kvkNumber: null, name: "Tankstation Shell", city: "Utrecht", legalForm: null, street: null, houseNumber: null, postalCode: null, vatNumber: null, source: "osm", active: null },
    ];
    const { bron, spy } = bronnen({ osm, toegestaan: false });
    expect((await zoekBedrijven("bakkerij jansen", bron)).results).toEqual([]);
    expect(spy.osmZoek).not.toHaveBeenCalled();
    const uit = await zoekBedrijven("bakkerij jansen", bron, { osm: true });
    expect(uit.results.map((t) => t.name)).toEqual(["Bakkerij Jansen"]);
    expect(uit.bronnen).toEqual(["osm"]);
  });

  it("zaaien gebeurt op de achtergrond en een fout daarin merkt niemand", async () => {
    const { bron, spy } = bronnen({ index: vijf });
    spy.zaai.mockRejectedValue(new Error("db weg"));
    expect((await zoekBedrijven("bakkerij", bron)).results).toHaveLength(5);
    expect(spy.zaai).toHaveBeenCalled();
  });
});

describe("zoeken op KVK-nummer en details", () => {
  it("een ingetypt nummer met spaties vindt het bedrijf in de index", async () => {
    const vol = b("12345678", "Acme B.V.", "Utrecht", { straat: "Oudegracht", huisnummer: "1", postcode: "3511 AA" });
    const { bron, spy } = bronnen({ index: [vol] });
    const uit = await zoekBedrijven("1234 5678", bron);
    expect(uit.results[0]).toMatchObject({ kvkNumber: "12345678", name: "Acme B.V.", street: "Oudegracht", source: "register" });
    expect(spy.registerNummer).not.toHaveBeenCalled();
  });

  it("onbekend nummer: KVKBase wordt gevraagd en bewaard; zonder toestemming een nette lege uitkomst", async () => {
    const vol = b("12345678", "Acme B.V.", "Utrecht", { straat: "Oudegracht", huisnummer: "1", postcode: "3511 AA" });
    const aan = bronnen({ registerNummer: vol });
    expect((await zoekBedrijven("12345678", aan.bron)).results).toHaveLength(1);
    expect(aan.spy.onthoud).toHaveBeenCalledWith([vol]);
    const uit = bronnen({ toegestaan: false });
    expect((await zoekBedrijven("12345678", uit.bron)).results).toEqual([]);
  });

  it("ontbreekt het adres, dan vult OpenStreetMap het aan", async () => {
    const kaal = b("12345678", "Acme B.V.", "Utrecht");
    const { bron } = bronnen({ index: [kaal], toegestaan: false, adres: { street: "Oudegracht", houseNumber: "1", postalCode: "3511 AA", city: "Utrecht" } });
    const t = await bedrijfDetails("12345678", bron);
    expect(t).toMatchObject({ street: "Oudegracht", houseNumber: "1", postalCode: "3511 AA", kvkNumber: "12345678" });
  });

  it("een nummer dat nergens bekend is geeft null", async () => {
    const { bron } = bronnen({ toegestaan: false });
    expect(await bedrijfDetails("12345678", bron)).toBeNull();
  });
});
