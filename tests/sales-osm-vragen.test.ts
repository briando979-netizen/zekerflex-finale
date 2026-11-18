import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SalesCampaign } from "@prisma/client";

// Bedrijven zoeken via OpenStreetMap (14 nov 2026): de motor vroeg elke dag dezelfde vier zoekvragen, kreeg steeds dezelfde
// tien treffers per vraag en leverde na drie dagen (35 leads) elke dag 0 op. Nu schuift het venster per Amsterdamse dag
// vier vragen op, met Groningen en de regio rond de eigen vestiging vooraan als de campagne geen steden noemt.

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const findFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { salesLead: { findFirst: (...a: unknown[]) => findFirst(...a) } } }));
const zoek = vi.fn();
const buurt = vi.fn();
vi.mock("@/lib/integrations/osm-plaatsen", () => ({
  osmZoekBedrijven: (...a: unknown[]) => zoek(...a),
  osmBedrijvenVanSoorten: (...a: unknown[]) => buurt(...a),
}));
const createLead = vi.fn();
vi.mock("@/lib/sales/leads", () => ({ createLead: (...a: unknown[]) => createLead(...a) }));

import { CITIES, REGIO_STEDEN } from "@/lib/seo-cities";
import { STANDAARD_STEDEN, discoverViaOsm, osmVragen } from "@/lib/sales/discovery/osm";

const SECTOREN = ["horeca", "logistiek", "retail", "schoonmaak", "evenementen", "zorg"];
const dag = (n: number) => new Date(Date.UTC(2026, 10, 15 + n, 8, 0, 0)); // 08:00 UTC, de tijd van de sales-cron
const stadVan = (q: string) => q.split(" ").slice(1).join(" ");
const naam = (slug: string) => CITIES.find((c) => c.slug === slug)?.name ?? slug;

describe("de zoekvragen per dag", () => {
  it("zonder steden in de campagne: eerst Groningen, dan de regio, daarna alle andere steden met een pagina", () => {
    expect(STANDAARD_STEDEN.slice(0, 1 + REGIO_STEDEN.length)).toEqual(["groningen", ...REGIO_STEDEN].map(naam));
    expect([...STANDAARD_STEDEN].sort()).toEqual(CITIES.map((c) => c.name).sort());
    expect(osmVragen(SECTOREN, STANDAARD_STEDEN, dag(0))).toEqual(["horeca Groningen", "logistiek Groningen", "retail Groningen", "schoonmaak Groningen"]);
    // de eerste negen dagen (6 steden × 6 sectoren / 4) alleen Groningen en de regio
    const regio = new Set(["groningen", ...REGIO_STEDEN].map(naam));
    for (let n = 0; n < 9; n++) for (const q of osmVragen(SECTOREN, STANDAARD_STEDEN, dag(n))) expect(regio.has(stadVan(q)), q).toBe(true);
  });

  it("twee dagen achter elkaar geven andere vragen, en een hele ronde komt elke vraag langs", () => {
    const alle = new Set(STANDAARD_STEDEN.flatMap((c) => SECTOREN.map((s) => `${s} ${c}`)));
    const gezien = new Set<string>();
    const dagen = Math.ceil(alle.size / 4);
    for (let n = 0; n < dagen; n++) {
      const vandaag = osmVragen(SECTOREN, STANDAARD_STEDEN, dag(n));
      const morgen = osmVragen(SECTOREN, STANDAARD_STEDEN, dag(n + 1));
      expect(vandaag).toHaveLength(4);
      expect(vandaag.filter((q) => morgen.includes(q)), `dag ${n}`).toEqual([]);
      for (const q of vandaag) gezien.add(q);
    }
    expect(gezien).toEqual(alle);
    // daarna begint hij weer vooraan, ook vóór de begindag (geen negatieve plek)
    expect(osmVragen(SECTOREN, STANDAARD_STEDEN, dag(-1))).toHaveLength(4);
    expect(osmVragen(SECTOREN, STANDAARD_STEDEN, dag(-1)).every((q) => alle.has(q))).toBe(true);
  });

  it("de dag is die van Amsterdam: 23:30 UTC op 14 nov is al 15 nov", () => {
    expect(osmVragen(SECTOREN, STANDAARD_STEDEN, new Date("2026-11-15T00:30:00+01:00"))).toEqual(osmVragen(SECTOREN, STANDAARD_STEDEN, dag(0)));
    expect(osmVragen(SECTOREN, STANDAARD_STEDEN, new Date("2026-11-15T23:30:00+01:00"))).toEqual(osmVragen(SECTOREN, STANDAARD_STEDEN, dag(0)));
  });

  it("met eigen steden in de campagne draait het venster over die steden; met weinig vragen gaan ze allemaal mee", () => {
    const vragen = osmVragen(["horeca", "zorg"], ["Utrecht", "Zwolle", "Leiden"], dag(0));
    expect(vragen).toEqual(["horeca Utrecht", "zorg Utrecht", "horeca Zwolle", "zorg Zwolle"]);
    expect(osmVragen(["horeca", "zorg"], ["Utrecht", "Zwolle", "Leiden"], dag(1))).toEqual(["horeca Leiden", "zorg Leiden", "horeca Utrecht", "zorg Utrecht"]);
    expect(osmVragen(["horeca", "zorg"], ["Utrecht"], dag(5))).toEqual(["horeca Utrecht", "zorg Utrecht"]);
    expect(osmVragen(["horeca"], [], dag(0))).toEqual(["horeca"]);
  });
});

