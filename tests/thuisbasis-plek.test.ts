import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import {
  inNederland,
  leesPlekResultaat,
  nettePostcode,
  thuisbasisUitPlek,
} from "@/lib/geo/thuisbasis-plek";
import { adresBijCoordinaat, wisPdokGeheugen, zoekPlekken } from "@/lib/geo/pdok";
import { ibanKlopt, ibanLaatste4, schoonIban } from "@/lib/onboarding/velden";
import { AUTH_DICTS } from "@/lib/i18n/auth";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

describe("thuisbasisUitPlek: de postcode komt uit het gekozen adres", () => {
  it("een adres geeft postcode met spatie en woonplaats, zonder straat of huisnummer", () => {
    const uit = thuisbasisUitPlek({ postcode: "1012JS", plaats: "Amsterdam" });
    expect(uit).toEqual({ postalCode: "1012 JS", city: "Amsterdam", label: "1012 JS Amsterdam" });
    expect(uit?.label).not.toMatch(/Dam 1/);
  });

  it("een postcode met kleine letters en spatie wordt netjes", () => {
    expect(thuisbasisUitPlek({ postcode: "3511 ab", plaats: "Utrecht" })?.postalCode).toBe("3511 AB");
  });

  it("een plaats zonder postcode (geen adres) geeft null: het formulier vraagt om een straat", () => {
    expect(thuisbasisUitPlek({ postcode: null, plaats: "Utrecht" })).toBeNull();
    expect(thuisbasisUitPlek({ postcode: undefined, plaats: "Utrecht" })).toBeNull();
    expect(thuisbasisUitPlek({ postcode: "", plaats: "Utrecht" })).toBeNull();
  });

  it("geen Nederlandse postcode geeft ook null", () => {
    expect(thuisbasisUitPlek({ postcode: "2000", plaats: "Antwerpen" })).toBeNull();
    expect(thuisbasisUitPlek({ postcode: "1012", plaats: "x" })).toBeNull();
  });

  it("een adres zonder woonplaats toont alleen de postcode", () => {
    expect(thuisbasisUitPlek({ postcode: "1012JS", plaats: null })).toEqual({ postalCode: "1012 JS", city: "", label: "1012 JS" });
  });

  it("de postcode die eruit komt is er een die de server (en het formulier) accepteert", async () => {
    const { postcodeGeldig } = await import("@/lib/geo/thuisland");
    const uit = thuisbasisUitPlek({ postcode: "8011CE", plaats: "Zwolle" });
    expect(postcodeGeldig("NL", uit?.postalCode ?? "")).toBe(true);
  });
});

describe("nettePostcode / inNederland / leesPlekResultaat", () => {
  it("nettePostcode", () => {
    expect(nettePostcode("1012js")).toBe("1012 JS");
    expect(nettePostcode(" 1012 JS ")).toBe("1012 JS");
    expect(nettePostcode("101JS")).toBeNull();
    expect(nettePostcode(null)).toBeNull();
  });

  it("inNederland zet de grens bij het land", () => {
    expect(inNederland(52.37, 4.89)).toBe(true); // Amsterdam
    expect(inNederland(50.85, 5.69)).toBe(true); // Maastricht
    expect(inNederland(48.85, 2.35)).toBe(false); // Parijs
    expect(inNederland(52.52, 13.4)).toBe(false); // Berlijn
    expect(inNederland(Number.NaN, 4.8)).toBe(false);
  });

  it("leesPlekResultaat laat onbruikbare regels vallen en bewaart postcode en plaats", () => {
    expect(leesPlekResultaat(null)).toBeNull();
    expect(leesPlekResultaat({ label: "x", lat: "abc", lng: 4 })).toBeNull();
    expect(leesPlekResultaat({ lat: 1, lng: 2 })).toBeNull();
    expect(leesPlekResultaat({ label: "Dam 1, 1012JS Amsterdam", lat: 52.37, lng: 4.89, postcode: "1012JS", plaats: "Amsterdam", soort: "adres" })).toMatchObject({
      postcode: "1012JS",
      plaats: "Amsterdam",
      soort: "adres",
    });
    expect(leesPlekResultaat({ label: "Utrecht", lat: 52.09, lng: 5.12 })).toMatchObject({ postcode: null, plaats: null });
  });
});

