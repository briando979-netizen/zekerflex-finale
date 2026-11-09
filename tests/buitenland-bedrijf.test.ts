import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUITEN_LANDEN, EU_LANDEN, controleerBuitenlandInvoer, landNaam, landSoort, normaliseerLand, viesLandCode } from "@/lib/onboarding/buitenland";

const m = vi.hoisted(() => ({
  membership: vi.fn(),
  tenantUpdate: vi.fn(),
  tenantFindMany: vi.fn(),
  branchFindFirst: vi.fn(),
  branchCreate: vi.fn(),
  userFindUnique: vi.fn(),
  registerTenantCompany: vi.fn(),
  checkVies: vi.fn(),
  setBewijs: vi.fn(),
  getBewijs: vi.fn(),
  alert: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    membership: { findFirst: m.membership },
    tenant: { update: m.tenantUpdate, findMany: m.tenantFindMany },
    branch: { findFirst: m.branchFindFirst, create: m.branchCreate, update: vi.fn() },
    user: { findUnique: m.userFindUnique },
  },
}));
vi.mock("@/lib/integrations/pdok", () => ({ geocodePostcode: async () => ({ postalCode: "1012AB", city: "Amsterdam", latitude: 52.37, longitude: 4.89 }) }));
vi.mock("@/lib/company/registration", () => ({ registerTenantCompany: m.registerTenantCompany }));
vi.mock("@/lib/integrations/vies", () => ({ checkVies: m.checkVies }));
vi.mock("@/lib/company/buitenland", () => ({ setBuitenlandBewijs: m.setBewijs, getBuitenlandBewijs: m.getBewijs }));
vi.mock("@/lib/company/verified", () => ({ notifyPendingReactions: vi.fn(), setKvkBewijs: vi.fn() }));
vi.mock("@/lib/company/eigendom", () => ({ eigendomVanEmail: () => ({ ok: false, reden: "gratis-mail" }) }));
vi.mock("@/lib/ops/alert", () => ({ alertOwnerLater: m.alert }));
vi.mock("@/lib/audit", () => ({ recordAudit: m.audit }));

const { employerOnboardingSchema, submitEmployerOnboarding, isEmployerOnboarded } = await import("@/lib/onboarding/employer");

const vestiging = { branchName: "Magazijn", addressLine: "Damrak 1", postalCode: "1012 AB", houseNumber: "1" };

beforeEach(() => {
  vi.clearAllMocks();
  m.membership.mockResolvedValue({ id: "m1" });
  m.branchFindFirst.mockResolvedValue(null);
  m.branchCreate.mockResolvedValue({ id: "b1" });
  m.tenantUpdate.mockResolvedValue({});
  m.getBewijs.mockResolvedValue(null);
});

describe("land en invoer (puur)", () => {
  it("kent Nederland, de EU en daarbuiten, en laat een leeg land Nederland zijn", () => {
    expect(landSoort(undefined)).toBe("NL");
    expect(landSoort("nl")).toBe("NL");
    expect(landSoort("DE")).toBe("EU");
    expect(landSoort("US")).toBe("BUITEN");
    expect(landSoort("QQ")).toBeNull();
    expect(normaliseerLand("  de ")).toBe("DE");
  });

  it("geeft Nederlandse landnamen en de VIES-code van Griekenland", () => {
    expect(landNaam("DE")).toBe("Duitsland");
    expect(landNaam("ZZ")).toBe("Ander land buiten de EU");
    expect(viesLandCode("GR")).toBe("EL");
    expect(viesLandCode("DE")).toBe("DE");
  });

  it("heeft geen land dubbel en Nederland staat niet in de lijsten", () => {
    const codes = [...EU_LANDEN, ...BUITEN_LANDEN].map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).not.toContain("NL");
  });

  it("vraagt een btw-nummer binnen de EU en een registratienummer daarbuiten", () => {
    expect(controleerBuitenlandInvoer({ land: "DE", btwNummer: "", registratieNummer: "" }).ok).toBe(false);
    expect(controleerBuitenlandInvoer({ land: "DE", btwNummer: "DE123456789", registratieNummer: "" })).toEqual({ ok: true, soort: "EU" });
    expect(controleerBuitenlandInvoer({ land: "US", btwNummer: "", registratieNummer: "ab" }).ok).toBe(false);
    expect(controleerBuitenlandInvoer({ land: "US", btwNummer: "", registratieNummer: "DE-7654321" })).toEqual({ ok: true, soort: "BUITEN" });
  });
});

