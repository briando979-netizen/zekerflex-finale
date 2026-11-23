import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUITEN_LANDEN, EU_LANDEN, controleerBuitenlandInvoer, landNaam, landSoort, normaliseerLand, viesLandCode } from "@/lib/onboarding/buitenland";

const m = vi.hoisted(() => ({
  membership: vi.fn(),
  tenantUpdate: vi.fn(),
  tenantFindMany: vi.fn(),
  branchFindFirst: vi.fn(),
  branchCreate: vi.fn(),
  branchCount: vi.fn(),
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
    branch: { findFirst: m.branchFindFirst, create: m.branchCreate, update: vi.fn(), count: m.branchCount },
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

const { employerKvkSchema, employerOnboardingSchema, submitEmployerOnboarding, isEmployerOnboarded, koppelBedrijfsgegevens, heeftVestiging } = await import("@/lib/onboarding/employer");

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

// 22 nov 2026 (gebruikersonderzoek B27): wie de werklocatie al toevoegde (Locaties of Klus uitzetten), krijgt in de
// KVK-stap alleen nog de vraag naar het bedrijf. De verificatie zelf blijft precies zoals hij was.
describe("de werklocatie staat er al", () => {
  it("het schema vraagt geen vestigingsvelden, maar wel het KVK-nummer of het buitenlandse nummer", () => {
    expect(employerKvkSchema.safeParse({ kvkNumber: "12345678" }).success).toBe(true);
    expect(employerKvkSchema.safeParse({}).error?.issues[0]?.message).toMatch(/KVK/);
    expect(employerKvkSchema.safeParse({ land: "DE" }).success).toBe(false);
    expect(employerKvkSchema.safeParse({ land: "DE", btwNummer: "DE123456789" }).success).toBe(true);
  });

  it("controleert het bedrijf en laat de bestaande vestiging zoals hij is", async () => {
    m.branchFindFirst.mockResolvedValue({ id: "b9" });
    m.registerTenantCompany.mockResolvedValue({ kvkValid: true, profile: { legalName: "Bakker BV", tradeName: null, kvkNumber: "12345678" }, validation: { reasons: [] } });
    m.userFindUnique.mockResolvedValue({ email: "jan@gmail.com" });
    const r = await submitEmployerOnboarding("u1", "t1", employerKvkSchema.parse({ kvkNumber: "12345678" }));
    expect(m.branchFindFirst).toHaveBeenCalledWith({ where: { tenantId: "t1", kind: "PERMANENT" }, select: { id: true } });
    expect(m.registerTenantCompany).toHaveBeenCalledWith({ tenantId: "t1", kvkNumber: "12345678", allowInactive: true });
    expect(m.branchCreate).not.toHaveBeenCalled();
    expect(r).toMatchObject({ kvkValid: true, branchId: "b9" });
  });

  it("zonder vaste werklocatie: een nette melding, en er wordt niets gecontroleerd of opgeslagen", async () => {
    m.branchFindFirst.mockResolvedValue(null);
    await expect(submitEmployerOnboarding("u1", "t1", employerKvkSchema.parse({ kvkNumber: "12345678" }))).rejects.toMatchObject({ status: 422 });
    expect(m.registerTenantCompany).not.toHaveBeenCalled();
    expect(m.branchCreate).not.toHaveBeenCalled();
  });
});

// 23 nov 2026 ("Nog een paar laatste checks"): het bedrijf wordt pas gekoppeld als het iemand wil inplannen, zonder vestiging erbij.
describe("koppelBedrijfsgegevens: alleen het bedrijf, zonder vestiging", () => {
  const kvk = () => employerKvkSchema.parse({ kvkNumber: "12345678" });

  it("koppelt een Nederlands bedrijf via het KVK zonder dat er een vestiging nodig is of wordt gemaakt", async () => {
    m.registerTenantCompany.mockResolvedValue({ kvkValid: true, profile: { legalName: "Bakker BV", tradeName: null, kvkNumber: "12345678" }, validation: { reasons: [] } });
    m.userFindUnique.mockResolvedValue({ email: "jan@gmail.com" });
    const r = await koppelBedrijfsgegevens("u1", "t1", kvk());
    expect(r).toMatchObject({ kvkValid: true, inControle: true, buitenlands: false, zelfControle: false, companyName: "Bakker BV" });
    expect(m.registerTenantCompany).toHaveBeenCalledWith({ tenantId: "t1", kvkNumber: "12345678", allowInactive: true });
    expect(m.branchFindFirst).not.toHaveBeenCalled();
    expect(m.branchCreate).not.toHaveBeenCalled();
    // de naam uit het Handelsregister komt op de organisatie, zoals in de onboarding
    expect(m.tenantUpdate).toHaveBeenCalledWith({ where: { id: "t1" }, data: { name: "Bakker BV" } });
  });

  it("een buitenlands bedrijf loopt via het btw-nummer en wacht op een beheerder", async () => {
    m.checkVies.mockResolvedValue({ vatNumber: "DE123456789", countryCode: "DE", status: "valid", name: "Muster GmbH", address: null });
    const r = await koppelBedrijfsgegevens("u1", "t1", employerKvkSchema.parse({ land: "DE", btwNummer: "DE 123 456 789" }));
    expect(r).toMatchObject({ kvkValid: true, inControle: true, buitenlands: true, zelfControle: false });
    expect(m.registerTenantCompany).not.toHaveBeenCalled();
  });

  it("alleen de beheerder van het bedrijf: een ander lid krijgt een 423 (geen 403) en er wordt niets gecontroleerd", async () => {
    m.membership.mockResolvedValue(null);
    await expect(koppelBedrijfsgegevens("u1", "t1", kvk())).rejects.toMatchObject({ status: 423, code: "ALLEEN_BEHEERDER" });
    expect(m.registerTenantCompany).not.toHaveBeenCalled();
  });

  it("een KVK-nummer dat niet bestaat is geen zelfcontrole; een storing die we niet kennen wel (ZekerFlex kijkt zelf)", async () => {
    const { AppError } = await import("@/lib/errors");
    m.registerTenantCompany.mockRejectedValueOnce(AppError.notFound("No Handelsregister entry"));
    const bestaatNiet = await koppelBedrijfsgegevens("u1", "t1", kvk());
    expect(bestaatNiet).toMatchObject({ kvkValid: false, zelfControle: false });
    expect(bestaatNiet.reasons[0]).toBe("Dit KVK-nummer staat niet in het Handelsregister.");

    m.registerTenantCompany.mockRejectedValueOnce(new Error("onbekende storing"));
    const storing = await koppelBedrijfsgegevens("u1", "t1", kvk());
    expect(storing).toMatchObject({ kvkValid: false, zelfControle: true });
    expect(storing.reasons[0]).toContain("We controleren je KVK-nummer zelf");

    m.registerTenantCompany.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));
    const alVergeven = await koppelBedrijfsgegevens("u1", "t1", kvk());
    expect(alVergeven).toMatchObject({ kvkValid: false, zelfControle: false });
    expect(alVergeven.reasons[0]).toMatch(/ander ZekerFlex-account/);
  });
});

describe("heeftVestiging (de stap 'adres bevestigen' van Jouw start)", () => {
  it("telt alleen een vaste werklocatie, ook zonder KVK-nummer", async () => {
    m.branchCount.mockResolvedValue(1);
    expect(await heeftVestiging(["t1"])).toBe(true);
    expect(m.branchCount).toHaveBeenCalledWith({ where: { tenantId: { in: ["t1"] }, kind: "PERMANENT" } });
    m.branchCount.mockResolvedValue(0);
    expect(await heeftVestiging(["t1"])).toBe(false);
  });

  it("zonder organisaties niet, en dan ook geen vraag aan de database", async () => {
    expect(await heeftVestiging([])).toBe(false);
    expect(m.branchCount).not.toHaveBeenCalled();
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