describe("IBAN-hulpjes (de controle blijft beschikbaar voor Bankrekening bevestigen)", () => {
  it("schoonIban haalt spaties weg en maakt hoofdletters; leeg wordt null", () => {
    expect(schoonIban("nl91 abna 0417 1643 00")).toBe("NL91ABNA0417164300");
    expect(schoonIban("")).toBeNull();
    expect(schoonIban("   ")).toBeNull();
    expect(schoonIban(undefined)).toBeNull();
    expect(schoonIban(null)).toBeNull();
  });

  it("ibanLaatste4 geeft nooit het hele nummer", () => {
    expect(ibanLaatste4("NL91 ABNA 0417 1643 00")).toBe("4300");
    expect(ibanLaatste4("NL91")).toBeNull();
    expect(ibanLaatste4(null)).toBeNull();
  });

  it("ibanKlopt controleert het controlecijfer", () => {
    expect(ibanKlopt("NL91ABNA0417164300")).toBe(true);
    expect(ibanKlopt("NL91ABNA0417164301")).toBe(false);
  });
});

function antwoord(docs: unknown[], ok = true, status = 200): Response {
  return { ok, status, json: async () => ({ response: { docs } }) } as unknown as Response;
}

const DAM = {
  weergavenaam: "Dam 1, 1012JS Amsterdam",
  type: "adres",
  centroide_ll: "POINT(4.89260 52.37306)",
  postcode: "1012JS",
  woonplaatsnaam: "Amsterdam",
  straatnaam: "Dam",
};

describe("PDOK: alleen adressen zoeken en omgekeerd zoeken", () => {
  let urls: URL[] = [];
  beforeEach(() => {
    wisPdokGeheugen();
    urls = [];
  });
  afterEach(() => vi.unstubAllGlobals());

  function fetchGeeft(maak: () => Response | Promise<Response>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) => {
        urls.push(new URL(String(url)));
        return maak();
      }),
    );
  }

  it("alleenAdressen vraagt alleen om adressen; zonder optie blijft het zoals het was", async () => {
    fetchGeeft(() => antwoord([DAM]));
    await zoekPlekken("Dam 1 Amsterdam", 5, { alleenAdressen: true });
    expect(urls[0]?.searchParams.get("fq")).toBe("type:adres");
    await zoekPlekken("Dam 1 Amsterdam", 5);
    expect(urls[1]?.searchParams.get("fq")).toBe("type:(adres OR weg OR woonplaats)");
  });

  it("de twee soorten zoekopdracht delen het geheugen niet", async () => {
    fetchGeeft(() => antwoord([DAM]));
    await zoekPlekken("Dam", 5, { alleenAdressen: true });
    await zoekPlekken("Dam", 5);
    expect(urls).toHaveLength(2);
  });

  it("adresBijCoordinaat geeft het dichtstbijzijnde adres met postcode en woonplaats", async () => {
    fetchGeeft(() => antwoord([DAM]));
    const plek = await adresBijCoordinaat(52.373, 4.8926);
    expect(plek).toMatchObject({ postcode: "1012JS", plaats: "Amsterdam", soort: "adres" });
    expect(urls[0]?.pathname).toMatch(/\/reverse$/);
    expect(urls[0]?.searchParams.get("type")).toBe("adres");
    expect(urls[0]?.searchParams.get("distance")).toBe("250");
  });

  it("onthoudt een uitkomst en vraagt dezelfde plek niet twee keer", async () => {
    fetchGeeft(() => antwoord([DAM]));
    await adresBijCoordinaat(52.373, 4.8926);
    await adresBijCoordinaat(52.37301, 4.89261);
    expect(urls).toHaveLength(1);
  });

  it("geen adres in de buurt, een fout of een time-out geeft null (nooit een harde fout)", async () => {
    fetchGeeft(() => antwoord([]));
    expect(await adresBijCoordinaat(52.0, 5.0)).toBeNull();
    wisPdokGeheugen();
    fetchGeeft(() => antwoord([], false, 500));
    expect(await adresBijCoordinaat(52.0, 5.0)).toBeNull();
    wisPdokGeheugen();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("timeout"))));
    expect(await adresBijCoordinaat(52.0, 5.0)).toBeNull();
    expect(await adresBijCoordinaat(Number.NaN, 5.0)).toBeNull();
  });
});

