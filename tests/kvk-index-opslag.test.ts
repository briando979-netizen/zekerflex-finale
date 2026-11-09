import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => ({ winkel: new Map<string, unknown>(), schrijf: [] as string[] }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.winkel.get(k) ?? null,
  kvGetMany: async (keys: string[]) => new Map(keys.filter((k) => kv.winkel.has(k)).map((k) => [k, kv.winkel.get(k)])),
  kvSet: async (k: string, v: unknown) => {
    kv.schrijf.push(k);
    kv.winkel.set(k, JSON.parse(JSON.stringify(v)));
  },
}));

const { bedrijfOpNummer, onthoudBedrijven, onthoudProfiel, zoekInIndex } = await import("@/lib/kvk/index-opslag");
import type { KvkBedrijf } from "@/lib/kvk/types";

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

beforeEach(() => {
  kv.winkel.clear();
  kv.schrijf.length = 0;
});

describe("de bedrijvenindex in KV", () => {
  it("onthoudt een bedrijf en vindt het op voorvoegsel, plaats en nummer", async () => {
    await onthoudBedrijven([b("12345678", "Bakkerij Jansen B.V.", "Den Haag"), b("87654321", "Slagerij De Vries", "Utrecht")]);
    expect((await zoekInIndex(["bakk"])).map((x) => x.kvk)).toEqual(["12345678"]);
    expect((await zoekInIndex(["jansen", "haag"])).map((x) => x.kvk)).toEqual(["12345678"]);
    expect((await zoekInIndex(["utrecht"])).map((x) => x.kvk)).toEqual(["87654321"]);
    expect((await zoekInIndex(["bakk", "utrecht"]))).toEqual([]);
    expect((await bedrijfOpNummer("12345678"))?.naam).toBe("Bakkerij Jansen B.V.");
    expect(await bedrijfOpNummer("00000000")).toBeNull();
    expect(await bedrijfOpNummer("abc")).toBeNull();
  });

  it("zoekt zonder hoofdletters en accenten", async () => {
    await onthoudBedrijven([b("12345678", "Café Zoë", "Gent")]);
    expect((await zoekInIndex(["cafe"])).length).toBe(1);
  });

  it("schrijft niets opnieuw als er niets veranderde", async () => {
    await onthoudBedrijven([b("12345678", "Bakkerij Jansen", "Utrecht")]);
    const eerste = kv.schrijf.length;
    expect(await onthoudBedrijven([b("12345678", "Bakkerij Jansen", "Utrecht", { bijgewerkt: "2026-11-02T10:00:00.000Z" })])).toBe(0);
    expect(kv.schrijf.length).toBe(eerste);
  });

  it("vult aan zonder te wissen: een kort antwoord haalt het adres niet weg", async () => {
    await onthoudBedrijven([b("12345678", "Bakkerij Jansen", "Utrecht", { straat: "Oudegracht", huisnummer: "1", postcode: "3511 AA" })]);
    await onthoudBedrijven([b("12345678", "Bakkerij Jansen", "Utrecht", { bijgewerkt: "2026-11-03T10:00:00.000Z" })]);
    expect((await bedrijfOpNummer("12345678"))?.straat).toBe("Oudegracht");
  });

  it("een emmer groeit niet onbegrensd", async () => {
    const veel = Array.from({ length: 450 }, (_, i) => b(String(10000000 + i), `Bakker ${i}`, "Utrecht"));
    await onthoudBedrijven(veel);
    const emmer = kv.winkel.get("kvk-index:n:bak") as unknown[];
    expect(emmer.length).toBe(400);
  });

  it("slaat ongeldige bedrijven over", async () => {
    expect(await onthoudBedrijven([b("123", "Kort", null), b("12345678", "", null)])).toBe(0);
    expect(kv.winkel.size).toBe(0);
  });

  it("onthoudProfiel bewaart een volledig profiel met adres en btw en gooit nooit", async () => {
    await onthoudProfiel({
      kvkNumber: "12345678",
      legalName: "Acme B.V.",
      tradeName: "Acme",
      legalForm: "Besloten Vennootschap",
      status: "ACTIVE",
      insolvent: false,
      address: { street: "Oudegracht", houseNumber: "1", postalCode: "3511aa", city: "Utrecht" },
      vat: { number: "nl 123456789B01" },
    });
    expect(await bedrijfOpNummer("12345678")).toMatchObject({ postcode: "3511 AA", btw: "NL123456789B01", actief: true, rechtsvorm: "Besloten Vennootschap" });
    await expect(onthoudProfiel({ kvkNumber: "x", legalName: "", tradeName: null, legalForm: null, status: "ACTIVE", insolvent: false, address: { street: null, houseNumber: null, postalCode: null, city: null }, vat: null })).resolves.toBeUndefined();
  });
});
