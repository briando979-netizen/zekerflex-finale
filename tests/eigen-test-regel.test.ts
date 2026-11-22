import { describe, expect, it } from "vitest";
import {
  GEEN_KIJKER,
  INTERNE_ADRESSEN,
  eigenTestVoorwaarden,
  heeftEigenTest,
  isEigenTestBedrijf,
  isInternAdres,
  isNietOpenbaar,
  kijkerUit,
  magKlusZien,
  magReageren,
  verborgenBedrijven,
  zonderEigenTestAccounts,
  type Kijker,
} from "@/lib/admin/eigen-test-regel";
import type { EigenTest } from "@/lib/admin/eigen-test-kern";

// De grondregel voor de privé-accounts van de eigenaar (22 nov 2026): een klus van een eigen-testbedrijf is alleen zichtbaar en
// reageerbaar voor eigen-test-accounts en interne accounts; een eigen-test-werker reageert alleen op klussen van eigen-testbedrijven.
// Puur: elke combinatie van echt of eigen test, werker of bedrijf, en intern.

const sinds = "2026-11-13T12:00:00.000Z";
const et: EigenTest = { tenants: { t_prive: sinds }, users: { u_werker: sinds } };

const mem = (role: string, tenantId: string) => ({ role, tenantId });
const echteWerker = kijkerUit(et, { userId: "u_echt", email: "jan@mail.nl", memberships: [mem("FREELANCER", "org_platform")] });
const echtBedrijf = kijkerUit(et, { userId: "u_bakker", email: "bakker@mail.nl", memberships: [mem("HQ_ADMIN", "t_echt")] });
const eigenWerker = kijkerUit(et, { userId: "u_werker", email: "ik+werker@mail.nl", memberships: [mem("FREELANCER", "org_platform")] });
const eigenBedrijf = kijkerUit(et, { userId: "u_ik", email: "ik+bedrijf@mail.nl", memberships: [mem("HQ_ADMIN", "t_prive")] });
const beheer = kijkerUit(et, { userId: "u_admin", email: "beheer@mail.nl", memberships: [mem("PLATFORM_ADMIN", "org_platform")] });
const verkoop = kijkerUit(et, { userId: "u_sales", email: "sales@mail.nl", memberships: [mem("SALES", "org_platform")] });
const internAdres = kijkerUit(et, { userId: "u_intern", email: "iemand@zekerflex.nl", memberships: [mem("FREELANCER", "org_platform")] });

const priveKlus = { tenantId: "t_prive", eigenTestBedrijf: true };
const echteKlus = { tenantId: "t_echt", eigenTestBedrijf: false };

describe("wie is de kijker", () => {
  it("eigen test: het account zelf of een van zijn bedrijven; intern: beheer, verkoop of een intern adres", () => {
    expect(echteWerker).toEqual({ eigenTest: false, intern: false, lidVan: ["org_platform"] });
    expect(eigenWerker.eigenTest).toBe(true);
    expect(eigenBedrijf.eigenTest).toBe(true);
    expect(echtBedrijf.eigenTest).toBe(false);
    expect(beheer.intern).toBe(true);
    expect(verkoop.intern).toBe(true);
    expect(internAdres.intern).toBe(true);
    expect(eigenWerker.intern).toBe(false);
    expect(GEEN_KIJKER).toEqual({ eigenTest: false, intern: false, lidVan: [] });
  });

  it("een intern adres: de testadressen en die van ZekerFlex, zonder letten op hoofdletters; een gewoon adres niet", () => {
    for (const a of [".test", "@zekerflex.nl", "@zekerflex.com"]) expect(INTERNE_ADRESSEN).toContain(a);
    expect(isInternAdres("Demo@ZEKERFLEX.TEST")).toBe(true);
    expect(isInternAdres(" x@Zekerflex.nl ")).toBe(true);
    expect(isInternAdres("jan@gmail.com")).toBe(false);
    expect(isInternAdres("")).toBe(false);
    expect(isInternAdres(null)).toBe(false);
  });

  it("zonder markeringen is niemand eigen test", () => {
    const leeg: EigenTest = { tenants: {}, users: {} };
    expect(heeftEigenTest(leeg)).toBe(false);
    expect(heeftEigenTest(null)).toBe(false);
    expect(heeftEigenTest(et)).toBe(true);
    expect(kijkerUit(leeg, { userId: "u_werker", email: null, memberships: [] }).eigenTest).toBe(false);
  });

  it("een bedrijf is eigen test op zijn id, niet op een naam uit het prototype", () => {
    expect(isEigenTestBedrijf(et, "t_prive")).toBe(true);
    expect(isEigenTestBedrijf(et, "t_echt")).toBe(false);
    expect(isEigenTestBedrijf(et, "constructor")).toBe(false);
    expect(isEigenTestBedrijf(et, null)).toBe(false);
    expect(isEigenTestBedrijf(null, "t_prive")).toBe(false);
  });
});

