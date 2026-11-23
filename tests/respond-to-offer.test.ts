import { afterEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "@/lib/auth";
import { AppError } from "@/lib/errors";

// Accepting a tegenbod used to only flip the offer's status and tell the
// freelancer "you can now claim the shift" in chat — but there is no button
// anywhere for them to do that once they've already reacted, so the shift
// silently vanished from "Mijn klussen" instead of ever becoming "uitgekozen".
// Accepting must finalise the real assignment itself.

const requirePrincipal = vi.fn();
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requirePrincipal: () => requirePrincipal() };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const shiftFindFirst = vi.fn();
const shiftUpdate = vi.fn();
const overlapRow = vi.fn(async (): Promise<unknown> => null);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shift: { findFirst: (...a: unknown[]) => shiftFindFirst(...a), update: (...a: unknown[]) => shiftUpdate(...a) },
    freelancerProfile: { findUnique: async () => ({ id: "fp1" }) },
    shiftAssignment: { findFirst: () => overlapRow() },
  },
}));

const resolveEmployerScope = vi.fn();
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: (...a: unknown[]) => resolveEmployerScope(...a) }));

const listCounterOffers = vi.fn();
const setOfferStatus = vi.fn();
vi.mock("@/lib/offers/store", () => ({
  listCounterOffers: (...a: unknown[]) => listCounterOffers(...a),
  setOfferStatus: (...a: unknown[]) => setOfferStatus(...a),
}));

const applyToShift = vi.fn();
vi.mock("@/lib/matching/apply", () => ({ applyToShift: (...a: unknown[]) => applyToShift(...a) }));

vi.mock("@/lib/messaging/store", () => ({
  ensureDirectThread: vi.fn().mockResolvedValue({ id: "thread1" }),
  postMessage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

// reservebank (lib/reservebank): een gekozen of afgewezen reactie gaat van de bank af
const haalVanReservebank = vi.fn().mockResolvedValue(undefined);
const zetOpReservebank = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/reservebank/store", () => ({
  haalVanReservebank: (...a: unknown[]) => haalVanReservebank(...a),
  zetOpReservebank: (...a: unknown[]) => zetOpReservebank(...a),
}));

// de poort (lib/company/verified.ts): standaard een gecontroleerd bedrijf; een nieuw bedrijf zet dit op false
const bedrijfGecontroleerd = vi.hoisted(() => ({ waarde: true }));
vi.mock("@/lib/company/verified", () => ({ isTenantVerified: async () => bedrijfGecontroleerd.waarde }));

import { respondToOfferAction, zetReserveAction } from "@/app/werkgever/diensten/[shiftId]/actions";

function manager(): Principal {
  return {
    userId: "mgr1",
    email: "manager@zekerflex.com",
    fullName: "Manager",
    emailVerifiedAt: new Date(),
    grants: [{ role: "LOCAL_MANAGER", organizationId: "org1", locationIds: ["branch1"] }],
    memberships: [],
    managedBranchIds: ["branch1"],
  } as Principal;
}

const offer = {
  id: "offer1",
  at: new Date().toISOString(),
  userId: "freelancer1",
  freelancerName: "Jan",
  shiftId: "shift1",
  shiftTitle: "Receptiemedewerker",
  branch: "Branch 1",
  listedRateCents: 1500,
  proposedRateCents: 1800,
  note: "",
  status: "pending" as const,
  respondedAt: null,
};

const shift = {
  id: "shift1",
  title: "Receptiemedewerker",
  hourlyRateCents: 1500,
  status: "OPEN",
  startsAt: new Date("2026-11-04T08:00:00Z"),
  endsAt: new Date("2026-11-04T16:00:00Z"),
  branch: { id: "branch1", name: "Branch 1", tenantId: "org1" },
};

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  bedrijfGecontroleerd.waarde = true;
});

describe("respondToOfferAction: een bedrijf dat nog niet is gecontroleerd (23 nov 2026)", () => {
  const opzet = () => {
    requirePrincipal.mockResolvedValue(manager());
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["org1"], branchIds: ["branch1"] });
    listCounterOffers.mockResolvedValue([offer]);
    shiftFindFirst.mockResolvedValue(shift);
    bedrijfGecontroleerd.waarde = false;
  };

  it("accepteren plant niemand in, laat de reactie openstaan en geeft de herkenbare code terug", async () => {
    opzet();

    const result = await respondToOfferAction("offer1", "accepted");

    expect(result).toMatchObject({ ok: false, code: "BEDRIJF_NOG_NIET_GECONTROLEERD" });
    expect(result.message).toContain("Je klus staat live");
    // niets veranderd: geen tarief, geen toewijzing, de reactie blijft pending (en een reserve blijft op de bank)
    expect(shiftUpdate).not.toHaveBeenCalled();
    expect(applyToShift).not.toHaveBeenCalled();
    expect(setOfferStatus).not.toHaveBeenCalled();
    expect(haalVanReservebank).not.toHaveBeenCalled();
  });

  it("afwijzen mag wel: dat plant niemand in", async () => {
    opzet();
    setOfferStatus.mockResolvedValue({ ...offer, status: "declined" });

    const result = await respondToOfferAction("offer1", "declined");

    expect(result.ok).toBe(true);
    expect(setOfferStatus).toHaveBeenCalledWith("offer1", "declined");
  });
});