describe("formulier", () => {
  it("laat Nederland zoals het was: land valt terug op NL en het KVK-nummer blijft verplicht", () => {
    expect(employerOnboardingSchema.safeParse({ ...vestiging, kvkNumber: "12345678" }).success).toBe(true);
    const zonder = employerOnboardingSchema.safeParse({ ...vestiging });
    expect(zonder.success).toBe(false);
    expect(zonder.error?.issues[0]?.message).toMatch(/KVK/);
  });

  it("eist bij een EU-land een btw-nummer, geen KVK", () => {
    expect(employerOnboardingSchema.safeParse({ ...vestiging, land: "DE", btwNummer: "DE123456789" }).success).toBe(true);
    expect(employerOnboardingSchema.safeParse({ ...vestiging, land: "DE" }).success).toBe(false);
  });

  it("eist buiten de EU een registratienummer en weigert een onbekend land", () => {
    expect(employerOnboardingSchema.safeParse({ ...vestiging, land: "US", registratieNummer: "DE-7654321" }).success).toBe(true);
    expect(employerOnboardingSchema.safeParse({ ...vestiging, land: "US" }).success).toBe(false);
    expect(employerOnboardingSchema.safeParse({ ...vestiging, land: "QQ", registratieNummer: "12345" }).success).toBe(false);
  });
});

describe("aanmelden buiten Nederland", () => {
  const eu = () => employerOnboardingSchema.parse({ ...vestiging, land: "DE", btwNummer: "DE 123 456 789" });

  it("EU met een geldig btw-nummer: slaat land en nummer op, wacht op een beheerder en meldt de eigenaar", async () => {
    m.checkVies.mockResolvedValue({ vatNumber: "DE123456789", countryCode: "DE", status: "valid", name: "Muster GmbH", address: null });
    const r = await submitEmployerOnboarding("u1", "t1", eu());
    expect(r).toMatchObject({ kvkValid: true, inControle: true, buitenlands: true, companyName: "Muster GmbH" });
    expect(m.registerTenantCompany).not.toHaveBeenCalled();
    expect(m.tenantUpdate).toHaveBeenCalledWith({ where: { id: "t1" }, data: { country: "DE", vatNumber: "DE123456789" } });
    expect(m.setBewijs).toHaveBeenCalledWith("t1", expect.objectContaining({ land: "DE", btw: "geldig" }));
    expect(m.alert).toHaveBeenCalledWith(expect.objectContaining({ key: "bedrijf-controle:t1", url: "/admin/bedrijven/t1" }));
    // de naam uit VIES vervangt de organisatienaam niet
    expect(m.tenantUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ data: { name: "Muster GmbH" } }));
  });

  it("weigert een ongeldig btw-nummer in gewoon Nederlands en slaat niets op over het bedrijf", async () => {
    m.checkVies.mockResolvedValue({ vatNumber: "DE123456789", countryCode: "DE", status: "invalid", name: null, address: null });
    const r = await submitEmployerOnboarding("u1", "t1", eu());
    expect(r.kvkValid).toBe(false);
    expect(r.reasons[0]).toMatch(/btw-register/);
    expect(m.setBewijs).not.toHaveBeenCalled();
    expect(m.alert).not.toHaveBeenCalled();
  });

  it("weigert een btw-nummer van een ander land dan gekozen", async () => {
    m.checkVies.mockResolvedValue({ vatNumber: "FR12345678901", countryCode: "FR", status: "valid", name: "X", address: null });
    const r = await submitEmployerOnboarding("u1", "t1", eu());
    expect(r.kvkValid).toBe(false);
    expect(r.reasons[0]).toMatch(/Duitsland/);
  });

  it("neemt het bedrijf aan als VIES niet bereikbaar is, met de aantekening dat de beheerder het zelf controleert", async () => {
    m.checkVies.mockResolvedValue({ vatNumber: "DE123456789", countryCode: "DE", status: "unavailable", name: null, address: null });
    const r = await submitEmployerOnboarding("u1", "t1", eu());
    expect(r).toMatchObject({ kvkValid: true, inControle: true });
    expect(m.setBewijs).toHaveBeenCalledWith("t1", expect.objectContaining({ btw: "niet-bereikbaar" }));
    expect(m.alert.mock.calls[0]?.[0].detail).toMatch(/nog te controleren/);
  });

  it("meldt een btw-nummer dat al bij een ander account hoort", async () => {
    m.checkVies.mockResolvedValue({ vatNumber: "DE123456789", countryCode: "DE", status: "valid", name: "Muster GmbH", address: null });
    m.tenantUpdate.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));
    const r = await submitEmployerOnboarding("u1", "t1", eu());
    expect(r.kvkValid).toBe(false);
    expect(r.reasons[0]).toMatch(/ander ZekerFlex-account/);
  });

  it("buiten de EU: registratienummer als vrije tekst, zonder VIES, en wacht op een beheerder", async () => {
    const input = employerOnboardingSchema.parse({ ...vestiging, land: "US", registratieNummer: "DE-7654321" });
    const r = await submitEmployerOnboarding("u1", "t1", input);
    expect(m.checkVies).not.toHaveBeenCalled();
    expect(r).toMatchObject({ kvkValid: true, inControle: true, buitenlands: true });
    expect(m.tenantUpdate).toHaveBeenCalledWith({ where: { id: "t1" }, data: { country: "US" } });
    expect(m.setBewijs).toHaveBeenCalledWith("t1", expect.objectContaining({ land: "US", registratieNummer: "DE-7654321", btw: null }));
  });

  it("Nederland loopt nog altijd via het KVK", async () => {
    m.registerTenantCompany.mockResolvedValue({ kvkValid: true, profile: { legalName: "Bakker BV", tradeName: null, kvkNumber: "12345678" }, validation: { reasons: [] } });
    m.userFindUnique.mockResolvedValue({ email: "jan@gmail.com" });
    const r = await submitEmployerOnboarding("u1", "t1", employerOnboardingSchema.parse({ ...vestiging, kvkNumber: "1234 5678" }));
    expect(m.registerTenantCompany).toHaveBeenCalledWith({ tenantId: "t1", kvkNumber: "12345678", allowInactive: true });
    expect(m.checkVies).not.toHaveBeenCalled();
    expect(r).toMatchObject({ kvkValid: true, inControle: true, buitenlands: false, companyName: "Bakker BV" });
  });
});

