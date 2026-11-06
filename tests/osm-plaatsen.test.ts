import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Onze eigen bron mag in een test nooit echt het internet op: fetch is gemockt.
vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/ai/gratis", () => ({ gratisAan: () => false, primeGratis: async () => undefined }));
vi.mock("@/lib/env", () => ({ env: { GOOGLE_MAPS_API_KEY: undefined } }));

import {
  NOMINATIM_PAUZE_MS,
  OVERPASS_PAUZE_MS,
  inDeRij,
  isOsmPlaatsId,
  leesOsmPlaatsId,
  osmBedrijvenInBuurt,
  osmBijHost,
  osmPlaatsId,
  osmPlaatsOpvragen,
  osmUrenNaarRegels,
  osmVergeetAlles,
  osmZoekBedrijven,
  type OsmPlaats,
} from "@/lib/integrations/osm-plaatsen";
import { isPlaceId } from "@/lib/review-scan/model";

const BAKKER = {
  place_id: 1,
  osm_type: "node",
  osm_id: 2449097266,
  lat: "52.0907123",
  lon: "5.1214456",
  category: "shop",
  type: "bakery",
  name: "Bakkerij Jansen",
  display_name: "Bakkerij Jansen, Oudegracht 1, Utrecht, Nederland",
  address: { shop: "Bakkerij Jansen", house_number: "1", road: "Oudegracht", postcode: "3511 AA", city: "Utrecht", country_code: "nl" },
  extratags: { website: "www.bakkerijjansen.nl", phone: "+31 30 123 4567; 06-12345678", opening_hours: "Mo-Fr 08:00-17:00; Sa 08:00-16:00; Su off" },
};

function antwoord(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 503, json: async () => body } as unknown as Response;
}

let haal: ReturnType<typeof vi.fn>;