describe("respondToOfferAction", () => {
  it("accepts an offer by finalising a real assignment, not just flipping a status", async () => {
    requirePrincipal.mockResolvedValue(manager());
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["org1"], branchIds: ["branch1"] });
    listCounterOffers.mockResolvedValue([offer]);
    shiftFindFirst.mockResolvedValue(shift);
    shiftUpdate.mockResolvedValue({});
    applyToShift.mockResolvedValue({ status: "ACCEPTED", shiftFilled: false });
    setOfferStatus.mockResolvedValue({ ...offer, status: "accepted" });

    const result = await respondToOfferAction("offer1", "accepted");

    expect(applyToShift).toHaveBeenCalledWith("freelancer1", "shift1");
    expect(setOfferStatus).toHaveBeenCalledWith("offer1", "accepted");
    expect(result).toEqual({ ok: true, message: expect.stringContaining("toegewezen") });
    // een reserve die zo wordt ingepland staat daarna niet meer op de reservebank
    expect(haalVanReservebank).toHaveBeenCalledWith({ id: "shift1", tenantId: "org1" }, "offer1");
  });

  it("leaves the offer pending when the assignment can't actually be finalised", async () => {
    requirePrincipal.mockResolvedValue(manager());
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["org1"], branchIds: ["branch1"] });
    listCounterOffers.mockResolvedValue([offer]);
    shiftFindFirst.mockResolvedValue(shift);
    shiftUpdate.mockResolvedValue({});
    applyToShift.mockRejectedValue(AppError.conflict("Deze dienst is al vol."));

    const result = await respondToOfferAction("offer1", "accepted");

    expect(setOfferStatus).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Deze dienst is al vol.");
    // niet ingepland: dan blijft een reserve gewoon op de bank
    expect(haalVanReservebank).not.toHaveBeenCalled();
  });

  it("refuses before changing the rate when the freelancer is booked elsewhere at that time", async () => {
    requirePrincipal.mockResolvedValue(manager());
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["org1"], branchIds: ["branch1"] });
    listCounterOffers.mockResolvedValue([offer]);
    shiftFindFirst.mockResolvedValue(shift);
    overlapRow.mockResolvedValueOnce({
      shift: {
        id: "other1",
        title: "Afwasser",
        startsAt: new Date("2026-11-04T10:00:00Z"),
        endsAt: new Date("2026-11-04T14:00:00Z"),
        branch: { name: "Concurrent BV" },
      },
    });

    const result = await respondToOfferAction("offer1", "accepted");

    expect(result.ok).toBe(false);
    expect(result.message).toContain("al ingepland");
    expect(result.message).toContain("11:00–15:00");
    // de andere klant blijft onbekend voor deze werkgever
    expect(result.message).not.toContain("Concurrent BV");
    expect(result.message).not.toContain("Afwasser");
    expect(shiftUpdate).not.toHaveBeenCalled();
    expect(applyToShift).not.toHaveBeenCalled();
    expect(setOfferStatus).not.toHaveBeenCalled();
  });

  // Punt 3 van de review van de proefklussen (21 nov 2026): bij de derde acceptatie zag de werkgever de zin voor de werker
  // ("Je hebt je eerste 2 klussen aangenomen… Vul ze in bij Verificatie"). Nu een eigen, neutrale zin uit het woordenboek.
  it("a worker who still misses details: the employer reads his own neutral sentence, never the worker's", async () => {
    const { werkerNietKlaarFout } = await import("@/lib/fiscal/werker-niet-klaar");
    const { nl } = await import("@/lib/i18n/dictionaries");
    const { en } = await import("@/lib/i18n/dictionary-en");
    requirePrincipal.mockResolvedValue(manager());
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["org1"], branchIds: ["branch1"] });
    listCounterOffers.mockResolvedValue([offer]);
    shiftFindFirst.mockResolvedValue(shift);
    shiftUpdate.mockResolvedValue({});
    const werkerZin =
      "Je hebt je eerste 2 klussen aangenomen. Voor de volgende is een geldig KVK- of btw-nummer (of de KOR) en je rekeningnummer nodig. Vul ze in bij Verificatie.";
    applyToShift.mockRejectedValue(werkerNietKlaarFout(werkerZin, "elig.proefOp"));

    const result = await respondToOfferAction("offer1", "accepted");

    expect(result.ok).toBe(false);
    expect(result.message).toBe(nl.kandidaatKaart.werkerNietKlaar);
    expect(result.message).not.toContain("Verificatie");
    expect(result.message).not.toMatch(/\bJe hebt\b/);
    // de reactie blijft open: zodra de kracht alles heeft ingevuld, kan de werkgever hem alsnog accepteren
    expect(setOfferStatus).not.toHaveBeenCalled();
    // ook in het Engels (de werkgeversapp is NL/EN), en zonder belofte van een bericht dat niet gaat
    expect(en.kandidaatKaart.werkerNietKlaar).not.toBe(nl.kandidaatKaart.werkerNietKlaar);
    expect(nl.kandidaatKaart.werkerNietKlaar).not.toMatch(/laten weten|bericht gestuurd/);
  });

  it("declines an offer without touching the assignment path", async () => {
    requirePrincipal.mockResolvedValue(manager());
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["org1"], branchIds: ["branch1"] });
    listCounterOffers.mockResolvedValue([offer]);
    shiftFindFirst.mockResolvedValue(shift);
    setOfferStatus.mockResolvedValue({ ...offer, status: "declined" });

    const result = await respondToOfferAction("offer1", "declined");

    expect(applyToShift).not.toHaveBeenCalled();
    expect(shiftUpdate).not.toHaveBeenCalled();
    expect(setOfferStatus).toHaveBeenCalledWith("offer1", "declined");
    expect(result.ok).toBe(true);
  });

  it("calls a reaction at the listed rate a 'reactie', not a 'tegenbod'", async () => {
    const plainReaction = { ...offer, listedRateCents: offer.proposedRateCents };
    requirePrincipal.mockResolvedValue(manager());
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["org1"], branchIds: ["branch1"] });
    listCounterOffers.mockResolvedValue([plainReaction]);
    shiftFindFirst.mockResolvedValue(shift);
    shiftUpdate.mockResolvedValue({});
    applyToShift.mockResolvedValue({ status: "ACCEPTED", shiftFilled: false });
    setOfferStatus.mockResolvedValue({ ...plainReaction, status: "accepted" });

    const result = await respondToOfferAction("offer1", "accepted");

    expect(result.message.toLowerCase()).not.toContain("tegenbod");
    expect(result.message).toContain("Reactie");
  });
});

