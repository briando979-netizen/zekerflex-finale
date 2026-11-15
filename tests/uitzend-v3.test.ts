import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Uitzendovereenkomst, sjabloon v3 (15 nov 2026). De eigenaar: de overeenkomst moet de gegevens van de persoon (naam, adres, …) en van
// Zekerflex noemen, en het stuk over het recht om te werken gaat eruit. v3 noemt de geboortedatum en het woonadres van de uitzendkracht,
// de rechtsvorm en inschrijving van Zekerflex, Inc., en laat de zin "beschikt over een geldige verblijfs- en werkvergunning" weg.
// Een al getekende v1 of v2 blijft precies zoals getekend.

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  fiscal: {} as Record<string, unknown>,
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (h.kv.has(k) ? structuredClone(h.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, structuredClone(v)),
  kvAppend: async (k: string, item: unknown) => {
    const arr = ((h.kv.get(k) as unknown[] | undefined) ?? []).slice();
    arr.push(structuredClone(item));
    h.kv.set(k, arr);
  },
  kvListEntries: async () => [],
}));
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: async () => ({ bsnLast4: "6782", birthDate: null, ...h.fiscal }) }));
vi.mock("@/lib/payroll/uitzend-status", () => ({ getUitzendStatus: async () => ({ phase: "A", weeksWorked: 0 }) }));
vi.mock("@/lib/platform/werkgever", () => ({ werkgeverGegevens: () => ({ naam: "Zekerflex, Inc.", adres: null, kvk: null, loonheffingennummer: null }) }));

import { SJABLOON_HUIDIG, signUitzendContract, voorbeeldUitzendContract, type UitzendContract } from "@/lib/agreements/uitzend-contract";
import { uitzendContractBlokken } from "@/lib/agreements/uitzend-tekst";
import { controleerWoonadres, gegevensVoorContractCompleet, leesWoonadres, netteNlPostcode, woonadresRegel } from "@/lib/agreements/uitzend-gegevens";
import { uitzendContractPdf } from "@/lib/pdf/documents";

const NU = new Date("2026-11-15T12:00:00+01:00").getTime();
const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const tekstVan = (c: UitzendContract) => uitzendContractBlokken(c).map((b) => ("tekst" in b ? b.tekst : "")).join("\n");
const ADRES = { straat: "Dorpsstraat", huisnummer: "12a", postcode: "9711ab", plaats: "Groningen", land: "Nederland" };

beforeEach(() => {
  h.kv.clear();
  h.fiscal = {};
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NU));
});