describe("discoverViaOsm", () => {
  const campagne = { id: "camp1", targetSectors: [], targetCities: [] } as unknown as SalesCampaign;

  beforeEach(() => {
    buurt.mockReset().mockResolvedValue([]);
    findFirst.mockReset().mockResolvedValue(null);
    createLead.mockReset().mockResolvedValue({ id: "lead" });
    zoek.mockReset().mockImplementation(async (q: string) => [{ naam: `Zaak ${q}`, plaats: stadVan(q) || null, website: null, telefoon: null }]);
  });

  it("vraagt elke dag de vragen van die dag, niet steeds dezelfde vier", async () => {
    const eerste = await discoverViaOsm(campagne, 12, dag(0));
    const vragenEerste = zoek.mock.calls.map((c) => c[0] as string);
    zoek.mockClear();
    const tweede = await discoverViaOsm(campagne, 12, dag(1));
    const vragenTweede = zoek.mock.calls.map((c) => c[0] as string);

    expect(eerste.queries).toEqual(vragenEerste);
    expect(tweede.queries).toEqual(vragenTweede);
    expect(vragenEerste).toHaveLength(4);
    expect(vragenEerste.filter((q) => vragenTweede.includes(q))).toEqual([]);
    expect(eerste.created + tweede.created).toBe(8);
    // de sector van een lead is het eerste woord van de vraag, de stad die van de treffer
    expect(createLead).toHaveBeenCalledWith(expect.objectContaining({ sector: "horeca", city: "Groningen", source: "openstreetmap" }));
    // Overpass gaf niets: elke vraag viel terug op Nominatim
    expect(eerste.overpass).toBe(0);
    expect(eerste.nominatim).toBe(4);
  });

  it("zoekt eerst op kenmerken rond het middelpunt van de plaats (Overpass); Nominatim alleen als dat niets geeft of faalt", async () => {
    const plek = (naam: string, plaats: string | null) => ({ id: `osmplaats-node-${naam}`, naam, adres: "", plaats, locatie: null, website: null, telefoon: null, soort: "restaurant", soortSleutel: "amenity", openingstijden: null, kaartUrl: "" });
    // dag 0: horeca, logistiek, retail, schoonmaak in Groningen. Overpass: horeca 2 treffers (één zonder plaats), logistiek
    // niets, retail een storing, schoonmaak 1 treffer
    buurt
      .mockResolvedValueOnce([plek("Eetcafé Test", "Groningen"), plek("Hotel Test", null)])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("overpass 504"))
      .mockResolvedValueOnce([plek("Schoonmaak Test", "Groningen")]);
    const r = await discoverViaOsm(campagne, 12, dag(0));
    expect(r.overpass).toBe(2);
    expect(r.nominatim).toBe(2);
    expect(zoek.mock.calls.map((c) => c[0])).toEqual(["logistiek Groningen", "retail Groningen"]);
    // de Overpass-vraag: rond het middelpunt van Groningen, met de kenmerken van horeca
    const eerste = buurt.mock.calls[0]?.[0] as { lat: number; lng: number; radiusM: number; soorten: { sleutel: string }[] };
    expect(eerste.lat).toBeCloseTo(53.2194, 3);
    expect(eerste.radiusM).toBe(5000);
    expect(eerste.soorten.map((s) => s.sleutel)).toEqual(["amenity", "tourism"]);
    // een treffer zonder plaats krijgt de plaats waar we zochten
    expect(createLead).toHaveBeenCalledWith(expect.objectContaining({ companyName: "Hotel Test", city: "Groningen", sector: "horeca" }));
    expect(createLead).toHaveBeenCalledWith(expect.objectContaining({ companyName: "Schoonmaak Test", sector: "schoonmaak" }));
  });
});

