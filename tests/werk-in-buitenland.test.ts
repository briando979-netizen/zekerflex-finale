import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Werklocaties buiten Nederland (28 nov 2026): de vlag `werk-in-belgie` (alleen België, en dan alleen Vlaanderen) en
// `werk-in-buitenland` (elk land), beide standaard uit. Het adres komt van OpenStreetMap (lib/geo/vestiging-buitenland.ts),
// het land staat in de postcode ("BE-2000", zoals de thuisbasis van een werker, lib/geo/thuisland.ts). Met beide vlaggen uit
// verandert er niets: geen keuze in de formulieren, de route zegt nee zonder iets naar buiten te sturen, en een Nederlandse
// werklocatie ziet er overal precies zo uit als vroeger. Er gaat in deze test niets echt naar buiten.

const featureEnabled = vi.fn();
vi.mock("@/lib/flags", () => ({ featureEnabled: (...a: unknown[]) => featureEnabled(...a) }));
vi.mock("@/lib/integrations/osm-plaatsen", () => ({
  inDeRij: (_bron: string, _pauze: number, taak: () => Promise<unknown>) => taak(),
  NOMINATIM_PAUZE_MS: 0,
  OSM_USER_AGENT: "ZekerFlexBot/test",
}));
const warn = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { warn: (...a: unknown[]) => warn(...a), info: vi.fn(), error: vi.fn() } }));
const getPrincipal = vi.fn();
vi.mock("@/lib/auth", async () => {
  const { AppError } = await import("@/lib/errors");
  return {
    requirePrincipal: async () => {
      const p = await getPrincipal();
      if (!p) throw AppError.unauthenticated();
      return p;
    },
    requireRole: () => undefined,
  };
});
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/admin/eigen-test", () => ({ leesEigenTest: vi.fn() }));

import {
  buitenlandFoutMelding,
  buitenlandInvoerMelding,
  buitenlandsePostcode,
  controleerVestigingPostcode,
  heeftPostcode,
  herkenLand,
  isVlaamsePostcode,
  landKeuzes,
  landVanVestiging,
  leesGevondenBuitenlandsAdres,
  metLand,
  opslagPostcode,
  plaatsRegel,
  postcodePlaats,
  postcodeTekst,
  werklocatieLanden,
  NIET_VLAANDEREN_MELDING,
  WERK_IN_BELGIE_VLAG,
  WERK_IN_BUITENLAND_VLAG,
} from "@/lib/geo/vestiging-land";
import { buitenlandPostcode } from "@/lib/geo/thuisland";
import { landNaam } from "@/lib/werkrecht/landen";
import { vestigingRegel } from "@/lib/geo/adres-keuze";
import {
  controleerWerklocatiePostcode,
  vestigingBuitenlandVergeetAlles,
  werklocatieKeuzes,
  werklocatieLandenVoor,
  zoekBuitenlandsAdres,
} from "@/lib/geo/vestiging-buitenland";
import { jobPostingJsonLd, type PublicShift } from "@/lib/public-shifts";
import { POST } from "@/app/api/werkgever/adres-buitenland/route";
import { POST as POST_OUD } from "@/app/api/werkgever/adres-belgie/route";
import { AppError } from "@/lib/errors";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
const fetchMock = vi.fn();
const antwoord = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** een huis aan de Meir in Antwerpen, zoals Nominatim (jsonv2, addressdetails) het geeft (zo gemeten op 28 nov 2026) */
const MEIR = { lat: "51.2177", lon: "4.4069", place_rank: 30, address: { road: "Meir", house_number: "1", city: "Antwerpen", postcode: "2000", country_code: "be" } };
const BERLIJN = { lat: "52.5200", lon: "13.4050", place_rank: 30, address: { road: "Unter den Linden", city: "Berlin", postcode: "10117", country_code: "de" } };
const DUBAI = { lat: "25.1972", lon: "55.2744", place_rank: 30, address: { road: "Sheikh Mohammed bin Rashid Boulevard", city: "Dubai", country_code: "ae" } };

/** de vlaggen: welke staan aan */
function vlaggen(aan: { belgie?: boolean; buitenland?: boolean }) {
  featureEnabled.mockImplementation(async (key: string) => (key === WERK_IN_BELGIE_VLAG ? aan.belgie === true : key === WERK_IN_BUITENLAND_VLAG ? aan.buitenland === true : false));
}

