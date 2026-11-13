import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Minder vragen in de onboarding (13 nov 2026, eigenaar: "veel te veel vragen"; kaart van a0, velden 4 en 9).
// (4) De opleiding (optioneel, nooit een eis; 16 van de 33 echte werkers vulden hem in) staat niet meer in stap 1 maar in
//     het profiel, bewerkbaar. Stap 1 stuurt hem niet meer mee, zodat een opleiding uit het profiel blijft staan.
// (9) De thuisbasis in Nederland: eerst "Gebruik mijn huidige locatie", anders alleen de postcode; de woonplaats zoeken
//     wij erbij (PDOK). Het buitenland blijft zoals het was.

const h = vi.hoisted(() => ({ kv: new Map<string, unknown>(), weg: [] as string[] }));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
  kvDelete: async (k: string) => {
    h.weg.push(k);
    h.kv.delete(k);
  },
}));
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: async () => ({}), setFiscal: async () => undefined }));
vi.mock("@/lib/profile/personal", () => ({ naamIsVast: async () => false, updatePersonalInfo: async () => undefined }));

import { bewaarOpleiding, leesOpleiding } from "@/lib/onboarding/wie-ben-jij-opslag";

const lees = (p: string) => readFileSync(p, "utf8");

beforeEach(() => {
  h.kv.clear();
  h.weg = [];
});

describe("opleiding in het profiel", () => {
  it("bewaren, lezen en wissen onder dezelfde sleutel als stap 1", async () => {
    expect(await bewaarOpleiding("u1", { niveau: "hbo", richting: "techniek" })).toEqual({ niveau: "hbo", richting: "techniek" });
    expect(h.kv.get("werker-opleiding:u1")).toMatchObject({ niveau: "hbo", richting: "techniek" });
    expect(await leesOpleiding("u1")).toEqual({ niveau: "hbo", richting: "techniek" });
    // een richting hoort niet bij elk niveau
    expect(await bewaarOpleiding("u1", { niveau: "middelbaar", richting: "techniek" })).toEqual({ niveau: "middelbaar" });
    expect(await bewaarOpleiding("u1", null)).toBeNull();
    expect(h.weg).toEqual(["werker-opleiding:u1"]);
    expect(await leesOpleiding("u1")).toBeNull();
  });

  it("iets onleesbaars is een fout, en er wordt niets bewaard", async () => {
    await expect(bewaarOpleiding("u1", { niveau: "doctoraat" })).rejects.toMatchObject({ status: 422 });
    await expect(bewaarOpleiding("u1", "hbo")).rejects.toMatchObject({ status: 422 });
    expect(h.kv.size).toBe(0);
  });

  it("stap 1 vraagt hem niet meer en stuurt hem niet mee; het profiel toont hem", () => {
    const stap1 = lees("components/app/WieBenJijPersoon.tsx");
    expect(stap1).not.toContain("OpleidingSheets");
    expect(stap1).not.toMatch(/JSON\.stringify\(\{[^}]*opleiding/);
    const profiel = lees("app/dashboard/profiel/page.tsx");
    expect(profiel).toContain("<OpleidingProfiel begin={opleiding} bewaar={bewaarOpleidingAction} />");
    expect(lees("app/dashboard/profiel/actions.ts")).toMatch(/export async function bewaarOpleidingAction/);
  });
});

describe("thuisbasis in Nederland: locatie of postcode", () => {
  const veld = lees("components/app/ThuisbasisVelden.tsx");
  const nl = veld.slice(veld.indexOf("function AdresKiezer"), veld.indexOf("export function useThuisbasisFout"));

  it("eerst de knop voor de locatie, dan één postcodeveld; geen adreslijst meer", () => {
    expect(nl.indexOf("t.locatieKnop")).toBeGreaterThan(0);
    expect(nl.indexOf("t.locatieKnop")).toBeLessThan(nl.indexOf("t.ofPostcode"));
    expect(nl).not.toContain('role="combobox"');
    expect(nl).not.toContain('role="listbox"');
    // de woonplaats komt uit PDOK, via de bestaande zoekroute en het pure hulpje
    expect(nl).toContain("/api/geo/search?soort=adres");
    expect(nl).toContain("plaatsBijPostcode(");
    // wat het formulier meestuurt blijft gelijk: postalCode en city
    expect(nl).toContain('name="postalCode"');
    expect(nl).toContain('name="city"');
  });

  it("het buitenland houdt land, postcode en woonplaats", () => {
    const buiten = veld.slice(veld.indexOf("{buitenland ? ("), veld.indexOf("<AdresKiezer"));
    expect(buiten).toContain('name="postalCode"');
    expect(buiten).toContain('name="city"');
  });
});
