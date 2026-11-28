import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Een klus plaatsen op een Belgische werklocatie (lib/shifts/create.ts, 28 nov 2026): de Nederlandse ondergrens geldt daar niet,
// wel de Belgische (lib/belgie/lonen.ts: € 10,72, bij een flexi-job in de horeca € 13,04), en de soort contract wordt per klus
// bewaard (lib/belgie/klus.ts). In Nederland blijft het minimum van altijd gelden, ook met het Belgische schema.

const h = vi.hoisted(() => ({ kv: new Map<string, unknown>() }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
  kvGetMany: async () => new Map(),
  kvDelete: async () => undefined,
}));
const resolveEmployerScope = vi.fn();
const branchCreate = vi.fn();
const shiftCreate = vi.fn();
vi.mock("@/lib/company/verified", () => ({ isTenantVerified: async () => true, assertMayPlaceShift: async () => ({ test: false }), UNVERIFIED_ASSIGN_MESSAGE: "x" }));
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: (...a: unknown[]) => resolveEmployerScope(...a) }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/matching/engine", () => ({ runMatchingForShift: vi.fn().mockResolvedValue({ rankedCount: 0 }) }));
vi.mock("@/lib/pools/store", () => ({ listPools: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/company/eerste-klus", () => ({ meldEersteKlusVanNieuwBedrijf: async () => undefined }));
vi.mock("@/lib/worker/follows", () => ({ notifyFollowersOfShifts: async () => undefined }));
vi.mock("@/lib/matching/job-alerts", () => ({ notifyJobAlerts: async () => undefined }));
vi.mock("@/lib/matching/standby", () => ({ isUrgent: () => false, notifyStandby: async () => undefined }));
// de controle van de werklocatie zelf (vlaggen, Vlaanderen) hoort bij lib/geo/vestiging-buitenland.ts en zijn eigen tests
vi.mock("@/lib/geo/vestiging-buitenland", () => ({ controleerWerklocatiePostcode: async (postalCode: string) => postalCode }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    branch: { create: (...a: unknown[]) => branchCreate(...a), findFirst: vi.fn() },
    $transaction: (fn: (tx: unknown) => unknown) => fn({ shift: { create: (...a: unknown[]) => shiftCreate(...a) }, shiftPoolInvite: { createMany: vi.fn() } }),
  },
}));

import { createShift, createShiftSchema, createShiftSchemaBelgie } from "@/lib/shifts/create";

const principal = { userId: "m1", email: "m@bedrijf.test" } as never;
const adres = (postalCode: string) => ({ label: "Meir 1, 2000 Antwerpen", postalCode, city: "Antwerpen", latitude: 51.22, longitude: 4.4 });
const invoer = (postalCode: string, hourlyRateCents: number) =>
  ({ adHocAddress: adres(postalCode), title: "Bediening terras", startsAt: "2026-12-12T11:00", endsAt: "2026-12-12T19:00", hourlyRateCents, breakMinutes: 30, positions: 1, annuleerUren: 24, vaardigheden: [] }) as never;

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-12-01T12:00:00+01:00"));
});
afterAll(() => vi.useRealTimers());
afterEach(() => {
  vi.clearAllMocks();
  h.kv.clear();
});

function bedrijf(postalCode: string) {
  resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
  branchCreate.mockResolvedValue({ id: "b1", name: "Eenmalige locatie — Meir 1", matchingConfig: {}, tenantId: "t1", postalCode });
  shiftCreate.mockResolvedValue({ id: "k1" });
}

describe("de schema's", () => {
  const basis = { branchId: "b1", title: "Bediening terras", startsAt: "2026-12-12T11:00", endsAt: "2026-12-12T19:00" };

  it("Nederland houdt zijn minimum; het Belgische schema laat € 13,00 door en weigert onder € 10,72", () => {
    expect(createShiftSchema.safeParse({ ...basis, hourlyRateCents: 1300 }).success).toBe(false);
    expect(createShiftSchema.safeParse({ ...basis, hourlyRateCents: 1620 }).success).toBe(true);
    expect(createShiftSchemaBelgie.safeParse({ ...basis, hourlyRateCents: 1300 }).success).toBe(true);
    const te = createShiftSchemaBelgie.safeParse({ ...basis, hourlyRateCents: 1000 });
    expect(te.success).toBe(false);
    expect(te.error?.issues[0]?.message).toBe("Het minimum uurtarief is € 10,72");
    expect(createShiftSchema.safeParse({ ...basis, hourlyRateCents: 1000 }).error?.issues[0]?.message).toBe("Het minimum uurtarief is € 16,20");
  });
});

describe("plaatsen in België", () => {
  it("een student onder het GGMMI mag (alleen een waarschuwing), en de soort contract wordt bewaard", async () => {
    bedrijf("BE-2000");
    const r = await createShift(principal, invoer("BE-2000", 1300), { soort: "student", horeca: false });
    expect(r.shiftId).toBe("k1");
    expect(h.kv.get("belgie:klus:k1")).toMatchObject({ soort: "student", horeca: false, bevestiging: null, vinkjes: [] });
  });

  it("een flexi-job in de horeca onder € 13,04 gaat niet uit", async () => {
    bedrijf("BE-2000");
    await expect(createShift(principal, invoer("BE-2000", 1300), { soort: "flexi", horeca: true })).rejects.toThrow("Het minimum uurtarief is € 13,04");
    expect(shiftCreate).not.toHaveBeenCalled();
    bedrijf("BE-2000");
    await createShift(principal, invoer("BE-2000", 1304), { soort: "flexi", horeca: true });
    expect(h.kv.get("belgie:klus:k1")).toMatchObject({ soort: "flexi", horeca: true });
  });

  it("zonder keuze (een andere weg dan het formulier): de Belgische ondergrens, en de soort kiest het bedrijf later", async () => {
    bedrijf("BE-2000");
    await createShift(principal, invoer("BE-2000", 1100));
    expect(h.kv.has("belgie:klus:k1")).toBe(false);
  });
});

describe("plaatsen in Nederland verandert niet", () => {
  it("onder € 16,20 gaat niet uit, ook niet met het Belgische schema of een Belgische keuze", async () => {
    bedrijf("1012JS");
    await expect(createShift(principal, invoer("1012JS", 1300), { soort: "student", horeca: false })).rejects.toThrow("Het minimum uurtarief is € 16,20");
    expect(shiftCreate).not.toHaveBeenCalled();
  });

  it("een gewone klus in Nederland bewaart niets over België", async () => {
    bedrijf("1012JS");
    await createShift(principal, invoer("1012JS", 1700), { soort: "student", horeca: false });
    expect(shiftCreate).toHaveBeenCalled();
    expect(h.kv.has("belgie:klus:k1")).toBe(false);
  });
});