beforeEach(() => {
  vestigingBuitenlandVergeetAlles();
  vi.stubGlobal("fetch", fetchMock);
  vlaggen({});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("welke landen een bedrijf mag kiezen (puur)", () => {
  it("beide vlaggen uit: alleen Nederland; alleen België aan: Nederland en België; alle landen aan: elk land", () => {
    expect(werklocatieLanden({ belgie: false, buitenland: false })).toEqual(["NL"]);
    expect(werklocatieLanden({ belgie: true, buitenland: false })).toEqual(["NL", "BE"]);
    const alle = werklocatieLanden({ belgie: false, buitenland: true });
    expect(alle.slice(0, 5)).toEqual(["NL", "BE", "DE", "LU", "FR"]);
    expect(new Set(alle).size).toBe(alle.length);
    expect(alle.length).toBeGreaterThan(230);
    for (const c of ["CH", "GB", "US", "JP", "AE", "PL", "IS", "NO", "LI"]) expect(alle, c).toContain(c);
    // onbewoonde gebieden niet
    expect(alle).not.toContain("AQ");
    expect(werklocatieLanden({ belgie: true, buitenland: true })).toEqual(alle);
  });

  it("de keuzelijst: de vijf vooraan, dan de EU en de EER op naam, dan de rest op naam, in de taal van de lezer", () => {
    const lijst = landKeuzes(werklocatieLanden({ belgie: false, buitenland: true }), "nl");
    expect(lijst.slice(0, 5)).toEqual([
      { code: "NL", naam: "Nederland" },
      { code: "BE", naam: "België" },
      { code: "DE", naam: "Duitsland" },
      { code: "LU", naam: "Luxemburg" },
      { code: "FR", naam: "Frankrijk" },
    ]);
    const euEer = ["AT", "BG", "CY", "CZ", "DK", "EE", "ES", "FI", "GR", "HR", "HU", "IE", "IT", "LT", "LV", "MT", "PL", "PT", "RO", "SE", "SI", "SK", "IS", "LI", "NO"];
    const blok = lijst.slice(5, 5 + euEer.length);
    expect(blok.map((l) => l.code).sort()).toEqual([...euEer].sort());
    const opNaam = (l: { naam: string }[]) => [...l].sort((a, b) => new Intl.Collator("nl").compare(a.naam, b.naam));
    expect(blok).toEqual(opNaam(blok));
    const rest = lijst.slice(5 + euEer.length);
    expect(rest).toEqual(opNaam(rest));
    expect(rest.map((l) => l.code)).toContain("CH");
    expect(landKeuzes(["NL", "BE"], "en")).toEqual([
      { code: "NL", naam: "Netherlands" },
      { code: "BE", naam: "Belgium" },
    ]);
  });

  it("weet welke landen geen postcode hebben", () => {
    expect(heeftPostcode("AE")).toBe(false);
    expect(heeftPostcode("HK")).toBe(false);
    expect(heeftPostcode("DE")).toBe(true);
    expect(heeftPostcode("BE")).toBe(true);
  });
});

describe("postcodes (puur)", () => {
  it("herkent een Nederlandse en een Belgische postcode bij het invullen", () => {
    expect(herkenLand("1012 AB")).toBe("NL");
    expect(herkenLand("2000")).toBe("BE");
    expect(herkenLand("B-2000")).toBe("BE");
    expect(herkenLand("0999")).toBeNull();
    expect(herkenLand("12345")).toBeNull();
  });

  it("België vier cijfers; elders vrije tekst van 1 tot 10 letters, cijfers, spaties of streepjes", () => {
    expect(buitenlandsePostcode("BE", "2000")).toBe("2000");
    expect(buitenlandsePostcode("BE", "20000")).toBeNull();
    expect(buitenlandsePostcode("DE", " 10115 ")).toBe("10115");
    expect(buitenlandsePostcode("GB", "sw1a  1aa")).toBe("SW1A 1AA");
    expect(buitenlandsePostcode("PL", "00-950")).toBe("00-950");
    expect(buitenlandsePostcode("DE", "")).toBe("");
    expect(buitenlandsePostcode("DE", "12345678901")).toBeNull();
    expect(buitenlandsePostcode("DE", "AB_12")).toBeNull();
  });

  it("bewaart precies zoals de thuisbasis van een werker in het buitenland: <LANDCODE>-<postcode>", () => {
    expect(opslagPostcode("DE", "10115")).toBe("DE-10115");
    expect(opslagPostcode("DE", "10115")).toBe(buitenlandPostcode("DE", "10115"));
    expect(opslagPostcode("BE", "B-2000")).toBe("BE-2000");
    expect(opslagPostcode("GB", "sw1a 1aa")).toBe("GB-SW1A 1AA");
    expect(opslagPostcode("AE", "")).toBe("AE-");
    expect(opslagPostcode("BE", "20000")).toBeNull();
  });

  it("leest het land uit een opgeslagen postcode; zonder (bekende, buitenlandse) landcode blijft het Nederland", () => {
    expect(landVanVestiging("BE-2000")).toBe("BE");
    expect(landVanVestiging("DE-10115")).toBe("DE");
    expect(landVanVestiging("AE-")).toBe("AE");
    expect(landVanVestiging("1012AB")).toBe("NL");
    expect(landVanVestiging("3511")).toBe("NL");
    expect(landVanVestiging("NL-1012")).toBe("NL");
    expect(landVanVestiging("XX-1234")).toBe("NL");
    expect(landVanVestiging(null)).toBe("NL");
  });

  it("toont de postcode zonder landcode; een Nederlandse precies zoals hij was", () => {
    expect(postcodeTekst("BE-2000")).toBe("2000");
    expect(postcodeTekst("GB-SW1A 1AA")).toBe("SW1A 1AA");
    expect(postcodeTekst("AE-")).toBe("");
    expect(postcodeTekst("1012 AB ")).toBe("1012 AB ");
  });

  it("België: alleen Vlaanderen (1500–3999 en 8000–9999), niet Brussel en Wallonië", () => {
    for (const pc of ["1500", "2000", "3000", "3999", "8000", "9000", "9999", "B-2018"]) expect(isVlaamsePostcode(pc), pc).toBe(true);
    for (const pc of ["1000", "1299", "1300", "1499", "4000", "5000", "6000", "7999", "1012 AB", "20000", ""]) expect(isVlaamsePostcode(pc), pc).toBe(false);
  });
});

describe("weergave (puur)", () => {
  it("zet de landnaam achter een adres buiten Nederland, in de taal van de lezer; Nederland ongewijzigd", () => {
    expect(metLand("Damrak 1, 1012AB Amsterdam", "1012AB", "nl")).toBe("Damrak 1, 1012AB Amsterdam");
    expect(metLand("Meir 1, 2000 Antwerpen", "BE-2000", "nl")).toBe("Meir 1, 2000 Antwerpen, België");
    expect(metLand("Meir 1, 2000 Antwerpen", "BE-2000", "en")).toBe("Meir 1, 2000 Antwerpen, Belgium");
    expect(metLand("Antwerpen", "BE-2000", "pl")).toBe("Antwerpen, Belgia");
    expect(plaatsRegel({ postalCode: "DE-10115", city: "Berlin" }, "nl")).toBe("10115 Berlin, Duitsland");
    expect(plaatsRegel({ postalCode: "AE-", city: "Dubai" }, "nl")).toBe(`Dubai, ${landNaam("AE", "nl")}`);
    expect(plaatsRegel({ postalCode: "1012AB", city: "Amsterdam" }, "nl")).toBe("1012AB Amsterdam");
  });

  it("agenda, kilometers en bureau: in Nederland precies het oude `${postcode} ${plaats}`, daarbuiten met het land", () => {
    expect(postcodePlaats({ postalCode: "1012AB", city: "Amsterdam" }, "nl")).toBe("1012AB Amsterdam");
    expect(postcodePlaats({ postalCode: null, city: "Amsterdam" }, "nl")).toBe(" Amsterdam");
    expect(postcodePlaats({ postalCode: "BE-2000", city: "Antwerpen" }, "nl")).toBe("2000 Antwerpen, België");
    expect(vestigingRegel({ addressLine: "Meir 1", postalCode: "BE-2000", city: "Antwerpen" })).toBe("Meir 1, 2000 Antwerpen");
    expect(vestigingRegel({ addressLine: "Grote Markt 1", postalCode: "9712HN", city: "Groningen" })).toBe("Grote Markt 1, 9712HN Groningen");
  });

  it("de plekken die een adres tonen gebruiken de hulpjes", () => {
    expect(lees("app/api/me/assignments/[assignmentId]/ics/route.ts")).toContain("postcodePlaats(b, \"nl\")");
    expect(lees("lib/worker/calendar-feed.ts")).toContain("postcodePlaats(b, lang)");
    expect(lees("lib/worker/mileage.ts")).toContain('postcodePlaats(t.branch, "nl")');
    expect(lees("lib/uitzend/bureau.ts")).toContain("metLand(");
    expect(lees("app/dashboard/inchecken/[timesheetId]/page.tsx")).toContain("plaatsRegel(ts.branch, await getLocale())");
    expect(lees("app/dashboard/klussen/[shiftId]/page.tsx")).toContain("plaatsRegel(s, await getLocale())");
    // de klussenlijst: het land achter de plaats, op de server in de taal van de werker
    expect(lees("lib/dashboard/marketplace.ts")).toContain("land: landVanVestiging(s.branch.postalCode)");
    expect(lees("app/dashboard/klussen/page.tsx")).toContain("landNaam(s.land, taal)");
  });
});

describe("de servercontrole van de postcode (POST en PATCH van een locatie, de eenmalige locatie)", () => {
  const ALLE = werklocatieLanden({ belgie: false, buitenland: true });

  it("Nederland precies zoals altijd: 4 tot 12 tekens, zoals ingevuld", () => {
    expect(controleerVestigingPostcode("1012AB", ["NL"])).toEqual({ ok: true, postalCode: "1012AB" });
    expect(controleerVestigingPostcode("NL-1012", ["NL"])).toEqual({ ok: true, postalCode: "NL-1012" });
    expect(controleerVestigingPostcode("XX-1234", ["NL"])).toEqual({ ok: true, postalCode: "XX-1234" });
    expect(controleerVestigingPostcode("123", ["NL"])).toMatchObject({ ok: false, buitenland: false });
    expect(controleerVestigingPostcode("1234567890123", ["NL"])).toMatchObject({ ok: false, buitenland: false });
  });

  it("buiten Nederland alleen een land dat de vlaggen toestaan, met een passende postcode", () => {
    expect(controleerVestigingPostcode("BE-2000", ["NL"])).toEqual({ ok: false, melding: "Werklocaties in dit land staan nog niet aan.", buitenland: true });
    expect(controleerVestigingPostcode("be-2000", ["NL", "BE"])).toEqual({ ok: true, postalCode: "BE-2000" });
    expect(controleerVestigingPostcode("DE-10115", ["NL", "BE"])).toMatchObject({ ok: false, buitenland: true });
    expect(controleerVestigingPostcode("DE-10115", ALLE)).toEqual({ ok: true, postalCode: "DE-10115" });
    expect(controleerVestigingPostcode("BE-20000", ["NL", "BE"])).toMatchObject({ ok: false });
    expect(controleerVestigingPostcode("AE-", ALLE)).toEqual({ ok: true, postalCode: "AE-" });
    expect(controleerVestigingPostcode("DE-", ALLE)).toMatchObject({ ok: false });
  });

  it("België buiten Vlaanderen wordt geweigerd, ook met alle landen aan", () => {
    for (const landen of [["NL", "BE"], ALLE]) {
      expect(controleerVestigingPostcode("BE-1000", landen)).toEqual({ ok: false, melding: NIET_VLAANDEREN_MELDING, buitenland: true });
      expect(controleerVestigingPostcode("BE-5000", landen)).toMatchObject({ ok: false, melding: NIET_VLAANDEREN_MELDING });
      expect(controleerVestigingPostcode("BE-9000", landen)).toEqual({ ok: true, postalCode: "BE-9000" });
    }
  });

  it("een Nederlandse postcode kijkt niet eens naar de vlaggen; een buitenlandse wel", async () => {
    const wie = { userId: "u1" };
    expect(await controleerWerklocatiePostcode("3012AA", wie)).toBe("3012AA");
    expect(featureEnabled).not.toHaveBeenCalled();
    await expect(controleerWerklocatiePostcode("123", wie)).rejects.toMatchObject({ status: 422, message: "Controleer de ingevulde gegevens" });
    await expect(controleerWerklocatiePostcode("BE-2000", wie)).rejects.toMatchObject({ status: 422, message: "Werklocaties in dit land staan nog niet aan." });
    vlaggen({ belgie: true });
    expect(await controleerWerklocatiePostcode("BE-2000", wie)).toBe("BE-2000");
    await expect(controleerWerklocatiePostcode("DE-10115", wie)).rejects.toMatchObject({ status: 422 });
    await expect(controleerWerklocatiePostcode("BE-1000", wie)).rejects.toMatchObject({ status: 422, message: NIET_VLAANDEREN_MELDING });
    vlaggen({ buitenland: true });
    expect(await controleerWerklocatiePostcode("DE-10115", wie)).toBe("DE-10115");
  });

  it("de routes en de eenmalige locatie gebruiken die controle", () => {
    expect(lees("app/api/werkgever/branches/route.ts")).toContain("await controleerWerklocatiePostcode(rest.postalCode, principal)");
    expect(lees("app/api/werkgever/branches/[id]/route.ts")).toContain("await controleerWerklocatiePostcode(d.postalCode, principal)");
    expect(lees("lib/shifts/create.ts")).toContain("await controleerWerklocatiePostcode(input.adHocAddress.postalCode, principal");
  });
});

describe("het formulier (puur)", () => {
  it("zegt vóór het zoeken al wat er niet klopt", () => {
    expect(buitenlandInvoerMelding("BE", { straat: "Meir 1", postcode: "1012 AB", plaats: "" })).toBe("buitenlandNlPostcode");
    // elders houden we een postcode die op een Nederlandse lijkt niet tegen: OSM beslist
    expect(buitenlandInvoerMelding("DE", { straat: "Hauptstr. 1", postcode: "1012 AB", plaats: "" })).toBeNull();
    expect(buitenlandInvoerMelding("BE", { straat: "Meir", postcode: "2000", plaats: "" })).toBe("buitenlandStraat");
    expect(buitenlandInvoerMelding("BE", { straat: "Meir 1", postcode: "", plaats: "" })).toBe("buitenlandPostcodeBE");
    expect(buitenlandInvoerMelding("DE", { straat: "Hauptstr. 1", postcode: "", plaats: "Berlin" })).toBe("buitenlandPostcode");
    expect(buitenlandInvoerMelding("BE", { straat: "Grote Markt 1", postcode: "1000", plaats: "Brussel" })).toBe("buitenlandNietVlaanderen");
    expect(buitenlandInvoerMelding("BE", { straat: "Meir 1", postcode: "2000", plaats: "" })).toBeNull();
    expect(buitenlandInvoerMelding("AE", { straat: "Sheikh Zayed Rd 1", postcode: "", plaats: "" })).toBe("buitenlandPlaats");
    expect(buitenlandInvoerMelding("AE", { straat: "Sheikh Zayed Rd 1", postcode: "", plaats: "Dubai" })).toBeNull();
  });

  it("vertaalt de reden van de server naar een tekst van het formulier", () => {
    const fout = (reden: string) => ({ error: { details: { reden } } });
    expect(buitenlandFoutMelding(fout("buitenland-niet-gevonden"), "DE")).toBe("buitenlandNietGevonden");
    expect(buitenlandFoutMelding(fout("buitenland-postcode"), "BE")).toBe("buitenlandPostcodeBE");
    expect(buitenlandFoutMelding(fout("buitenland-postcode"), "DE")).toBe("buitenlandPostcode");
    expect(buitenlandFoutMelding(fout("buitenland-vlaanderen"), "BE")).toBe("buitenlandNietVlaanderen");
    expect(buitenlandFoutMelding(fout("buitenland-uit"), "BE")).toBeNull();
    expect(buitenlandFoutMelding(null, "BE")).toBeNull();
  });

  it("leest het antwoord van de route alleen als het een punt buiten Nederland is", () => {
    const goed = { label: "Unter den Linden 1, 10117 Berlin", lat: 52.52, lng: 13.4, straat: "Unter den Linden 1", postcode: "DE-10117", plaats: "Berlin" };
    expect(leesGevondenBuitenlandsAdres(goed)).toEqual(goed);
    expect(leesGevondenBuitenlandsAdres({ ...goed, postcode: "1012AB" })).toBeNull();
    expect(leesGevondenBuitenlandsAdres({ ...goed, lat: "x" })).toBeNull();
  });

  it("de melding over Vlaanderen staat letterlijk in het Nederlands en in het Engels", () => {
    expect(nl.vestigingForm.buitenlandNietVlaanderen).toBe("Brussel en Wallonië volgen later; nu kan een werklocatie in België alleen in Vlaanderen.");
    expect(NIET_VLAANDEREN_MELDING).toBe(nl.vestigingForm.buitenlandNietVlaanderen);
    expect(en.vestigingForm.buitenlandNietVlaanderen).toMatch(/Flanders/);
    expect(Object.keys(en.vestigingForm).sort()).toEqual(Object.keys(nl.vestigingForm).sort());
  });
});

describe("een adres opzoeken bij OpenStreetMap", () => {
  it("België: alleen straat, postcode, plaats en land naar buiten, met een eerlijke User-Agent", async () => {
    fetchMock.mockImplementation(async () => antwoord([MEIR]));
    const r = await zoekBuitenlandsAdres({ land: "BE", straat: " Meir  1 ", postcode: "2000", plaats: "Antwerpen" });
    expect(r).toEqual({ latitude: 51.2177, longitude: 4.4069, postalCode: "BE-2000", city: "Antwerpen", straat: "Meir 1", label: "Meir 1, 2000 Antwerpen" });
    const [adres, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const url = new URL(String(adres));
    expect(url.hostname).toBe("nominatim.openstreetmap.org");
    expect(url.searchParams.get("countrycodes")).toBe("be");
    expect([...url.searchParams.keys()].sort()).toEqual(["addressdetails", "city", "countrycodes", "format", "limit", "postalcode", "street"]);
    expect((init.headers as Record<string, string>)["user-agent"]).toBe("ZekerFlexBot/test");
  });

  it("Duitsland: countrycodes=de, bewaard als DE-10117", async () => {
    fetchMock.mockImplementation(async () => antwoord([BERLIJN]));
    const r = await zoekBuitenlandsAdres({ land: "DE", straat: "Unter den Linden 1", postcode: "10117", plaats: "Berlin" });
    expect(r.postalCode).toBe("DE-10117");
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams.get("countrycodes")).toBe("de");
  });

  it("een land zonder postcode: één vraag met straat en plaats, bewaard als AE-", async () => {
    fetchMock.mockImplementation(async () => antwoord([DUBAI]));
    const r = await zoekBuitenlandsAdres({ land: "AE", straat: "Sheikh Mohammed bin Rashid Blvd 1", postcode: "", plaats: "Dubai" });
    expect(r).toMatchObject({ postalCode: "AE-", city: "Dubai", label: "Sheikh Mohammed bin Rashid Blvd 1, Dubai" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("postalcode")).toBeNull();
    expect(url.searchParams.get("countrycodes")).toBe("ae");
  });

  it("neemt geen treffer uit een ander land, geen plaats en geen postcodegebied", async () => {
    fetchMock
      .mockResolvedValueOnce(antwoord([{ ...BERLIJN, address: { ...BERLIJN.address, country_code: "pl" } }]))
      .mockResolvedValueOnce(antwoord([{ lat: "52.5", lon: "13.4", place_rank: 16, address: { city: "Berlin", country_code: "de" } }]))
      .mockResolvedValueOnce(antwoord([]));
    const fout = await zoekBuitenlandsAdres({ land: "DE", straat: "Unter den Linden 1", postcode: "10117", plaats: "Berlin" }).catch((e: unknown) => e);
    expect((fout as AppError).details).toEqual({ reden: "buitenland-niet-gevonden" });
    expect((fout as AppError).message).toContain("Duitsland");
  });

  it("zonder postcode zoeken: in België moet OSM dezelfde postcode geven (zoals altijd), elders mag hij ontbreken", async () => {
    fetchMock.mockResolvedValueOnce(antwoord([])).mockResolvedValueOnce(antwoord([])).mockResolvedValueOnce(antwoord([{ ...MEIR, address: { ...MEIR.address, postcode: undefined } }]));
    await expect(zoekBuitenlandsAdres({ land: "BE", straat: "Meir 1", postcode: "2000", plaats: "Antwerpen" })).rejects.toMatchObject({ details: { reden: "buitenland-niet-gevonden" } });
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(antwoord([])).mockResolvedValueOnce(antwoord([])).mockResolvedValueOnce(antwoord([{ ...MEIR, address: { ...MEIR.address, postcode: "2018" } }]));
    await expect(zoekBuitenlandsAdres({ land: "BE", straat: "Meir 2", postcode: "2000", plaats: "Antwerpen" })).rejects.toMatchObject({ details: { reden: "buitenland-niet-gevonden" } });
    fetchMock.mockReset();
    const zonder = { ...BERLIJN, address: { road: "Unter den Linden", city: "Berlin", country_code: "de" } };
    fetchMock.mockResolvedValueOnce(antwoord([])).mockResolvedValueOnce(antwoord([])).mockResolvedValueOnce(antwoord([zonder]));
    expect((await zoekBuitenlandsAdres({ land: "DE", straat: "Unter den Linden 1", postcode: "10117", plaats: "Berlin" })).postalCode).toBe("DE-10117");
  });

  it("België buiten Vlaanderen: de melding, en er gaat niets naar OSM", async () => {
    for (const postcode of ["1000", "1300", "4000", "7000"]) {
      await expect(zoekBuitenlandsAdres({ land: "BE", straat: "Grote Markt 1", postcode, plaats: "Ergens" })).rejects.toMatchObject({
        status: 422,
        message: NIET_VLAANDEREN_MELDING,
        details: { reden: "buitenland-vlaanderen" },
      });
    }
    // andere landen kennen die grens niet
    fetchMock.mockImplementation(async () => antwoord([BERLIJN]));
    await expect(zoekBuitenlandsAdres({ land: "DE", straat: "Unter den Linden 1", postcode: "1000", plaats: "Berlin" })).resolves.toMatchObject({ postalCode: "DE-1000" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("eerlijke fouten, en nooit het midden van Nederland", async () => {
    await expect(zoekBuitenlandsAdres({ land: "NL", straat: "Damrak 1", postcode: "1012LG" })).rejects.toMatchObject({ details: { reden: "buitenland-land" } });
    await expect(zoekBuitenlandsAdres({ land: "DE", straat: "Hauptstraße", postcode: "10115" })).rejects.toMatchObject({ details: { reden: "buitenland-straat" } });
    await expect(zoekBuitenlandsAdres({ land: "DE", straat: "Hauptstraße 1", postcode: "" })).rejects.toMatchObject({ details: { reden: "buitenland-postcode" } });
    await expect(zoekBuitenlandsAdres({ land: "AE", straat: "Sheikh Zayed Rd 1", postcode: "" })).rejects.toMatchObject({ details: { reden: "buitenland-plaats" } });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockImplementation(async () => antwoord([]));
    await expect(zoekBuitenlandsAdres({ land: "FR", straat: "Rue de Nulle Part 1", postcode: "75000", plaats: "Paris" })).rejects.toMatchObject({ status: 422, details: { reden: "buitenland-niet-gevonden" } });
  });

  it("meldt het eerlijk als OSM niet bereikbaar is, onthoudt dat niet en logt nooit het adres", async () => {
    fetchMock.mockRejectedValueOnce(new Error("netwerk weg"));
    await expect(zoekBuitenlandsAdres({ land: "BE", straat: "Meir 1", postcode: "2000", plaats: "Antwerpen" })).rejects.toMatchObject({ status: 503, details: { reden: "buitenland-onbereikbaar" } });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/Meir|2000|Antwerpen/);
    fetchMock.mockResolvedValueOnce(antwoord([MEIR]));
    expect((await zoekBuitenlandsAdres({ land: "BE", straat: "Meir 1", postcode: "2000", plaats: "Antwerpen" })).postalCode).toBe("BE-2000");
  });

  it("vraagt hetzelfde adres binnen het uur niet twee keer", async () => {
    fetchMock.mockImplementation(async () => antwoord([MEIR]));
    await zoekBuitenlandsAdres({ land: "BE", straat: "Meir 1", postcode: "2000", plaats: "Antwerpen" });
    await zoekBuitenlandsAdres({ land: "be", straat: "meir 1", postcode: "B-2000", plaats: "antwerpen" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("de vlaggen", () => {
  it("staan allebei standaard uit, met het label van de eigenaar", async () => {
    const echt = await vi.importActual<typeof import("@/lib/flags")>("@/lib/flags");
    for (const key of [WERK_IN_BELGIE_VLAG, WERK_IN_BUITENLAND_VLAG]) {
      expect(echt.FLAG_REGISTRY.find((f) => f.key === key)?.default, key).toBe(false);
      expect(echt.evaluate(key, undefined, { userId: "u1" }), key).toBe(false);
    }
    expect(echt.FLAG_REGISTRY.find((f) => f.key === WERK_IN_BUITENLAND_VLAG)?.label).toBe("Werklocaties in alle landen");
  });

  it("geven per stand de juiste landen, en bij een storing alleen Nederland", async () => {
    expect(await werklocatieLandenVoor({ userId: "u1" })).toEqual(["NL"]);
    expect(await werklocatieKeuzes({ userId: "u1" }, "nl")).toBeNull();
    vlaggen({ belgie: true });
    expect(await werklocatieLandenVoor({ userId: "u1" })).toEqual(["NL", "BE"]);
    expect(await werklocatieKeuzes({ userId: "u1" }, "nl")).toEqual([
      { code: "NL", naam: "Nederland" },
      { code: "BE", naam: "België" },
    ]);
    vlaggen({ buitenland: true });
    expect((await werklocatieLandenVoor({ userId: "u1", memberships: [{ role: "HQ_ADMIN" }] })).length).toBeGreaterThan(230);
    expect(featureEnabled).toHaveBeenCalledWith(WERK_IN_BUITENLAND_VLAG, { userId: "u1", roles: ["HQ_ADMIN"] });
    featureEnabled.mockRejectedValue(new Error("kv weg"));
    expect(await werklocatieLandenVoor({ userId: "u1" })).toEqual(["NL"]);
  });
});

describe("POST /api/werkgever/adres-buitenland", () => {
  const vraag = (body: unknown, kop: Record<string, string> = {}, route = POST) =>
    route(new Request("https://app.example/api/werkgever/adres-buitenland", { method: "POST", headers: { "Content-Type": "application/json", ...kop }, body: JSON.stringify(body) }));
  const principal = { userId: "u1", email: "baas@bedrijf.test", memberships: [{ tenantId: "t1", role: "HQ_ADMIN" }] };

  it("beide vlaggen uit: 412 (geen 403), en er gaat niets naar OpenStreetMap", async () => {
    getPrincipal.mockResolvedValue(principal);
    for (const land of ["BE", "DE"]) {
      const res = await vraag({ land, straat: "Meir 1", postcode: "2000", plaats: "Antwerpen" });
      expect(res.status, land).toBe(412);
      expect((await res.json()).error.details).toEqual({ reden: "buitenland-uit" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("alleen werk-in-belgie aan: België werkt, Duitsland niet", async () => {
    getPrincipal.mockResolvedValue(principal);
    vlaggen({ belgie: true });
    fetchMock.mockImplementation(async () => antwoord([MEIR]));
    const be = await vraag({ land: "BE", straat: "Meir 1", postcode: "2000", plaats: "Antwerpen" });
    expect(be.status).toBe(200);
    expect((await be.json()).result).toEqual({ label: "Meir 1, 2000 Antwerpen", lat: 51.2177, lng: 4.4069, straat: "Meir 1", postcode: "BE-2000", plaats: "Antwerpen" });
    expect((await vraag({ land: "DE", straat: "Unter den Linden 1", postcode: "10117", plaats: "Berlin" })).status).toBe(412);
    // Brussel: de melding over Vlaanderen
    const brussel = await vraag({ land: "BE", straat: "Grote Markt 1", postcode: "1000", plaats: "Brussel" });
    expect(brussel.status).toBe(422);
    expect((await brussel.json()).error.details).toEqual({ reden: "buitenland-vlaanderen" });
  });

  it("alle landen aan: Duitsland werkt ook", async () => {
    getPrincipal.mockResolvedValue(principal);
    vlaggen({ buitenland: true });
    fetchMock.mockImplementation(async () => antwoord([BERLIJN]));
    const res = await vraag({ land: "DE", straat: "Unter den Linden 1", postcode: "10117", plaats: "Berlin" });
    expect(res.status).toBe(200);
    expect((await res.json()).result.postcode).toBe("DE-10117");
  });

  it("het oude adres (een tabblad van vóór de uitrol, zonder land) is België", async () => {
    getPrincipal.mockResolvedValue(principal);
    vlaggen({ belgie: true });
    fetchMock.mockImplementation(async () => antwoord([MEIR]));
    const res = await vraag({ straat: "Meir 1", postcode: "2000", plaats: "Antwerpen" }, {}, POST_OUD);
    expect(res.status).toBe(200);
    expect((await res.json()).result.postcode).toBe("BE-2000");
  });

  it("niet ingelogd: 401, en een te grote body: 422 vóór alles", async () => {
    getPrincipal.mockResolvedValue(null);
    expect((await vraag({ land: "BE", straat: "Meir 1", postcode: "2000" })).status).toBe(401);
    expect((await vraag({ land: "BE", straat: "Meir 1" }, { "content-length": "999999" })).status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Google for Jobs en de vacaturefeed", () => {
  const klus = (postalCode: string, city: string): PublicShift => ({
    id: "s1",
    title: "Bediening",
    description: null,
    company: "Testzaak",
    city,
    postalCode,
    latitude: 51.2,
    longitude: 4.4,
    startsAt: new Date("2026-12-01T09:00:00+01:00"),
    endsAt: new Date("2026-12-01T17:00:00+01:00"),
    hourlyRateCents: 1800,
    positions: 1,
    viaUitzendbureau: false,
    createdAt: new Date("2026-11-28T12:00:00+01:00"),
    skill: null,
    testklus: false,
  });
  const adres = (s: PublicShift) => (jobPostingJsonLd(s, "https://zekerflex.test").jobLocation as { address: Record<string, unknown> }).address;

  it("een Nederlandse klus blijft precies zoals hij was", () => {
    expect(adres(klus("1012AB", "Amsterdam"))).toEqual({ "@type": "PostalAddress", addressLocality: "Amsterdam", postalCode: "1012AB", addressCountry: "NL" });
  });

  it("buiten Nederland het juiste land en de postcode zonder landcode; zonder postcode geen leeg veld", () => {
    expect(adres(klus("BE-2000", "Antwerpen"))).toMatchObject({ postalCode: "2000", addressCountry: "BE" });
    expect(adres(klus("DE-10115", "Berlin"))).toMatchObject({ postalCode: "10115", addressCountry: "DE" });
    expect(adres(klus("AE-", "Dubai"))).toEqual({ "@type": "PostalAddress", addressLocality: "Dubai", addressCountry: "AE" });
    const feed = lees("app/vacatures.xml/route.ts");
    expect(feed).toContain("cdata(landVanVestiging(s.postalCode))");
    expect(feed).not.toContain('cdata("NL")');
  });
});

describe("de formulieren: de landkeuze staat alleen achter de vlaggen", () => {
  it("de vestiging en de eenmalige locatie tonen het land pas met een lijst van meer dan één land", () => {
    const vestiging = lees("components/werkgever/VestigingFormulier.tsx");
    expect(vestiging).toContain("landen = null");
    expect(vestiging).toContain("const keuze = landen && landen.length > 1 ? landen : null;");
    expect(vestiging).toContain("{keuze && (");
    const klusForm = lees("components/app/NewShiftForm.tsx");
    expect(klusForm).toContain("landen = null");
    expect(klusForm).toContain("const landKeuze = landen && landen.length > 1 ? landen : null;");
    expect(klusForm).toContain("{landKeuze && <LandKeuze");
  });

  it("de pagina's maken de lijst op de server (namen via Intl) en geven hem door", () => {
    for (const f of ["app/werkgever/page.tsx", "app/werkgever/locaties/page.tsx", "app/werkgever/diensten/nieuw/page.tsx"]) {
      expect(lees(f), f).toContain("werklocatieKeuzes(principal");
    }
    expect(lees("app/werkgever/diensten/nieuw/page.tsx")).toContain("<EersteVestiging landen={landen} />");
    expect(lees("components/app/BranchesBoard.tsx")).toContain("landen={landen}");
    expect(lees("components/werkgever/EersteVestiging.tsx")).toContain("landen={landen}");
    expect(lees("components/app/EmployerOnboardingWizard.tsx")).toContain("landen={initial.landen ?? null}");
  });

  it("het adres buiten Nederland zoekt via onze eigen route (nooit rechtstreeks bij OSM vanuit de browser), met een melding die wordt voorgelezen", () => {
    const comp = lees("components/werkgever/BuitenlandAdres.tsx");
    expect(comp).toContain('fetch("/api/werkgever/adres-buitenland"');
    expect(comp).not.toContain("nominatim");
    expect(comp).not.toContain("Intl.");
    expect(comp).toContain('type="button"');
    expect(comp).toContain('role="alert"');
    for (const veld of ["straat", "postcode", "plaats"]) expect(comp, veld).toContain(`htmlFor={\`\${id}-${veld}\`}`);
  });
});