describe("isEmployerOnboarded", () => {
  const branch = [{ id: "b1" }];

  it("telt een KVK-bedrijf met vestiging", async () => {
    m.tenantFindMany.mockResolvedValue([{ id: "t1", country: "NL", vatNumber: null, companyRegistrationId: "r1", branches: branch }]);
    expect(await isEmployerOnboarded(["t1"])).toBe(true);
  });

  it("telt een buitenlands bedrijf met btw-nummer of registratienummer, maar alleen met een vestiging", async () => {
    m.tenantFindMany.mockResolvedValue([{ id: "t1", country: "DE", vatNumber: "DE123456789", companyRegistrationId: null, branches: branch }]);
    expect(await isEmployerOnboarded(["t1"])).toBe(true);
    m.tenantFindMany.mockResolvedValue([{ id: "t1", country: "US", vatNumber: null, companyRegistrationId: null, branches: branch }]);
    m.getBewijs.mockResolvedValue({ land: "US", btw: null, registratieNummer: "X-1234", at: "x" });
    expect(await isEmployerOnboarded(["t1"])).toBe(true);
    m.tenantFindMany.mockResolvedValue([{ id: "t1", country: "DE", vatNumber: "DE123456789", companyRegistrationId: null, branches: [] }]);
    expect(await isEmployerOnboarded(["t1"])).toBe(false);
  });

  it("telt een Nederlands bedrijf zonder KVK niet, ook niet met een btw-nummer", async () => {
    m.tenantFindMany.mockResolvedValue([{ id: "t1", country: "NL", vatNumber: "NL123456789B01", companyRegistrationId: null, branches: branch }]);
    expect(await isEmployerOnboarded(["t1"])).toBe(false);
  });

  it("zonder organisaties niet", async () => {
    expect(await isEmployerOnboarded([])).toBe(false);
  });
});
