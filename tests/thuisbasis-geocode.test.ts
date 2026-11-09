import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// De thuisbasis van een werker: NL via PDOK, buitenland via OpenStreetMap
// (Nominatim). Vindt OSM niets, dan een eerlijke fout — nooit stil het midden
// van Nederland. Er gaat in deze test niets echt naar buiten.

const geocodePostcode = vi.fn();
vi.mock("@/lib/integrations/pdok", () => ({ geocodePostcode: (...a: unknown[]) => geocodePostcode(...a) }));
vi.mock("@/lib/integrations/osm-plaatsen", () => ({
  inDeRij: (_bron: string, _pauze: number, taak: () => Promise<unknown>) => taak(),
  NOMINATIM_PAUZE_MS: 0,
  OSM_USER_AGENT: "ZekerFlexBot/test",
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { geocodeThuisbasis, thuisbasisVergeetAlles } from "@/lib/geo/thuisbasis";
import { AppError } from "@/lib/errors";

const fetchMock = vi.fn();
const antwoord = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  thuisbasisVergeetAlles();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("geocodeThuisbasis", () => {
  it("gebruikt in Nederland PDOK, zoals altijd", async () => {
    geocodePostcode.mockResolvedValue({ latitude: 52.37, longitude: 4.9, postalCode: "1012AB", city: "Amsterdam", street: null, approximate: false });
    const r = await geocodeThuisbasis({ land: "NL", postcode: "1012 AB" });
    expect(r.city).toBe("Amsterdam");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("zoekt in het buitenland bij OSM met alleen postcode, plaats en land", async () => {
    fetchMock.mockImplementation(async () => antwoord([{ lat: "51.2194", lon: "4.4025", address: { city: "Antwerpen", postcode: "2000" } }]));
    const r = await geocodeThuisbasis({ land: "BE", postcode: "2000", plaats: "Antwerpen", huisnummer: "12" });
    expect(r).toMatchObject({ latitude: 51.2194, longitude: 4.4025, postalCode: "BE-2000", city: "Antwerpen", approximate: false });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.hostname).toBe("nominatim.openstreetmap.org");
    expect(url.searchParams.get("countrycodes")).toBe("be");
    expect(url.searchParams.get("postalcode")).toBe("2000");
    expect(url.searchParams.get("city")).toBe("Antwerpen");
    // geen huisnummer, geen vrije tekst naar buiten
    expect(url.search).not.toContain("12");
    expect(url.searchParams.get("q")).toBeNull();
    expect(geocodePostcode).not.toHaveBeenCalled();
  });

  it("probeert het zonder plaats als de plaats anders gespeld is", async () => {
    fetchMock.mockResolvedValueOnce(antwoord([])).mockResolvedValueOnce(antwoord([{ lat: "51.2", lon: "4.4", address: { town: "Antwerpen" } }]));
    const r = await geocodeThuisbasis({ land: "BE", postcode: "2000", plaats: "Anvers" });
    expect(r.city).toBe("Antwerpen");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[1]?.[0])).searchParams.get("city")).toBeNull();
  });

  it("geeft een eerlijke fout als OSM niets vindt, nooit het midden van Nederland", async () => {
    // elke aanvraag een eigen antwoord: een Response-body is maar één keer te lezen
    fetchMock.mockImplementation(async () => antwoord([]));
    const fout = await geocodeThuisbasis({ land: "DE", postcode: "99999", plaats: "Nergens" }).catch((e: unknown) => e);
    expect(fout).toBeInstanceOf(AppError);
    expect((fout as AppError).status).toBe(422);
    expect((fout as AppError).details).toEqual({ reden: "thuisbasis-niet-gevonden" });
    expect(fetchMock).toHaveBeenCalledTimes(2); // met plaats, daarna zonder
  });

  it("meldt het eerlijk als OSM niet bereikbaar is, en onthoudt dat niet", async () => {
    fetchMock.mockRejectedValueOnce(new Error("netwerk weg"));
    const fout = await geocodeThuisbasis({ land: "DE", postcode: "10115", plaats: "Berlin" }).catch((e: unknown) => e);
    expect((fout as AppError).status).toBe(503);
    expect((fout as AppError).details).toEqual({ reden: "thuisbasis-onbereikbaar" });
    // een minuut later werkt het weer: geen oude uitslag uit het geheugen
    fetchMock.mockResolvedValueOnce(antwoord([{ lat: "52.53", lon: "13.38", address: { city: "Berlin" } }]));
    const r = await geocodeThuisbasis({ land: "DE", postcode: "10115", plaats: "Berlin" });
    expect(r.postalCode).toBe("DE-10115");
  });

  it("vraagt hetzelfde adres binnen het uur niet twee keer (controle vóór de scan + insturen)", async () => {
    fetchMock.mockImplementation(async () => antwoord([{ lat: "50.85", lon: "4.35", address: { city: "Brussel" } }]));
    await geocodeThuisbasis({ land: "BE", postcode: "1000", plaats: "Brussel" });
    await geocodeThuisbasis({ land: "BE", postcode: "1000", plaats: "brussel" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