describe("een klus zien", () => {
  it("een klus van een eigen-testbedrijf: alleen eigen test en intern, niet echte werkers of bedrijven", () => {
    expect(magKlusZien(echteWerker, priveKlus)).toBe(false);
    expect(magKlusZien(echtBedrijf, priveKlus)).toBe(false);
    expect(magKlusZien(GEEN_KIJKER, priveKlus)).toBe(false);
    expect(magKlusZien(eigenWerker, priveKlus)).toBe(true);
    expect(magKlusZien(eigenBedrijf, priveKlus)).toBe(true);
    expect(magKlusZien(beheer, priveKlus)).toBe(true);
    expect(magKlusZien(verkoop, priveKlus)).toBe(true);
    expect(magKlusZien(internAdres, priveKlus)).toBe(true);
  });

  it("een lid van het bedrijf zelf ziet zijn klussen altijd", () => {
    const lid: Kijker = { eigenTest: false, intern: false, lidVan: ["t_prive"] };
    expect(magKlusZien(lid, priveKlus)).toBe(true);
    expect(magKlusZien({ ...lid, lidVan: ["t_ander"] }, priveKlus)).toBe(false);
  });

  it("een klus van een echt bedrijf ziet iedereen, ook een eigen-test-account", () => {
    for (const k of [echteWerker, echtBedrijf, eigenWerker, eigenBedrijf, beheer, verkoop, internAdres, GEEN_KIJKER]) {
      expect(magKlusZien(k, echteKlus)).toBe(true);
    }
  });
});

describe("op een klus reageren, matchen en inplannen", () => {
  it("een klus van een eigen-testbedrijf: alleen wie hem mag zien", () => {
    expect(magReageren(echteWerker, priveKlus)).toBe(false);
    expect(magReageren(eigenWerker, priveKlus)).toBe(true);
    expect(magReageren(beheer, priveKlus)).toBe(true);
    expect(magReageren(internAdres, priveKlus)).toBe(true);
  });

  it("een klus van een echt bedrijf: nooit een eigen-test-account, ook niet als het ook intern is", () => {
    expect(magReageren(echteWerker, echteKlus)).toBe(true);
    expect(magReageren(echtBedrijf, echteKlus)).toBe(true);
    expect(magReageren(beheer, echteKlus)).toBe(true);
    expect(magReageren(internAdres, echteKlus)).toBe(true);
    expect(magReageren(eigenWerker, echteKlus)).toBe(false);
    expect(magReageren(eigenBedrijf, echteKlus)).toBe(false);
    const eigenEnIntern = kijkerUit(et, { userId: "u_werker", email: "x@zekerflex.nl", memberships: [] });
    expect(eigenEnIntern.intern).toBe(true);
    expect(magReageren(eigenEnIntern, echteKlus)).toBe(false);
  });
});

describe("welke bedrijven blijven verborgen", () => {
  const twee: EigenTest = { tenants: { t_prive: sinds, t_tweede: sinds }, users: {} };

  it("een echte kijker mist alle eigen-testbedrijven, een eigen-test-kijker en intern geen enkele", () => {
    expect(verborgenBedrijven(twee, GEEN_KIJKER)).toEqual(["t_prive", "t_tweede"]);
    expect(verborgenBedrijven(twee, { eigenTest: true, intern: false, lidVan: [] })).toEqual([]);
    expect(verborgenBedrijven(twee, { eigenTest: false, intern: true, lidVan: [] })).toEqual([]);
    expect(verborgenBedrijven(twee, { eigenTest: false, intern: false, lidVan: ["t_tweede"] })).toEqual(["t_prive"]);
    expect(verborgenBedrijven(null, GEEN_KIJKER)).toEqual([]);
    expect(verborgenBedrijven({ tenants: {}, users: { u_werker: sinds } }, GEEN_KIJKER)).toEqual([]);
  });
});

describe("hoort een klus nooit in een openbare telling", () => {
  const klus = (over: Partial<{ title: string; bedrijf: string; tenantId: string; createdAt: string }> = {}) => ({
    title: "Afwasser",
    bedrijf: "Café De Brug",
    tenantId: "t_echt",
    createdAt: "2026-11-14T10:00:00.000Z",
    ...over,
  });

  it("elke klus van een eigen-testbedrijf, ook die van vóór de markering", () => {
    expect(isNietOpenbaar(et, klus({ tenantId: "t_prive" }))).toBe(true);
    expect(isNietOpenbaar(et, klus({ tenantId: "t_prive", createdAt: "2026-11-01T10:00:00.000Z" }))).toBe(true);
  });

  it("een testklus op naam, ook zonder markering", () => {
    expect(isNietOpenbaar(null, klus({ bedrijf: "Test bedrijven" }))).toBe(true);
    expect(isNietOpenbaar(et, klus({ title: "Testklus kassa" }))).toBe(true);
  });

  it("een gewone klus van een echt bedrijf telt mee", () => {
    expect(isNietOpenbaar(et, klus())).toBe(false);
    expect(isNietOpenbaar(null, klus())).toBe(false);
  });
});

describe("filters voor een gebruikersvraag in de database", () => {
  it("zonder markeringen: leeg, dus geen extra voorwaarde en geen verandering voor echte gebruikers", () => {
    expect(eigenTestVoorwaarden(null)).toEqual([]);
    expect(zonderEigenTestAccounts(null)).toEqual({});
    expect(zonderEigenTestAccounts({ tenants: {}, users: {} })).toEqual({});
  });

  it("met markeringen: niet zelf gemarkeerd en geen lid van een gemarkeerd bedrijf, onder AND naast NOT van de testwerker", () => {
    expect(zonderEigenTestAccounts(et)).toEqual({
      AND: [{ NOT: { OR: [{ id: { in: ["u_werker"] } }, { memberships: { some: { tenantId: { in: ["t_prive"] } } } }] } }],
    });
    expect(zonderEigenTestAccounts({ tenants: {}, users: { u_werker: sinds } })).toEqual({ AND: [{ NOT: { OR: [{ id: { in: ["u_werker"] } }] } }] });
    expect(zonderEigenTestAccounts({ tenants: { t_prive: sinds }, users: {} })).toEqual({
      AND: [{ NOT: { OR: [{ memberships: { some: { tenantId: { in: ["t_prive"] } } } }] } }],
    });
  });
});