describe("zetReserveAction (reservebank)", () => {
  // een dag vóór de klus (4 nov 09:00 Nederlandse tijd)
  const voorDeStart = () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T12:00:00+01:00"));
  };
  const opzet = () => {
    requirePrincipal.mockResolvedValue(manager());
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["org1"], branchIds: ["branch1"] });
    listCounterOffers.mockResolvedValue([offer]);
    shiftFindFirst.mockResolvedValue(shift);
  };

  it("zet een open reactie op de reservebank zonder hem af te wijzen", async () => {
    voorDeStart();
    opzet();

    const result = await zetReserveAction("offer1", true);

    expect(result.ok).toBe(true);
    expect(zetOpReservebank).toHaveBeenCalledWith({ id: "shift1", tenantId: "org1" }, "offer1");
    expect(setOfferStatus).not.toHaveBeenCalled();
    expect(applyToShift).not.toHaveBeenCalled();
  });

  it("haalt hem er ook weer af", async () => {
    voorDeStart();
    opzet();

    const result = await zetReserveAction("offer1", false);

    expect(result.ok).toBe(true);
    expect(haalVanReservebank).toHaveBeenCalledWith({ id: "shift1", tenantId: "org1" }, "offer1");
  });

  it("het beheer van ZekerFlex mag de bank zien, niet aanpassen", async () => {
    voorDeStart();
    opzet();
    requirePrincipal.mockResolvedValue({
      ...manager(),
      grants: [{ role: "PLATFORM_ADMIN", organizationId: "zekerflex", locationIds: [] }],
      managedBranchIds: [],
    });
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["org1"], branchIds: null });

    const result = await zetReserveAction("offer1", true);

    expect(result.ok).toBe(false);
    expect(zetOpReservebank).not.toHaveBeenCalled();
  });

  it("na de start telt de reservebank niet meer", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T09:30:00+01:00"));
    opzet();

    const result = await zetReserveAction("offer1", true);

    expect(result.ok).toBe(false);
    expect(zetOpReservebank).not.toHaveBeenCalled();
  });

  it("een afgehandelde reactie kan niet op de bank", async () => {
    voorDeStart();
    opzet();
    listCounterOffers.mockResolvedValue([{ ...offer, status: "declined" }]);

    const result = await zetReserveAction("offer1", true);

    expect(result.ok).toBe(false);
    expect(zetOpReservebank).not.toHaveBeenCalled();
  });
});
