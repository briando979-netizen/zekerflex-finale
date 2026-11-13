import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage/kv", () => ({ kvGet: vi.fn(async () => null), kvSet: vi.fn(async () => undefined), kvListEntries: vi.fn(async () => []) }));

import { bedrijfAlIngevuld, formulierMist, ibanVoorOpslag, opslagBody, schoonKvk, toonWerkvormKeuze, type FormulierFeiten } from "@/lib/fiscal/formulier";
import { fiscaalIngevuld, getFiscal, isComplete, type FiscalProfile } from "@/lib/fiscal/store";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

// Het fiscale formulier vraagt niets dubbel meer (14 nov, punten 12, 5 en 7 van de kaart): het IBAN is daar optioneel, de
// werkvorm staat vast ("je koos X"), en wat de aanmelding al invulde staat als samenvatting.

const feiten = (o: Partial<FormulierFeiten> = {}): FormulierFeiten => ({
  kind: "zzp",
  vatNumber: "",
  vatRequested: false,
  kvkNumber: "",
  kor: false,
  korIngediend: false,
  hasBsn: false,
  bsn: "",
  ...o,
});

const profiel = (o: Partial<FiscalProfile>): FiscalProfile => ({ workerKind: "zzp", vatNumber: null, vatValid: false, vatRequested: false, kvkNumber: null, korApplies: false, bsnHash: null, iban: null, ...o }) as unknown as FiscalProfile;

describe("het IBAN telt niet meer als 'mist' in het formulier", () => {
  it("de lijst bevat alleen btw en BSN, nooit het IBAN", () => {
    expect(formulierMist(feiten({ kind: "zzp" }))).toEqual(["btwZzp"]);
    expect(formulierMist(feiten({ kind: "flexwerker" }))).toEqual(["btwFlex"]);
    expect(formulierMist(feiten({ kind: "uitzendkracht" }))).toEqual(["bsn"]);
  });

  it("alles ingevuld zonder IBAN: niets mist", () => {
    expect(formulierMist(feiten({ kind: "zzp", vatNumber: "NL123456789B01" }))).toEqual([]);
    expect(formulierMist(feiten({ kind: "zzp", kvkNumber: "12345678", vatRequested: true }))).toEqual([]);
    expect(formulierMist(feiten({ kind: "flexwerker", kor: true }))).toEqual([]);
    expect(formulierMist(feiten({ kind: "flexwerker", korIngediend: true }))).toEqual([]);
    expect(formulierMist(feiten({ kind: "uitzendkracht", hasBsn: true }))).toEqual([]);
    expect(formulierMist(feiten({ kind: "uitzendkracht", bsn: "123456782" }))).toEqual([]);
  });

  it("het IBAN wordt alleen meegestuurd als er iets staat (de route eist anders 15 tekens)", () => {
    expect(ibanVoorOpslag("")).toEqual({});
    expect(ibanVoorOpslag("   ")).toEqual({});
    expect(ibanVoorOpslag(" NL91 ABNA 0417 1643 00 ")).toEqual({ iban: "NL91 ABNA 0417 1643 00" });
  });

  it("maar het blijft vereist voor de loonstrook en de uitbetaling: isComplete eist het IBAN nog, fiscaalIngevuld niet", () => {
    const zonder = profiel({ workerKind: "zzp", vatValid: true });
    expect(isComplete(zonder)).toBe(false);
    expect(fiscaalIngevuld(zonder)).toBe(true);
    expect(isComplete({ ...zonder, iban: "NL91ABNA0417164300" })).toBe(true);
  });
});

