import { describe, expect, it } from "vitest";
import { SOORTEN } from "@/lib/inkaart/model";
import { signaalTekst } from "@/lib/inkaart/render";
import { soortNaam, voorbeeldRegels } from "@/lib/inkaart/sjablonen";
import { inkaartTeksten, type InKaartTeksten } from "@/lib/inkaart/teksten";

// Nederlands en Engels moeten dezelfde vorm en dezelfde plaatshouders hebben, anders toont de werkgeversapp een kale "{naam}".

const NL = inkaartTeksten("nl");
const EN = inkaartTeksten("en");

function platte(o: unknown, pad = "", uit: Record<string, string> = {}): Record<string, string> {
  if (typeof o === "string") uit[pad] = o;
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) platte(v, pad ? `${pad}.${k}` : k, uit);
  return uit;
}
const plaatshouders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

describe("teksten Bedrijf in kaart", () => {
  const nl = platte(NL);
  const en = platte(EN);

  it("heeft in beide talen dezelfde sleutels", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(nl).sort());
  });

  it("vult overal dezelfde plaatshouders", () => {
    for (const [k, v] of Object.entries(nl)) expect(plaatshouders(en[k] ?? ""), k).toBe(plaatshouders(v));
  });

  it("laat geen tekst leeg", () => {
    for (const [k, v] of [...Object.entries(nl), ...Object.entries(en)]) expect(v.trim().length, k).toBeGreaterThan(0);
  });

  it("de Engelse tekst is echt Engels (niet gewoon de Nederlandse)", () => {
    const gelijk = Object.keys(nl).filter((k) => nl[k] === en[k] && nl[k]!.split(" ").length > 3);
    expect(gelijk).toEqual([]);
  });
});

describe("voorbeeldsets per taal", () => {
  it("elke soort heeft een naam en dezelfde aantallen regels in beide talen", () => {
    for (const s of SOORTEN) {
      expect(soortNaam(s, "nl")).toBeTruthy();
      expect(soortNaam(s, "en")).toBeTruthy();
      const nl = voorbeeldRegels(s, "nl");
      const en = voorbeeldRegels(s, "en");
      expect(en.ruimtes).toHaveLength(nl.ruimtes.length);
      expect(en.groepen).toHaveLength(nl.groepen.length);
    }
  });

  it("noemt in het Engels geen Nederlandse ruimtenaam", () => {
    expect(voorbeeldRegels("ziekenhuis", "en").ruimtes[0]?.naam).toBe("Consulting room");
  });
});

describe("signaalTekst", () => {
  it("vult de plaatshouders in beide talen", () => {
    const s = { id: "vol-r1", soort: "vol", niveau: "aandacht", params: { naam: "Kamer", plek: 0, pct: 95 } } as const;
    for (const t of [NL, EN] as InKaartTeksten[]) {
      const x = signaalTekst(t, s);
      expect(x.titel).not.toMatch(/\{/);
      expect(x.waarom).not.toMatch(/\{/);
    }
    expect(signaalTekst(EN, s).titel).toContain("Monday morning");
  });
});
