import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompanyStatus } from "@prisma/client";

let remOk = true;
vi.mock("@/lib/rate-limit", () => ({ fixedWindow: async () => ({ ok: remOk, count: 1, limit: 1, remaining: 0 }) }));

import { OPEN_DATA_BRON, OPEN_DATA_URL, isOpenDataProfiel, lookupOpenData, openDataDatum, openDataNaarProfiel } from "@/lib/integrations/kvk-open-data";

// Het echte antwoord van KVK voor ASML (15 nov 2026, gemeten).
const ASML = { datumAanvang: "19941003", actief: "J", rechtsvormCode: "NV", postcodeRegio: 55, activiteiten: [{ sbiCode: "64210", soortActiviteit: "Hoofdactiviteit" }], lidstaat: "NL" };

beforeEach(() => {
  remOk = true;
});

describe("de gratis open dataset van KVK naar een profiel", () => {
  it("een actieve NV: bestaat, actief, rechtsvorm, hoofdactiviteit, startdatum", () => {
    const p = openDataNaarProfiel("17085815", ASML)!;
    expect(p.kvkNumber).toBe("17085815");
    expect(p.status).toBe(CompanyStatus.ACTIVE);
    expect(p.isActive).toBe(true);
    expect(p.insolvent).toBe(false);
    expect(p.legalForm).toBe("Naamloze Vennootschap");
    expect(p.sbiCodes).toEqual(["64210"]);
    expect(p.activities[0]?.isMain).toBe(true);
    expect(p.registrationDate).toBe("1994-10-03");
  });

  it("zonder naam, adres en btw: dat levert de dataset bewust niet", () => {
    const p = openDataNaarProfiel("17085815", ASML)!;
    expect(p.legalName).toBe("Onbekend");
    expect(p.address).toEqual({ street: null, houseNumber: null, postalCode: null, city: null, country: "NL" });
    expect(p.vat).toBeNull();
    expect(isOpenDataProfiel(p)).toBe(true);
    expect((p.raw as { bron: string }).bron).toBe(OPEN_DATA_BRON);
  });

  it("actief N is uitgeschreven, een insolventiecode is insolvent", () => {
    expect(openDataNaarProfiel("12345678", { ...ASML, actief: "N" })!.status).toBe(CompanyStatus.DISSOLVED);
    const f = openDataNaarProfiel("12345678", { ...ASML, insolventieCode: "FAIL" })!;
    expect(f.insolvent).toBe(true);
  });

  it("een onbekende rechtsvorm blijft de code; een datum met nullen is onbekend", () => {
    expect(openDataNaarProfiel("12345678", { ...ASML, rechtsvormCode: "XX" })!.legalForm).toBe("XX");
    expect(openDataDatum("00000000")).toBeNull();
    expect(openDataDatum("20200000")).toBeNull();
    expect(openDataDatum("19941003")).toBe("1994-10-03");
    expect(openDataDatum(undefined)).toBeNull();
  });

  it("rommel is geen profiel: liever niets dan raden", () => {
    expect(openDataNaarProfiel("12345678", null)).toBeNull();
    expect(openDataNaarProfiel("12345678", {})).toBeNull();
    expect(openDataNaarProfiel("12345678", { actief: "MISSCHIEN" })).toBeNull();
    expect(openDataNaarProfiel("1234", ASML)).toBeNull();
  });

  it("een gewoon KVKBase-profiel is geen beperkt profiel", () => {
    expect(isOpenDataProfiel({ raw: { kvkNumber: "1" } })).toBe(false);
    expect(isOpenDataProfiel({ raw: null })).toBe(false);
  });
});

describe("de opvraging", () => {
  const antwoord = (status: number, body: unknown = {}) => async (_url?: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status });

  it("vraagt het goede adres met een tijdslimiet en geeft het profiel terug", async () => {
    const haal = vi.fn(antwoord(200, ASML));
    const p = await lookupOpenData("17085815", haal as unknown as typeof fetch);
    expect(p?.isActive).toBe(true);
    expect(haal.mock.calls[0]?.[0]).toBe(`${OPEN_DATA_URL}/17085815`);
    expect((haal.mock.calls[0]?.[1] as RequestInit).signal).toBeDefined();
  });

  it("404 (geen BV of NV, bv. een eenmanszaak) en 429 (de grens van KVK) zijn geen antwoord", async () => {
    expect(await lookupOpenData("12345678", antwoord(404) as unknown as typeof fetch)).toBeNull();
    expect(await lookupOpenData("12345678", antwoord(429) as unknown as typeof fetch)).toBeNull();
  });

  it("een storing of een kapotte body gooit nooit", async () => {
    expect(await lookupOpenData("12345678", (async () => { throw new Error("netwerk"); }) as unknown as typeof fetch)).toBeNull();
    expect(await lookupOpenData("12345678", (async () => new Response("geen json", { status: 200 })) as unknown as typeof fetch)).toBeNull();
    expect(await lookupOpenData("12345678", antwoord(500) as unknown as typeof fetch)).toBeNull();
  });

  it("onze eigen rem (één per minuut): zonder ruimte wordt er niets gevraagd", async () => {
    remOk = false;
    const haal = vi.fn(antwoord(200, ASML));
    expect(await lookupOpenData("17085815", haal as unknown as typeof fetch)).toBeNull();
    expect(haal).not.toHaveBeenCalled();
  });

  it("een ongeldig nummer wordt niet gevraagd", async () => {
    const haal = vi.fn(antwoord(200, ASML));
    expect(await lookupOpenData("12ab", haal as unknown as typeof fetch)).toBeNull();
    expect(haal).not.toHaveBeenCalled();
  });
});