const TALEN = ["nl", "en", "pl", "ro", "uk"] as const;

describe("teksten in alle vijf talen", () => {
  const thuisSleutels = [
    "waarWoon", "zoekPlaceholder", "zoekUitleg", "zoekLeeg", "geenPostcode", "lijst", "locatieKnop", "locatieUitleg",
    "locatieBezig", "locatieGeweigerd", "locatieMislukt", "locatieBuitenNL", "locatieGeenAdres", "gekozen", "wissen", "kiesAdres",
  ] as const;
  const ibanSleutels = [
    "ibanLabel", "ibanWhy", "ibanSave", "ibanSaving", "ibanChange", "ibanCancel", "ibanEndsOn", "ibanInvalid", "ibanFailed", "ibanFirst",
  ] as const;

  it("de thuisbasis-teksten staan in elke taal, en alleen het Nederlands is Nederlands", () => {
    for (const taal of TALEN) {
      const t = FREELANCER_DICTS[taal].thuisbasis;
      for (const k of thuisSleutels) expect(t[k].length, `${taal}.${k}`).toBeGreaterThan(2);
    }
    for (const taal of ["en", "pl", "ro", "uk"] as const) {
      expect(FREELANCER_DICTS[taal].thuisbasis.waarWoon).not.toBe(FREELANCER_DICTS.nl.thuisbasis.waarWoon);
      expect(FREELANCER_DICTS[taal].thuisbasis.locatieKnop).not.toBe(FREELANCER_DICTS.nl.thuisbasis.locatieKnop);
    }
  });

  it("de postcode-hulp zegt wat de plaats-zonder-postcode vraagt, in het Nederlands", () => {
    expect(FREELANCER_DICTS.nl.thuisbasis.geenPostcode).toContain("Typ je straat en plaats, dan vinden we je postcode");
    expect(FREELANCER_DICTS.nl.thuisbasis.locatieKnop).toBe("Gebruik mijn huidige locatie");
    expect(FREELANCER_DICTS.nl.thuisbasis.waarWoon).toBe("Waar woon je?");
  });

  it("de IBAN-stap bij Bankrekening bevestigen staat in elke taal, met {last4}", () => {
    for (const taal of TALEN) {
      const p = AUTH_DICTS[taal].page;
      for (const k of ibanSleutels) expect(p[k].length, `${taal}.${k}`).toBeGreaterThan(2);
      expect(p.ibanEndsOn).toContain("{last4}");
    }
  });

  it("de uitleg op de verificatiepagina vraagt het rekeningnummer niet meer bij de onboarding", () => {
    for (const taal of TALEN) {
      const p = AUTH_DICTS[taal].page;
      const o = AUTH_DICTS[taal].onb;
      expect(p.subUitzend).not.toMatch(/rekeningnummer en|bank account and|numer konta oraz|contul bancar și|рахунок і/i);
      expect(o.home.length).toBeGreaterThan(2);
    }
    expect(AUTH_DICTS.nl.page.subUitzend).not.toContain("Vul je thuisbasis en rekeningnummer in");
    expect(AUTH_DICTS.nl.page.subUitzend).toContain("onderaan");
    expect(AUTH_DICTS.nl.onb.uitzendNote).not.toContain("rekeningnummer");
  });
});