describe("de loonheffingskorting hoort niet bij de aanmelding (kaartpunt 11)", () => {
  const invoer = { kind: "uitzendkracht" as const, iban: "", kor: false, vatRequested: false, vatNumber: "", kvkNumber: "", bsn: "123456782", ibanCode: "" };

  it("de korting telt niet als 'mist' en zit niet in de opslag-body: een eerdere keuze wordt nooit stil teruggezet", () => {
    expect(formulierMist(feiten({ kind: "uitzendkracht", hasBsn: true }))).toEqual([]);
    const body = opslagBody(invoer);
    expect(Object.keys(body)).not.toContain("loonheffingskorting");
    expect(body).toEqual({ workerKind: "uitzendkracht", korApplies: false, vatRequested: false, bsn: "123456782" });
  });

  it("de body stuurt alleen mee wat is ingevuld", () => {
    const body = opslagBody({ ...invoer, kind: "zzp", bsn: "999", iban: " NL91ABNA0417164300 ", vatNumber: " NL123456789B01 ", kvkNumber: "12345678", ibanCode: "123456" });
    expect(body).toEqual({ workerKind: "zzp", iban: "NL91ABNA0417164300", korApplies: false, vatRequested: false, vatNumber: "NL123456789B01", kvkNumber: "12345678", ibanCode: "123456" });
  });

  it("BEKEND, gemeten 14 nov: zonder keuze staat de korting AAN (lib/fiscal/store.ts:84; lib/payroll/compute.ts:231 rekent dan met 27,35% in plaats van 36,97%)", async () => {
    // Dit legt vast wat de code nu doet, niet wat de wet als standaard noemt (geen korting tenzij de werknemer kiest).
    // Klopt dit niet met de bedoeling, dan is dat een besluit voor ae en de eigenaar: pas dan deze test en de standaardwaarde samen aan.
    expect((await getFiscal("onbekende-werker")).loonheffingskorting).toBe(true);
  });
});

describe("de werkvorm als 'je koos X'", () => {
  it("een gekozen werkvorm toont geen keuze, tenzij de werker op wijzigen drukt; zonder werkvorm blijft de keuze", () => {
    expect(toonWerkvormKeuze("zzp", false)).toBe(false);
    expect(toonWerkvormKeuze("zzp", true)).toBe(true);
    expect(toonWerkvormKeuze(null, false)).toBe(true);
    expect(toonWerkvormKeuze(undefined, false)).toBe(true);
  });
});

describe("al ingevuld: KVK, btw en KOR als samenvatting", () => {
  const leeg = { kvk: "", btw: "", kor: false, btwAangevraagd: false, korIngediend: false };

  it("zzp: een KVK-nummer of btw-nummer is genoeg", () => {
    expect(bedrijfAlIngevuld("zzp", { ...leeg, kvk: "12345678" })).toBe(true);
    expect(bedrijfAlIngevuld("zzp", { ...leeg, btw: "NL123456789B01" })).toBe(true);
    expect(bedrijfAlIngevuld("zzp", leeg)).toBe(false);
  });

  it("flexwerker: ook de KOR of 'btw aangevraagd' telt", () => {
    expect(bedrijfAlIngevuld("flexwerker", { ...leeg, kor: true })).toBe(true);
    expect(bedrijfAlIngevuld("flexwerker", { ...leeg, btwAangevraagd: true })).toBe(true);
    expect(bedrijfAlIngevuld("flexwerker", { ...leeg, korIngediend: true })).toBe(true);
    expect(bedrijfAlIngevuld("flexwerker", leeg)).toBe(false);
  });

  it("uitzendkracht heeft geen KVK of btw: nooit een samenvatting", () => {
    expect(bedrijfAlIngevuld("uitzendkracht", { ...leeg, kvk: "12345678", kor: true })).toBe(false);
  });

  it("een KVK-nummer uit het profiel zonder de plaatshouders van de aanmelding", () => {
    expect(schoonKvk("12345678")).toBe("12345678");
    expect(schoonKvk("1234 5678")).toBe("12345678");
    expect(schoonKvk("pending-ab12cd34")).toBe("");
    expect(schoonKvk("vat-BE0123456789")).toBe("");
    expect(schoonKvk(null)).toBe("");
  });
});

describe("de teksten in vijf talen", () => {
  it("elke taal heeft de nieuwe sleutels, en 'je koos' houdt zijn plaatshouder", () => {
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      const f = d.fiscaalForm;
      for (const sleutel of ["ibanLater", "ibanLink", "gekozen", "wijzigen", "alIngevuld", "ja", "statusIbanLater"] as const) {
        expect(f[sleutel].length, `${taal} ${sleutel}`).toBeGreaterThan(0);
      }
      expect(f.gekozen, taal).toContain("{werkvorm}");
    }
  });
});
