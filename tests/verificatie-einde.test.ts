import { beforeEach, describe, expect, it, vi } from "vitest";

// /dashboard/verificatie had geen einde (13 nov, gemeld door de eigenaar): een geverifieerde uitzendkracht met alles ingevuld
// bleef in het formulier hangen. profileComplete eiste het IBAN in de fiscale gegevens, terwijl het op het profiel stond; de
// lijst "wat mist er nog" was leeg (die volgt de poort, zonder IBAN). Na "Opslaan": "Bovenaan zie je wat er nog mist", en
// bovenaan stond niets. Twee regels bewaken dat: het IBAN telt op beide plekken, en een leeg formulier geeft het eindscherm.

const findProfile = vi.fn();
const findUser = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: findProfile },
    user: { findUnique: findUser },
    webPushSubscription: { count: async () => 0 },
    shiftAssignment: { findMany: async () => [] },
    timesheet: { count: async () => 0 },
    invoice: { findMany: async () => [] },
    modelAgreement: { findMany: async () => [] },
  },
}));
const kvGet = vi.fn();
vi.mock("@/lib/storage/kv", () => ({ kvGet, kvSet: async () => undefined, kvListEntries: async () => [] }));
vi.mock("@/lib/agreements/uitzend-contract", () => ({ activeUitzendContract: async () => ({ id: "c1" }) }));

const { getFreelancerOverview } = await import("@/lib/dashboard/freelancer");
const { aanmeldingAf } = await import("@/lib/onboarding/gegevens-mist");

const profiel = (payoutIban: string | null) => ({
  id: "p1",
  kvkValid: false,
  vatValid: false,
  payoutIban,
  badgeLevel: "BRONZE",
  reliabilityScore: 1,
  shiftsCompleted: 0,
  homePostalCode: "9641NG",
});

describe("profiel compleet: het IBAN telt op het profiel én in de fiscale gegevens", () => {
  beforeEach(() => {
    findUser.mockResolvedValue({ kycStatus: "VERIFIED", emailVerifiedAt: new Date("2026-11-01T10:00:00+01:00") });
  });

  it("een uitzendkracht met het IBAN alleen op het profiel is compleet", async () => {
    findProfile.mockResolvedValue(profiel("NL00TEST0000000000"));
    kvGet.mockResolvedValue({ workerKind: "uitzendkracht", bsnHash: "hash-test" });
    const o = await getFreelancerOverview("u1");
    expect(o.profileComplete).toBe(true);
    expect(o.onboarding.every((s) => s.done)).toBe(true);
  });

  it("zonder IBAN is alleen thuisbasis en rekeningnummer nog open, niet de fiscale gegevens", async () => {
    findProfile.mockResolvedValue(profiel(null));
    kvGet.mockResolvedValue({ workerKind: "uitzendkracht", bsnHash: "hash-test" });
    const o = await getFreelancerOverview("u2");
    expect(o.profileComplete).toBe(false);
    expect(o.onboarding.filter((s) => !s.done).map((s) => s.id)).toEqual(["thuisbasis"]);
  });
});

describe("aanmeldingAf: wanneer het formulier niets meer te vragen heeft", () => {
  const af = { persoonKlaar: true, woonKlaar: true, idKlaar: true, mist: [] as const };

  it("alles af en niets mist: het eindscherm", () => {
    expect(aanmeldingAf(af)).toBe(true);
  });

  it("nog een stap van het formulier open, of iets dat mist: het formulier", () => {
    expect(aanmeldingAf({ ...af, persoonKlaar: false })).toBe(false);
    expect(aanmeldingAf({ ...af, woonKlaar: false })).toBe(false);
    expect(aanmeldingAf({ ...af, idKlaar: false })).toBe(false);
    expect(aanmeldingAf({ ...af, mist: ["bsn"] })).toBe(false);
  });
});