// 18 nov 2026: het mailadres dat het bedrijf zelf op de kaart zette (tag email of contact:email) gaat mee naar de lead.
describe("discoverViaOsm: het mailadres van de kaart", () => {
  const campagne = { id: "camp1", targetSectors: ["horeca"], targetCities: ["Groningen"] } as unknown as SalesCampaign;
  const plek = (naam: string, email: string | null) => ({ naam, plaats: "Groningen", website: null, telefoon: null, email });

  beforeEach(() => {
    findFirst.mockReset().mockResolvedValue(null);
    createLead.mockReset().mockResolvedValue({ id: "lead" });
    zoek.mockReset().mockResolvedValue([]);
  });

  it("een bruikbaar adres komt meteen op de lead, ook bij een gratis maildienst", async () => {
    buurt.mockReset().mockResolvedValue([plek("Eetcafe Een", "info@eetcafe-een.nl"), plek("Eetcafe Twee", "eetcafe.twee@gmail.com"), plek("Eetcafe Drie", null)]);
    await discoverViaOsm(campagne, 12, new Date("2026-11-18T09:00:00+01:00"));
    const leads = createLead.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(leads[0]).toMatchObject({ companyName: "Eetcafe Een", contactEmail: "info@eetcafe-een.nl", discoveredEmail: "info@eetcafe-een.nl" });
    expect(leads[1]).toMatchObject({ companyName: "Eetcafe Twee", contactEmail: "eetcafe.twee@gmail.com" });
    expect(leads[2]).not.toHaveProperty("contactEmail");
    expect(leads[2]).not.toHaveProperty("discoveredEmail");
  });

  it("geen no-reply, privacy, abuse of rommel (voorbeeldadres, sleutel van een foutenmelder)", async () => {
    buurt.mockReset().mockResolvedValue([
      plek("Zaak A", "noreply@zaak-a.nl"),
      plek("Zaak B", "privacy@zaak-b.nl"),
      plek("Zaak C", "abuse@zaak-c.nl"),
      plek("Zaak D", "jan@example.com"),
    ]);
    await discoverViaOsm(campagne, 12, new Date("2026-11-18T09:00:00+01:00"));
    expect(createLead).toHaveBeenCalledTimes(4);
    for (const c of createLead.mock.calls) expect(c[0]).not.toHaveProperty("contactEmail");
  });
});