beforeEach(() => {
  osmVergeetAlles();
  haal = vi.fn(async () => antwoord([BAKKER]));
  vi.stubGlobal("fetch", haal);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bedrijven opzoeken bij OpenStreetMap", () => {
  it("leest naam, adres, plaats, coördinaten, website en telefoon uit Nominatim", async () => {
    const lijst = await osmZoekBedrijven("Bakkerij Jansen Utrecht");
    expect(lijst).toHaveLength(1);
    expect(lijst[0]).toMatchObject({
      naam: "Bakkerij Jansen",
      adres: "Oudegracht 1, 3511 AA Utrecht",
      plaats: "Utrecht",
      website: "https://www.bakkerijjansen.nl/",
      telefoon: "+31301234567",
      soort: "bakery",
      soortSleutel: "shop",
      kaartUrl: "https://www.openstreetmap.org/node/2449097266",
    });
    expect(lijst[0]?.locatie).toEqual({ lat: 52.0907123, lng: 5.1214456 });
  });

  it("vraagt Nederland, Nederlands en een nette User-Agent, zonder e-mailadres van de eigenaar", async () => {
    await osmZoekBedrijven("Bakkerij Jansen Utrecht");
    const url = new URL(String(haal.mock.calls[0]?.[0]));
    expect(url.hostname).toBe("nominatim.openstreetmap.org");
    expect(url.searchParams.get("format")).toBe("jsonv2");
    expect(url.searchParams.get("countrycodes")).toBe("nl");
    expect(url.searchParams.get("extratags")).toBe("1");
    const init = haal.mock.calls[0]?.[1] as { headers: Record<string, string> };
    expect(init.headers["user-agent"]).toMatch(/^ZekerFlexBot\//);
    expect(init.headers["user-agent"]).not.toContain("@");
  });

  it("geeft nooit een beoordeling terug — die velden bestaan hier niet", async () => {
    const lijst = await osmZoekBedrijven("Bakkerij Jansen Utrecht");
    const velden = Object.keys(lijst[0] ?? {});
    expect(velden).not.toContain("rating");
    expect(velden).not.toContain("aantal");
    expect(velden).not.toContain("reviews");
    expect(JSON.stringify(lijst)).not.toMatch(/rating|sterren|review/i);
  });

  it("slaat een plek zonder naam over: dat is geen bedrijf", async () => {
    haal.mockResolvedValueOnce(antwoord([{ osm_type: "node", osm_id: 7, lat: "52", lon: "5", display_name: "Oudegracht, Utrecht" }]));
    expect(await osmZoekBedrijven("Oudegracht Utrecht")).toEqual([]);
  });

  it("onthoudt een antwoord, zodat we niets twee keer vragen", async () => {
    await osmZoekBedrijven("Bakkerij Jansen Utrecht");
    await osmZoekBedrijven("Bakkerij Jansen Utrecht");
    expect(haal).toHaveBeenCalledTimes(1);
  });

  it("bewaart een storing niet: de volgende poging vraagt het opnieuw", async () => {
    haal.mockResolvedValueOnce(antwoord({}, false));
    expect(await osmZoekBedrijven("Bakkerij Jansen Utrecht")).toEqual([]);
    expect(await osmZoekBedrijven("Bakkerij Jansen Utrecht")).toHaveLength(1);
    expect(haal).toHaveBeenCalledTimes(2);
  });

  it("vraagt niets bij een te korte zoekterm", async () => {
    expect(await osmZoekBedrijven("ab")).toEqual([]);
    expect(haal).not.toHaveBeenCalled();
  });

  it("vraagt een bekend bedrijf op zijn eigen id op, en pakt het daarna uit het geheugen", async () => {
    const id = osmPlaatsId("node", 2449097266);
    const p = await osmPlaatsOpvragen(id);
    expect(p?.naam).toBe("Bakkerij Jansen");
    const url = new URL(String(haal.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/lookup");
    expect(url.searchParams.get("osm_ids")).toBe("N2449097266");
    await osmPlaatsOpvragen(id);
    expect(haal).toHaveBeenCalledTimes(1);
  });

  it("geeft null bij een id dat niet van ons is", async () => {
    expect(await osmPlaatsOpvragen("ChIJN1t_tDeuEmsRUsoyG83frY4")).toBeNull();
    expect(haal).not.toHaveBeenCalled();
  });
});

describe("bedrijven in de buurt via Overpass", () => {
  const ELEMENT = {
    type: "way",
    id: 998877,
    center: { lat: 52.1, lon: 5.2 },
    tags: { name: "Bakker de Vries", amenity: "cafe", "addr:street": "Nachtegaalstraat", "addr:housenumber": "12", "addr:city": "Utrecht", phone: "030-7654321" },
  };

  it("stelt een nette Overpass-vraag en leest de elementen uit", async () => {
    haal.mockResolvedValueOnce(antwoord({ elements: [ELEMENT] }));
    const lijst = await osmBedrijvenInBuurt({ lat: 52.0907, lng: 5.1214, soort: { sleutel: "amenity", soort: "cafe" }, radiusM: 3000, aantal: 5 });
    expect(lijst[0]).toMatchObject({ naam: "Bakker de Vries", adres: "Nachtegaalstraat 12, Utrecht", telefoon: "0307654321", soort: "cafe", soortSleutel: "amenity" });
    expect(lijst[0]?.locatie).toEqual({ lat: 52.1, lng: 5.2 });
    const body = String((haal.mock.calls[0]?.[1] as { body: string }).body);
    expect(decodeURIComponent(body)).toContain('nwr["amenity"="cafe"](around:3000,52.090700,5.121400)');
  });

  it("weigert een soort met vreemde tekens, zodat niemand de vraag kan oprekken", async () => {
    expect(await osmBedrijvenInBuurt({ lat: 52, lng: 5, soort: { sleutel: "amenity", soort: 'cafe"];out meta;//' } })).toEqual([]);
    expect(haal).not.toHaveBeenCalled();
  });
});

describe("id's van OSM-objecten", () => {
  it("zijn lang genoeg om als place-id door te geven en zijn weer terug te lezen", () => {
    const id = osmPlaatsId("node", 2449097266);
    expect(id).toBe("osmplaats-node-002449097266");
    expect(isPlaceId(id)).toBe(true); // lib/review-scan/model.ts laat hem door
    expect(leesOsmPlaatsId(id)).toEqual({ soort: "node", id: "2449097266" });
    expect(leesOsmPlaatsId(osmPlaatsId("way", "12345"))).toEqual({ soort: "way", id: "12345" });
    expect(isOsmPlaatsId("ChIJN1t_tDeuEmsRUsoyG83frY4")).toBe(false);
    expect(leesOsmPlaatsId("osmplaats-node-000000000000")).toBeNull();
  });
});

describe("openingstijden van OSM naar Nederlandse regels", () => {
  it("maakt van de OSM-notatie regels zoals Google ze geeft", () => {
    expect(osmUrenNaarRegels("Mo-Fr 08:00-17:00; Sa 08:00-16:00; Su off")).toEqual([
      "maandag: 08:00 – 17:00",
      "dinsdag: 08:00 – 17:00",
      "woensdag: 08:00 – 17:00",
      "donderdag: 08:00 – 17:00",
      "vrijdag: 08:00 – 17:00",
      "zaterdag: 08:00 – 16:00",
      "zondag: Gesloten",
    ]);
  });

  it("kent een pauze tussen de middag, losse dagen en dag en nacht open", () => {
    expect(osmUrenNaarRegels("Mo,We 09:00-12:00,13:00-17:00")).toEqual(["maandag: 09:00 – 12:00 en 13:00 – 17:00", "woensdag: 09:00 – 12:00 en 13:00 – 17:00"]);
    expect(osmUrenNaarRegels("24/7")).toHaveLength(7);
  });

  it("gokt nooit een tijd die er niet staat", () => {
    expect(osmUrenNaarRegels(null)).toEqual([]);
    expect(osmUrenNaarRegels("op afspraak")).toEqual([]);
    expect(osmUrenNaarRegels("Mo-Fr sunrise-sunset")).toEqual([]);
  });
});

describe("snelheidsrem", () => {
  it("houdt zich aan de regel van OpenStreetMap: hooguit één aanvraag per seconde", () => {
    expect(NOMINATIM_PAUZE_MS).toBeGreaterThanOrEqual(1000);
    expect(OVERPASS_PAUZE_MS).toBeGreaterThanOrEqual(NOMINATIM_PAUZE_MS);
  });

  it("laat twee aanvragen achter elkaar netjes wachten in plaats van ze samen te versturen", async () => {
    const begonnen: number[] = [];
    const taak = async () => {
      begonnen.push(Date.now());
    };
    const start = Date.now();
    await Promise.all([inDeRij("test-rem", 60, taak), inDeRij("test-rem", 60, taak), inDeRij("test-rem", 60, taak)]);
    expect(begonnen).toHaveLength(3);
    expect((begonnen[1] ?? 0) - (begonnen[0] ?? 0)).toBeGreaterThanOrEqual(50);
    expect((begonnen[2] ?? 0) - (begonnen[1] ?? 0)).toBeGreaterThanOrEqual(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(100);
  });

  it("laat de rij doorlopen als een aanvraag mislukt", async () => {
    await expect(inDeRij("test-stuk", 10, async () => Promise.reject(new Error("stuk")))).rejects.toThrow("stuk");
    await expect(inDeRij("test-stuk", 10, async () => "klaar")).resolves.toBe("klaar");
  });
});

describe("het bedrijf bij een website vinden", () => {
  it("pakt alleen het bedrijf waarvan de website klopt, nooit een naamgenoot", () => {
    // een volledig bedrijf, zodat we het type niet hoeven te omzeilen
    const bedrijf = (naam: string, website: string): OsmPlaats => ({
      id: `osmplaats-node-${naam.length}`,
      naam,
      adres: "",
      plaats: null,
      locatie: null,
      website,
      telefoon: null,
      soort: null,
      soortSleutel: null,
      openingstijden: null,
      kaartUrl: "https://www.openstreetmap.org/",
    });
    const lijst: OsmPlaats[] = [
      bedrijf("Bakkerij Jansen Amsterdam", "https://andere-jansen.nl/"),
      bedrijf("Bakkerij Jansen Utrecht", "http://www.bakkerijjansen.nl/contact"),
    ];
    expect(osmBijHost(lijst, "bakkerijjansen.nl")?.naam).toBe("Bakkerij Jansen Utrecht");
    expect(osmBijHost(lijst, "iemandanders.nl")).toBeNull();
  });
});