describe("het woonadres: controleren en op één regel", () => {
  it("Nederland: nette postcode, het land niet in de regel", () => {
    const r = controleerWoonadres(ADRES);
    expect(r).toEqual({ ok: true, adres: { ...ADRES, postcode: "9711 AB" } });
    if (r.ok) expect(woonadresRegel(r.adres)).toBe("Dorpsstraat 12a, 9711 AB Groningen");
    expect(netteNlPostcode("1234 ab")).toBe("1234 AB");
    expect(netteNlPostcode("0123 AB")).toBeNull();
  });

  it("buiten Nederland: een eigen postcode en het land erbij", () => {
    const r = controleerWoonadres({ straat: "ul. Długa", huisnummer: "5", postcode: "00-238", plaats: "Warszawa", land: "Polska" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(woonadresRegel(r.adres)).toBe("ul. Długa 5, 00-238 Warszawa, Polska");
  });

  it("het eerste veld dat niet klopt, in de volgorde van het formulier; zonder land geldt Nederland", () => {
    expect(controleerWoonadres({ ...ADRES, straat: " " })).toEqual({ ok: false, veld: "straat" });
    expect(controleerWoonadres({ ...ADRES, huisnummer: "a12" })).toEqual({ ok: false, veld: "huisnummer" });
    expect(controleerWoonadres({ ...ADRES, postcode: "12345" })).toEqual({ ok: false, veld: "postcode" });
    expect(controleerWoonadres({ ...ADRES, plaats: "" })).toEqual({ ok: false, veld: "plaats" });
    expect(controleerWoonadres({ straat: "Kerkweg", huisnummer: "1", postcode: "1234AB", plaats: "Ede" })).toMatchObject({ ok: true, adres: { land: "Nederland" } });
    expect(controleerWoonadres(null)).toEqual({ ok: false, veld: "straat" });
    expect(leesWoonadres({ straat: "x" })).toBeNull();
  });

  it("compleet = een geboortedatum en een geldig adres", () => {
    expect(gegevensVoorContractCompleet({ birthDate: "1995-03-04", woonadres: ADRES })).toBe(true);
    expect(gegevensVoorContractCompleet({ birthDate: null, woonadres: ADRES })).toBe(false);
    expect(gegevensVoorContractCompleet({ birthDate: "1995-03-04", woonadres: null })).toBe(false);
  });
});

describe("v3: de gegevens van de werker en van Zekerflex, zonder werkvergunning", () => {
  it("een nieuwe overeenkomst neemt naam, geboortedatum en woonadres over, en de inschrijving van Zekerflex, Inc.", async () => {
    h.fiscal = { birthDate: "1995-03-04", woonadres: { ...ADRES, postcode: "9711 AB" } };
    const { contract } = await signUitzendContract("u1", "Anna Kowalska");
    expect(SJABLOON_HUIDIG).toBe(3);
    expect(contract).toMatchObject({ sjabloon: 3, workerBirthDate: "1995-03-04", workerAddress: "Dorpsstraat 12a, 9711 AB Groningen" });
    const t = tekstVan(contract);
    expect(t).toContain('Anna Kowalska, geboren op 04 maart 1995, wonende te Dorpsstraat 12a, 9711 AB Groningen, BSN eindigend op 6782, hierna "de Uitzendkracht";');
    expect(t).toContain("Zekerflex, Inc., een vennootschap naar het recht van de staat Delaware (Verenigde Staten), ingeschreven onder nummer 10830906, als uitzendonderneming");
    expect(t).toContain("De Uitzendkracht kan zich te allen tijde legitimeren met een geldig identiteitsbewijs.");
    expect(t).not.toMatch(/werkvergunning|verblijfs/);
    expect(uitzendContractPdf(contract).bytes.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("het voorbeeld vóór het tekenen toont dezelfde gegevens; wat ontbreekt valt weg (niets verzonnen)", async () => {
    const leeg = await voorbeeldUitzendContract("u2", "Piet", new Date(NU));
    expect(leeg).not.toHaveProperty("workerAddress");
    expect(leeg).not.toHaveProperty("workerBirthDate");
    expect(tekstVan(leeg)).toContain('Piet, BSN eindigend op 6782, hierna "de Uitzendkracht";');
  });

  it("een getekende v2 blijft zoals getekend: de oude partijen en de zin over de werkvergunning", () => {
    const v2: UitzendContract = {
      id: "v2",
      reference: "ZF-UZO-2026-002-u1",
      userId: "u1",
      workerName: "Anna Kowalska",
      workerBsnLast4: "6782",
      employerName: "Zekerflex, Inc.",
      employerKvk: "",
      sjabloon: 2,
      signedAt: "2026-11-12T09:30:00.000Z",
      validFrom: "2026-11-12T09:30:00.000Z",
      validUntil: "2027-02-12T09:30:00.000Z",
      phase: "A",
      weeksWorked: 0,
    };
    const t = tekstVan(v2);
    expect(t).toContain('Zekerflex, Inc., als uitzendonderneming en formeel werkgever, hierna "ZekerFlex";');
    expect(t).toContain('Anna Kowalska, BSN eindigend op 6782, hierna "de Uitzendkracht";');
    expect(t).toContain("en beschikt over een geldige verblijfs- en werkvergunning voor Nederland.");
    expect(t).not.toContain("Delaware");
  });
});

describe("tekenen vraagt de gegevens eerst", () => {
  it("de route weigert zonder geboortedatum en woonadres; het scherm vraagt ze vóór de knop", () => {
    expect(bron("app/api/me/uitzend/contract/route.ts")).toContain("if (!gegevensVoorContractCompleet(fiscal))");
    const scherm = bron("components/app/UitzendContractCard.tsx");
    expect(scherm).toContain("<ContractGegevens");
    expect(scherm).toContain("disabled={busy || !gelezen || !klaar}");
    // het scherm zelf neemt geen prisma, kv of zod mee
    expect(bron("lib/agreements/uitzend-gegevens.ts")).not.toMatch(/from "@\/lib\/(prisma|storage|mail)|from "zod"/);
  });

  it("geen adres of geboortedatum in het auditlog van de gegevensroute", () => {
    const route = bron("app/api/me/uitzend/gegevens/route.ts");
    expect(route).toContain('summary: "Gegevens voor de uitzendovereenkomst (woonadres) bijgewerkt"');
    expect(route).not.toMatch(/summary: `[^`]*\$\{/);
  });
});
