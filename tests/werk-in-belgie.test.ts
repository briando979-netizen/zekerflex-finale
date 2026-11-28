import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Werken in België (vlag `werk-in-belgie`, standaard uit, 28 nov 2026): een werklocatie met een Belgisch adres, opgezocht bij
// OpenStreetMap (lib/geo/vestiging-belgie.ts), met het land in de postcode ("BE-2000", lib/geo/vestiging-land.ts). Met de vlag
// uit verandert er niets: geen keuze in de formulieren, de route zegt nee zonder iets naar buiten te sturen, en een Nederlandse
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
  belgieFoutMelding,
  belgieInvoerMelding,
  belgischeOpslagPostcode,
  herkenLand,
  landVanVestiging,
  leesGevondenBelgischAdres,
  metLand,
  plaatsRegel,
  postcodeTekst,
  WERK_IN_BELGIE_VLAG,
} from "@/lib/geo/vestiging-land";
import { vestigingRegel } from "@/lib/geo/adres-keuze";
import { vestigingBelgieVergeetAlles, werkInBelgieAan, zoekBelgischAdres } from "@/lib/geo/vestiging-belgie";
import { jobPostingJsonLd, type PublicShift } from "@/lib/public-shifts";
import { POST } from "@/app/api/werkgever/adres-belgie/route";
import { AppError } from "@/lib/errors";

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
const fetchMock = vi.fn();
const antwoord = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** een huis aan de Meir in Antwerpen, zoals Nominatim (jsonv2, addressdetails) het geeft */
const MEIR = { lat: "51.2177", lon: "4.4069", place_rank: 30, address: { road: "Meir", house_number: "1", city: "Antwerpen", postcode: "2000", country_code: "be" } };

