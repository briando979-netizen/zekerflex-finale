import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { leesPdokPlekken, wisPdokGeheugen, zoekCoordinaat, zoekPlekken } from "@/lib/geo/pdok";

const DAM_DOC = {
  weergavenaam: "Dam 1, 1012JS Amsterdam",
  type: "adres",
  centroide_ll: "POINT(4.89260 52.37306)",
  postcode: "1012JS",
  woonplaatsnaam: "Amsterdam",
  straatnaam: "Dam",
};

function antwoord(docs: unknown[], ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => ({ response: { docs } }),
  } as unknown as Response;
}

let aanroepen: URL[] = [];

function stelFetchIn(maak: () => Response | Promise<Response>): void {
  aanroepen = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL) => {
      aanroepen.push(new URL(String(url)));
      return maak();
    }),
  );
}

beforeEach(() => {
  wisPdokGeheugen();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("de PDOK-lezer", () => {
  it("leest een adres met coördinaten en laat onbruikbare regels weg", () => {
    const plekken = leesPdokPlekken({
      response: {
        docs: [
          DAM_DOC,
          { weergavenaam: "Kapot", type: "adres", centroide_ll: "nee" },
          { type: "weg", centroide_ll: "POINT(4 52)" },
          { weergavenaam: "Utrecht", type: "woonplaats", centroide_ll: "POINT(5.1 52.09)" },
        ],
      },
    });
    expect(plekken).toEqual([
      {
        naam: "Dam 1, 1012JS Amsterdam",
        soort: "adres",
        lat: 52.37306,
        lon: 4.8926,
        postcode: "1012JS",
        plaats: "Amsterdam",
        straat: "Dam",
      },
      {
        naam: "Utrecht",
        soort: "woonplaats",
        lat: 52.09,
        lon: 5.1,
        postcode: null,
        plaats: null,
        straat: null,
      },
    ]);
    expect(leesPdokPlekken(null)).toEqual([]);
    expect(leesPdokPlekken({ response: {} })).toEqual([]);
  });

  it("vraagt de Locatieserver om één rij met de juiste soorten", async () => {
    stelFetchIn(() => antwoord([DAM_DOC]));
    const plek = await zoekCoordinaat("Dam 1 Amsterdam");
    expect(plek?.lat).toBeCloseTo(52.37306, 5);
    expect(plek?.plaats).toBe("Amsterdam");

    const url = aanroepen[0];
    expect(url?.host).toBe("api.pdok.nl");
    expect(url?.searchParams.get("q")).toBe("Dam 1 Amsterdam");
    expect(url?.searchParams.get("rows")).toBe("1");
    expect(url?.searchParams.get("fq")).toBe("type:(adres OR weg OR woonplaats)");
  });

  it("onthoudt een antwoord, dus dezelfde vraag gaat niet twee keer het net op", async () => {
    stelFetchIn(() => antwoord([DAM_DOC]));
    await zoekCoordinaat("Dam 1 Amsterdam");
    await zoekCoordinaat("  dam 1   amsterdam ");
    expect(aanroepen).toHaveLength(1);

    wisPdokGeheugen();
    await zoekCoordinaat("Dam 1 Amsterdam");
    expect(aanroepen).toHaveLength(2);
  });

  it("niets gevonden geeft null, geen gok", async () => {
    stelFetchIn(() => antwoord([]));
    expect(await zoekCoordinaat("Zomaarstraat 9999 Nergenshuizen")).toBeNull();
    expect(await zoekPlekken("Zomaarstraat 9999 Nergenshuizen")).toEqual([]);
  });

  it("een te korte zoekterm vraagt niets op", async () => {
    stelFetchIn(() => antwoord([DAM_DOC]));
    expect(await zoekPlekken("a")).toEqual([]);
    expect(await zoekPlekken("   ")).toEqual([]);
    expect(aanroepen).toHaveLength(0);
  });

  it("een storing of time-out geeft een lege lijst in plaats van een fout", async () => {
    stelFetchIn(() => antwoord([], false, 503));
    expect(await zoekPlekken("Utrecht")).toEqual([]);

    stelFetchIn(() => {
      throw new Error("The operation was aborted due to timeout");
    });
    expect(await zoekPlekken("Utrecht")).toEqual([]);
  });

  it("vraagt nooit meer dan tien rijen op", async () => {
    stelFetchIn(() => antwoord([DAM_DOC]));
    await zoekPlekken("Utrecht", 50);
    expect(aanroepen[0]?.searchParams.get("rows")).toBe("10");
  });
});
