import { describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => ({ opslag: new Map<string, unknown>() }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async (k: string) => kv.opslag.get(k) ?? null),
  kvSet: vi.fn(async (k: string, v: unknown) => {
    kv.opslag.set(k, v);
  }),
  kvListEntries: vi.fn(async () => []),
}));
vi.mock("@/lib/env", () => ({ env: new Proxy({}, { get: () => 0 }) }));

import { bedrijfAlIngevuld, formulierMist, ibanVoorOpslag, opslagBody, schoonKvk, toonWerkvormKeuze, type FormulierFeiten } from "@/lib/fiscal/formulier";
import { EMPTY_FISCAL, fiscaalIngevuld, getFiscal, isComplete, normaliseerFiscal, setFiscal, type FiscalProfile } from "@/lib/fiscal/store";
import { computePayslip } from "@/lib/payroll/compute";
import { loonstrookRegels } from "@/lib/payroll/loonstrook-pdf";
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

  it("zonder keuze geldt GEEN korting (besluit 86, 14 nov): een lege stand is false", async () => {
    expect(EMPTY_FISCAL.loonheffingskorting).toBe(false);
    expect((await getFiscal("onbekende-werker")).loonheffingskorting).toBe(false);
  });

  it("een record zonder keuzemerk telt als false, ook als er true in staat (de oude standaard); een uitdrukkelijke keuze blijft", () => {
    expect(normaliseerFiscal({ loonheffingskorting: true }).loonheffingskorting).toBe(false);
    expect(normaliseerFiscal({ loonheffingskorting: true, loonheffingskortingGekozen: true }).loonheffingskorting).toBe(true);
    expect(normaliseerFiscal({ loonheffingskorting: false, loonheffingskortingGekozen: true }).loonheffingskorting).toBe(false);
    expect(normaliseerFiscal(null).loonheffingskorting).toBe(false);
  });

  it("een uitdrukkelijke keuze (true of false) wordt met het keuzemerk bewaard en blijft staan bij een latere wijziging", async () => {
    kv.opslag.clear();
    await setFiscal("w1", { loonheffingskorting: true });
    expect((await getFiscal("w1")).loonheffingskorting).toBe(true);
    await setFiscal("w1", { birthDate: "1995-05-05" });
    expect((await getFiscal("w1")).loonheffingskorting).toBe(true);
    await setFiscal("w1", { loonheffingskorting: false });
    expect(kv.opslag.get("fiscal:w1")).toMatchObject({ loonheffingskorting: false, loonheffingskortingGekozen: true });
    // een record van vóór 14 nov (true, geen merk) wordt bij een andere wijziging niet ineens een keuze
    kv.opslag.set("fiscal:oud", { ...EMPTY_FISCAL, workerKind: "uitzendkracht", loonheffingskorting: true });
    await setFiscal("oud", { birthDate: "1990-01-01" });
    expect((await getFiscal("oud")).loonheffingskorting).toBe(false);
  });

  it("de loonstrook zegt 'Nee (niet gekozen)' zonder keuze, 'Nee' bij een uitdrukkelijke keuze en 'Ja' bij een gekozen korting", () => {
    const berekend = computePayslip({ workerKind: "uitzendkracht", invoiceMode: "payroll", vatValid: false, korApplies: false, loonheffingskorting: false, weeksWorked: 10, lines: [{ shiftId: "s1", shiftTitle: "Dienst", clientName: "Klant", workedOn: "2026-11-02", hours: 10, hourlyRateCents: 1500 }] });
    const slip = { computed: berekend, weekLabel: "week 45", workerKind: "uitzendkracht", weeksWorked: 10 } as never;
    const werkgever = { naam: "Zekerflex, Inc.", adres: null, kvk: null, loonheffingennummer: null } as never;
    const werknemer = { naam: "Test Werker", nummer: "ZF-1", bsnLaatste4: null, postcode: null };
    const lhk = (extra: { loonheffingskorting: boolean; loonheffingskortingGekozen?: boolean }) =>
      loonstrookRegels(slip, werkgever, werknemer, extra).find((r) => "label" in r && r.label === "Loonheffingskorting toegepast");
    expect(lhk({ loonheffingskorting: false, loonheffingskortingGekozen: false })).toMatchObject({ waarde: "Nee (niet gekozen)" });
    expect(lhk({ loonheffingskorting: false, loonheffingskortingGekozen: true })).toMatchObject({ waarde: "Nee" });
    expect(lhk({ loonheffingskorting: true, loonheffingskortingGekozen: true })).toMatchObject({ waarde: "Ja" });
    // zonder het keuzemerk (oudere aanroepers) blijft het "Nee"
    expect(lhk({ loonheffingskorting: false })).toMatchObject({ waarde: "Nee" });
  });

  it("de loonberekening rekent zonder keuze met 36,97% en met een gekozen korting met 27,35% (lib/payroll/compute.ts:231)", () => {
    const basis = { workerKind: "uitzendkracht" as const, invoiceMode: "payroll" as const, vatValid: false, korApplies: false, weeksWorked: 10, lines: [{ shiftId: "s1", shiftTitle: "Dienst", clientName: "Klant", workedOn: "2026-11-02", hours: 10, hourlyRateCents: 1500 }] };
    const zonder = computePayslip({ ...basis, loonheffingskorting: normaliseerFiscal(null).loonheffingskorting }).breakdown;
    const met = computePayslip({ ...basis, loonheffingskorting: true }).breakdown;
    if (zonder.kind !== "payroll" || met.kind !== "payroll") throw new Error("verwacht een loonstrook");
    expect(zonder.wageTaxIndicativeCents).toBe(Math.round(zonder.taxableCents * 0.3697));
    expect(met.wageTaxIndicativeCents).toBe(Math.round(met.taxableCents * 0.2735));
    expect(zonder.wageTaxIndicativeCents).toBeGreaterThan(met.wageTaxIndicativeCents);
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