beforeEach(() => {
  vestigingBelgieVergeetAlles();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("het land van een werklocatie (puur)", () => {
  it("herkent een Nederlandse en een Belgische postcode bij het invullen", () => {
    expect(herkenLand("1012 AB")).toBe("NL");
    expect(herkenLand("1012ab")).toBe("NL");
    expect(herkenLand("2000")).toBe("BE");
    expect(herkenLand("B-2000")).toBe("BE");
    expect(herkenLand("be 9000")).toBe("BE");
    expect(herkenLand("0999")).toBeNull();
    expect(herkenLand("12345")).toBeNull();
    expect(herkenLand("")).toBeNull();
  });

  it("bewaart een Belgische postcode met de landcode ervoor, zoals de thuisbasis in het buitenland", () => {
    expect(belgischeOpslagPostcode("2000")).toBe("BE-2000");
    expect(belgischeOpslagPostcode(" B-1000 ")).toBe("BE-1000");
    expect(belgischeOpslagPostcode("1012 AB")).toBeNull();
  });

  it("leest het land uit een opgeslagen postcode; alles zonder BE- blijft Nederland, ook een kale vier cijfers", () => {
    expect(landVanVestiging("BE-2000")).toBe("BE");
    expect(landVanVestiging("1012AB")).toBe("NL");
    expect(landVanVestiging("1012 AB")).toBe("NL");
    // een eenmalige locatie in Nederland met alleen de cijfers: die is nooit ineens Belgisch
    expect(landVanVestiging("3511")).toBe("NL");
    expect(landVanVestiging(null)).toBe("NL");
    expect(landVanVestiging(undefined)).toBe("NL");
  });

  it("toont een Belgische postcode zonder landcode; een Nederlandse precies zoals hij was", () => {
    expect(postcodeTekst("BE-2000")).toBe("2000");
    expect(postcodeTekst("1012AB")).toBe("1012AB");
    expect(postcodeTekst("1012 AB ")).toBe("1012 AB ");
  });

  it("zet het land alleen achter een Belgisch adres, in de taal van de lezer", () => {
    expect(metLand("Damrak 1, 1012AB Amsterdam", "1012AB", "nl")).toBe("Damrak 1, 1012AB Amsterdam");
    expect(metLand("Meir 1, 2000 Antwerpen", "BE-2000", "nl")).toBe("Meir 1, 2000 Antwerpen, België");
    expect(metLand("Meir 1, 2000 Antwerpen", "BE-2000", "en")).toBe("Meir 1, 2000 Antwerpen, Belgium");
    expect(metLand("Antwerpen", "BE-2000", "pl")).toBe("Antwerpen, Belgia");
    expect(plaatsRegel({ postalCode: "BE-2000", city: "Antwerpen" }, "nl")).toBe("2000 Antwerpen, België");
    expect(plaatsRegel({ postalCode: "1012AB", city: "Amsterdam" }, "nl")).toBe("1012AB Amsterdam");
  });

  it("een opgeslagen vestiging op één regel: Belgisch zonder landcode, Nederlands ongewijzigd", () => {
    expect(vestigingRegel({ addressLine: "Meir 1", postalCode: "BE-2000", city: "Antwerpen" })).toBe("Meir 1, 2000 Antwerpen");
    expect(vestigingRegel({ addressLine: "Meir 1, 2000 Antwerpen", postalCode: "BE-2000", city: "Antwerpen" })).toBe("Meir 1, 2000 Antwerpen");
    expect(vestigingRegel({ addressLine: "Grote Markt 1", postalCode: "9712HN", city: "Groningen" })).toBe("Grote Markt 1, 9712HN Groningen");
  });

  it("het formulier zegt vóór het zoeken al wat er niet klopt", () => {
    expect(belgieInvoerMelding("Meir 1", "1012 AB")).toBe("belgieNlPostcode");
    expect(belgieInvoerMelding("Meir", "2000")).toBe("belgieStraat");
    expect(belgieInvoerMelding("Meir 1", "20000")).toBe("belgiePostcode");
    expect(belgieInvoerMelding("Meir 1", "2000")).toBeNull();
  });

  it("vertaalt de reden van de server naar een tekst van het formulier; iets anders blijft de tekst van de server", () => {
    expect(belgieFoutMelding({ error: { details: { reden: "belgie-niet-gevonden" } } })).toBe("belgieNietGevonden");
    expect(belgieFoutMelding({ error: { details: { reden: "belgie-onbereikbaar" } } })).toBe("belgieOnbereikbaar");
    expect(belgieFoutMelding({ error: { details: { reden: "belgie-uit" } } })).toBeNull();
    expect(belgieFoutMelding(null)).toBeNull();
  });

  it("leest het antwoord van de route alleen als het een Belgisch punt is", () => {
    const goed = { label: "Meir 1, 2000 Antwerpen", lat: 51.2, lng: 4.4, straat: "Meir 1", postcode: "BE-2000", plaats: "Antwerpen" };
    expect(leesGevondenBelgischAdres(goed)).toEqual(goed);
    expect(leesGevondenBelgischAdres({ ...goed, postcode: "1012AB" })).toBeNull();
    expect(leesGevondenBelgischAdres({ ...goed, lat: "x" })).toBeNull();
    expect(leesGevondenBelgischAdres(undefined)).toBeNull();
  });
});

describe("een Belgisch adres opzoeken bij OpenStreetMap", () => {
  it("stuurt alleen straat, postcode, plaats en land naar buiten, met een eerlijke User-Agent", async () => {
    fetchMock.mockImplementation(async () => antwoord([MEIR]));
    const r = await zoekBelgischAdres({ straat: " Meir  1 ", postcode: "2000", plaats: "Antwerpen" });
    expect(r).toEqual({ latitude: 51.2177, longitude: 4.4069, postalCode: "BE-2000", city: "Antwerpen", straat: "Meir 1", label: "Meir 1, 2000 Antwerpen" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [adres, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const url = new URL(String(adres));
    expect(url.hostname).toBe("nominatim.openstreetmap.org");
    expect(url.searchParams.get("countrycodes")).toBe("be");
    expect(url.searchParams.get("street")).toBe("Meir 1");
    expect(url.searchParams.get("postalcode")).toBe("2000");
    expect(url.searchParams.get("city")).toBe("Antwerpen");
    expect(url.searchParams.get("q")).toBeNull();
    expect([...url.searchParams.keys()].sort()).toEqual(["addressdetails", "city", "countrycodes", "format", "limit", "postalcode", "street"]);
    expect((init.headers as Record<string, string>)["user-agent"]).toBe("ZekerFlexBot/test");
  });

  it("neemt geen plaats of postcodegebied als werkplek en probeert daarna zonder plaats", async () => {
    fetchMock
      .mockResolvedValueOnce(antwoord([{ lat: "51.22", lon: "4.40", place_rank: 16, address: { city: "Antwerpen", country_code: "be" } }]))
      .mockResolvedValueOnce(antwoord([MEIR]));
    const r = await zoekBelgischAdres({ straat: "Meir 1", postcode: "2000", plaats: "Anvers" });
    expect(r.latitude).toBe(51.2177);
    // de plaats blijft zoals het bedrijf hem schreef
    expect(r.city).toBe("Anvers");
    expect(new URL(String(fetchMock.mock.calls[1]?.[0])).searchParams.get("city")).toBeNull();
  });

  it("zoekt het zonder postcode alleen goed als OSM dezelfde postcode teruggeeft", async () => {
    fetchMock
      .mockResolvedValueOnce(antwoord([]))
      .mockResolvedValueOnce(antwoord([]))
      .mockResolvedValueOnce(antwoord([{ ...MEIR, address: { ...MEIR.address, postcode: "2018" } }]));
    const fout = await zoekBelgischAdres({ straat: "Meir 1", postcode: "2000", plaats: "Antwerpen" }).catch((e: unknown) => e);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(new URL(String(fetchMock.mock.calls[2]?.[0])).searchParams.get("postalcode")).toBeNull();
    expect(fout).toBeInstanceOf(AppError);
    expect((fout as AppError).details).toEqual({ reden: "belgie-niet-gevonden" });
  });

  it("geeft een eerlijke fout als OSM niets vindt, nooit het midden van Nederland", async () => {
    fetchMock.mockImplementation(async () => antwoord([]));
    const fout = await zoekBelgischAdres({ straat: "Nergensstraat 1", postcode: "9999", plaats: "Nergens" }).catch((e: unknown) => e);
    expect((fout as AppError).status).toBe(422);
    expect((fout as AppError).details).toEqual({ reden: "belgie-niet-gevonden" });
  });

  it("meldt het eerlijk als OSM niet bereikbaar is, onthoudt dat niet en logt nooit het adres", async () => {
    fetchMock.mockRejectedValueOnce(new Error("netwerk weg"));
    const fout = await zoekBelgischAdres({ straat: "Meir 1", postcode: "2000", plaats: "Antwerpen" }).catch((e: unknown) => e);
    expect((fout as AppError).status).toBe(503);
    expect((fout as AppError).details).toEqual({ reden: "belgie-onbereikbaar" });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/Meir|2000|Antwerpen/);
    fetchMock.mockResolvedValueOnce(antwoord([MEIR]));
    expect((await zoekBelgischAdres({ straat: "Meir 1", postcode: "2000", plaats: "Antwerpen" })).postalCode).toBe("BE-2000");
  });

  it("vraagt niets als het huisnummer of de Belgische postcode ontbreekt", async () => {
    await expect(zoekBelgischAdres({ straat: "Meir", postcode: "2000" })).rejects.toMatchObject({ status: 422, details: { reden: "belgie-straat" } });
    await expect(zoekBelgischAdres({ straat: "Meir 1", postcode: "1012 AB" })).rejects.toMatchObject({ status: 422, details: { reden: "belgie-postcode" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("vraagt hetzelfde adres binnen het uur niet twee keer", async () => {
    fetchMock.mockImplementation(async () => antwoord([MEIR]));
    await zoekBelgischAdres({ straat: "Meir 1", postcode: "2000", plaats: "Antwerpen" });
    await zoekBelgischAdres({ straat: "meir 1", postcode: "B-2000", plaats: "antwerpen" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("de vlag werk-in-belgie", () => {
  it("staat standaard uit", async () => {
    const echt = await vi.importActual<typeof import("@/lib/flags")>("@/lib/flags");
    const vlag = echt.FLAG_REGISTRY.find((f) => f.key === WERK_IN_BELGIE_VLAG);
    expect(vlag?.default).toBe(false);
    expect(echt.evaluate(WERK_IN_BELGIE_VLAG, undefined, { userId: "u1" })).toBe(false);
  });

  it("geeft bij een storing in de vlaggen uit, nooit aan", async () => {
    featureEnabled.mockRejectedValueOnce(new Error("kv weg"));
    expect(await werkInBelgieAan({ userId: "u1" })).toBe(false);
    featureEnabled.mockResolvedValueOnce(true);
    expect(await werkInBelgieAan({ userId: "u1", memberships: [{ role: "HQ_ADMIN" }] })).toBe(true);
    expect(featureEnabled).toHaveBeenLastCalledWith(WERK_IN_BELGIE_VLAG, { userId: "u1", roles: ["HQ_ADMIN"] });
  });
});

describe("POST /api/werkgever/adres-belgie", () => {
  const vraag = (body: unknown, kop: Record<string, string> = {}) =>
    POST(new Request("https://app.example/api/werkgever/adres-belgie", { method: "POST", headers: { "Content-Type": "application/json", ...kop }, body: JSON.stringify(body) }));
  const principal = { userId: "u1", email: "baas@bedrijf.test", memberships: [{ tenantId: "t1", role: "HQ_ADMIN" }] };

  it("met de vlag uit: 412 (geen 403), en er gaat niets naar OpenStreetMap", async () => {
    getPrincipal.mockResolvedValue(principal);
    featureEnabled.mockResolvedValue(false);
    const res = await vraag({ straat: "Meir 1", postcode: "2000", plaats: "Antwerpen" });
    expect(res.status).toBe(412);
    expect((await res.json()).error.details).toEqual({ reden: "belgie-uit" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("met de vlag aan: het punt met de Belgische postcode", async () => {
    getPrincipal.mockResolvedValue(principal);
    featureEnabled.mockResolvedValue(true);
    fetchMock.mockImplementation(async () => antwoord([MEIR]));
    const res = await vraag({ straat: "Meir 1", postcode: "2000", plaats: "Antwerpen" });
    expect(res.status).toBe(200);
    expect((await res.json()).result).toEqual({ label: "Meir 1, 2000 Antwerpen", lat: 51.2177, lng: 4.4069, straat: "Meir 1", postcode: "BE-2000", plaats: "Antwerpen" });
  });

  it("niet ingelogd: 401, en een te grote body: 422 vóór alles", async () => {
    getPrincipal.mockResolvedValue(null);
    expect((await vraag({ straat: "Meir 1", postcode: "2000" })).status).toBe(401);
    expect((await vraag({ straat: "Meir 1" }, { "content-length": "999999" })).status).toBe(422);
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

  it("een Belgische klus krijgt land BE en de postcode zonder landcode", () => {
    expect(adres(klus("BE-2000", "Antwerpen"))).toMatchObject({ postalCode: "2000", addressCountry: "BE" });
    const feed = lees("app/vacatures.xml/route.ts");
    expect(feed).toContain("cdata(landVanVestiging(s.postalCode))");
    expect(feed).not.toContain('cdata("NL")');
  });
});

describe("de formulieren: de keuze voor België staat alleen achter de vlag", () => {
  it("de vestiging en de eenmalige locatie tonen het land pas met metBelgie, standaard uit", () => {
    const vestiging = lees("components/werkgever/VestigingFormulier.tsx");
    expect(vestiging).toContain("metBelgie = false");
    expect(vestiging).toContain("{metBelgie && (");
    expect(vestiging).toContain('const inBelgie = metBelgie && land === "BE"');
    const klusForm = lees("components/app/NewShiftForm.tsx");
    expect(klusForm).toContain("metBelgie = false");
    expect(klusForm).toContain('const adHocBelgie = metBelgie && adHocLand === "BE"');
    expect(klusForm).toContain("{metBelgie && <LandKeuze");
  });

  it("de pagina's lezen de vlag op de server en geven hem door", () => {
    for (const f of ["app/werkgever/page.tsx", "app/werkgever/locaties/page.tsx", "app/werkgever/diensten/nieuw/page.tsx"]) {
      expect(lees(f), f).toContain("werkInBelgieAan(principal)");
    }
    expect(lees("app/werkgever/diensten/nieuw/page.tsx")).toContain("<EersteVestiging metBelgie={metBelgie} />");
    expect(lees("components/app/BranchesBoard.tsx")).toContain("metBelgie={metBelgie}");
    expect(lees("components/werkgever/EersteVestiging.tsx")).toContain("metBelgie={metBelgie}");
    expect(lees("components/app/EmployerOnboardingWizard.tsx")).toContain("metBelgie={initial.metBelgie === true}");
  });

  it("het Belgische adres zoekt via onze eigen route (nooit rechtstreeks bij OSM vanuit de browser), met een melding die wordt voorgelezen", () => {
    const be = lees("components/werkgever/BelgischAdres.tsx");
    expect(be).toContain('fetch("/api/werkgever/adres-belgie"');
    expect(be).not.toContain("nominatim");
    expect(be).toContain('type="button"');
    expect(be).toContain('role="alert"');
    for (const veld of ["straat", "postcode", "plaats"]) expect(be, veld).toContain(`htmlFor={\`\${id}-${veld}\`}`);
  });
});
