import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// De vestiging uit de werkgever-onboarding (lib/onboarding/employer.ts) buiten Nederland (vlag `werk-in-belgie` voor België,
// `werk-in-buitenland` voor elk land; beide standaard uit). Zonder vestigingLand is het Nederland met precies de oude
// postcoderegel en PDOK; met een land dat de vlaggen niet toestaan dezelfde melding als een ongeldige postcode, zonder iets
// naar buiten te sturen of een vestiging te maken.

const m = vi.hoisted(() => ({
  membership: vi.fn(),
  branchFindFirst: vi.fn(),
  branchCreate: vi.fn(),
  registerTenantCompany: vi.fn(),
  geocodePostcode: vi.fn(),
  featureEnabled: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    membership: { findFirst: m.membership },
    tenant: { update: vi.fn().mockResolvedValue({}), findMany: vi.fn() },
    branch: { findFirst: m.branchFindFirst, create: m.branchCreate, update: vi.fn(), count: vi.fn() },
    user: { findUnique: vi.fn().mockResolvedValue({ email: "baas@bedrijf.test" }) },
  },
}));
vi.mock("@/lib/integrations/pdok", () => ({ geocodePostcode: (...a: unknown[]) => m.geocodePostcode(...a) }));
vi.mock("@/lib/flags", () => ({ featureEnabled: (...a: unknown[]) => m.featureEnabled(...a) }));
vi.mock("@/lib/integrations/osm-plaatsen", () => ({
  inDeRij: (_bron: string, _pauze: number, taak: () => Promise<unknown>) => taak(),
  NOMINATIM_PAUZE_MS: 0,
  OSM_USER_AGENT: "ZekerFlexBot/test",
}));
vi.mock("@/lib/company/registration", () => ({ registerTenantCompany: m.registerTenantCompany }));
vi.mock("@/lib/company/verified", () => ({ notifyPendingReactions: vi.fn(), setKvkBewijs: vi.fn() }));
vi.mock("@/lib/company/eigendom", () => ({ eigendomVanEmail: () => ({ ok: true, domein: "bedrijf.test" }) }));
vi.mock("@/lib/ops/alert", () => ({ alertOwnerLater: vi.fn() }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/kvk/tegoed-opslag", () => ({ wisKvkWacht: vi.fn(), zetKvkWacht: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const { employerOnboardingSchema, submitEmployerOnboarding } = await import("@/lib/onboarding/employer");
const { vestigingBuitenlandVergeetAlles } = await import("@/lib/geo/vestiging-buitenland");
const { WERK_IN_BELGIE_VLAG, WERK_IN_BUITENLAND_VLAG } = await import("@/lib/geo/vestiging-land");
const vlaggen = (aan: { belgie?: boolean; buitenland?: boolean }) =>
  m.featureEnabled.mockImplementation(async (key: string) => (key === WERK_IN_BELGIE_VLAG ? aan.belgie === true : key === WERK_IN_BUITENLAND_VLAG ? aan.buitenland === true : false));

const fetchMock = vi.fn();
const nl = { branchName: "Magazijn", addressLine: "Damrak 1", postalCode: "1012 AB", houseNumber: "1", kvkNumber: "12345678" };
const be = { branchName: "Antwerpen", addressLine: "Meir", postalCode: "2000", houseNumber: "1", kvkNumber: "12345678", vestigingLand: "BE" };

beforeEach(() => {
  vestigingBuitenlandVergeetAlles();
  vi.stubGlobal("fetch", fetchMock);
  m.membership.mockResolvedValue({ id: "m1" });
  m.branchFindFirst.mockResolvedValue(null);
  m.branchCreate.mockResolvedValue({ id: "b1" });
  m.registerTenantCompany.mockResolvedValue({ kvkValid: true, profile: { legalName: "Testzaak BV", tradeName: null, kvkNumber: "12345678" }, validation: { reasons: [] } });
  m.geocodePostcode.mockResolvedValue({ latitude: 52.37, longitude: 4.89, postalCode: "1012AB", city: "Amsterdam", street: "Damrak", approximate: false });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("de postcode van de vestiging in de onboarding", () => {
  it("zonder land: Nederland, met precies de oude regel", () => {
    expect(employerOnboardingSchema.safeParse(nl).success).toBe(true);
    const kaal = employerOnboardingSchema.safeParse({ ...nl, postalCode: "2000" });
    expect(kaal.success).toBe(false);
    expect(kaal.error?.issues.map((i) => i.message)).toContain("Gebruik een geldige postcode");
    expect(employerOnboardingSchema.safeParse({ ...nl, postalCode: "1012" }).success).toBe(false);
  });

  it("met land België: vier cijfers, en een Nederlandse postcode past daar niet", () => {
    expect(employerOnboardingSchema.safeParse(be).success).toBe(true);
    expect(employerOnboardingSchema.safeParse({ ...be, postalCode: "1012 AB" }).success).toBe(false);
    expect(employerOnboardingSchema.safeParse({ ...be, postalCode: "0999" }).success).toBe(false);
  });

  it("met een ander land: vrije tekst, en leeg alleen in een land zonder postcodes", () => {
    expect(employerOnboardingSchema.safeParse({ ...be, vestigingLand: "DE", postalCode: "10115" }).success).toBe(true);
    expect(employerOnboardingSchema.safeParse({ ...be, vestigingLand: "DE", postalCode: "" }).success).toBe(false);
    expect(employerOnboardingSchema.safeParse({ ...be, vestigingLand: "AE", postalCode: "" }).success).toBe(true);
    expect(employerOnboardingSchema.safeParse({ ...be, vestigingLand: "QQ", postalCode: "1234" }).success).toBe(false);
  });
});

describe("submitEmployerOnboarding met een Belgische vestiging", () => {
  it("vlaggen uit: dezelfde melding als een ongeldige postcode, niets naar OSM, geen vestiging", async () => {
    vlaggen({});
    await expect(submitEmployerOnboarding("u1", "t1", employerOnboardingSchema.parse(be))).rejects.toMatchObject({ status: 422, message: "Gebruik een geldige postcode" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(m.geocodePostcode).not.toHaveBeenCalled();
    expect(m.branchCreate).not.toHaveBeenCalled();
  });

  it("een Nederlandse vestiging gaat zoals altijd via PDOK, ook met de vlaggen aan", async () => {
    vlaggen({ belgie: true, buitenland: true });
    await submitEmployerOnboarding("u1", "t1", employerOnboardingSchema.parse(nl));
    expect(m.geocodePostcode).toHaveBeenCalledWith("1012 AB", "1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(m.branchCreate.mock.calls[0]?.[0].data).toMatchObject({ postalCode: "1012AB", city: "Amsterdam", latitude: 52.37 });
  });

  it("alleen werk-in-belgie aan: een Duitse vestiging gaat niet", async () => {
    vlaggen({ belgie: true });
    await expect(submitEmployerOnboarding("u1", "t1", employerOnboardingSchema.parse({ ...be, vestigingLand: "DE", postalCode: "10115" }))).rejects.toMatchObject({ status: 422, message: "Gebruik een geldige postcode" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(m.branchCreate).not.toHaveBeenCalled();
  });

  it("België buiten Vlaanderen: de melding over Vlaanderen, niets naar OSM", async () => {
    vlaggen({ belgie: true });
    await expect(submitEmployerOnboarding("u1", "t1", employerOnboardingSchema.parse({ ...be, postalCode: "1000" }))).rejects.toMatchObject({ status: 422, details: { reden: "buitenland-vlaanderen" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("vlag aan: het adres via OpenStreetMap, bewaard met BE- voor de postcode", async () => {
    vlaggen({ belgie: true });
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify([{ lat: "51.2177", lon: "4.4069", place_rank: 30, address: { road: "Meir", city: "Antwerpen", postcode: "2000", country_code: "be" } }]), { status: 200 }),
    );
    await submitEmployerOnboarding("u1", "t1", employerOnboardingSchema.parse(be));
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("street")).toBe("Meir 1");
    expect(url.searchParams.get("postalcode")).toBe("2000");
    expect(m.geocodePostcode).not.toHaveBeenCalled();
    expect(m.branchCreate.mock.calls[0]?.[0].data).toMatchObject({ postalCode: "BE-2000", city: "Antwerpen", latitude: 51.2177, longitude: 4.4069 });
  });

  it("vlag aan en OSM vindt niets: een eerlijke fout, geen vestiging in het midden van Nederland", async () => {
    vlaggen({ belgie: true });
    fetchMock.mockImplementation(async () => new Response("[]", { status: 200 }));
    await expect(submitEmployerOnboarding("u1", "t1", employerOnboardingSchema.parse(be))).rejects.toMatchObject({ status: 422, details: { reden: "buitenland-niet-gevonden" } });
    expect(m.branchCreate).not.toHaveBeenCalled();
  });
});
