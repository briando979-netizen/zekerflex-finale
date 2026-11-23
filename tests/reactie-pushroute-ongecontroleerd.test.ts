import { beforeEach, describe, expect, it, vi } from "vitest";

// Een werker die een aanbod uit een pushbericht accepteert (recordOfferResponse, via POST /api/shifts/<id>/offer) bij een bedrijf dat
// nog niet is gecontroleerd (23 nov 2026): de reactie gaat niet verloren. De match gaat op VIEWED, er komt een gewone reactie bij het
// bedrijf, en alleen het inplannen (de ShiftAssignment) wacht op de poort. Eerder gaf dit een 412 en werd er niets vastgelegd.

const h = vi.hoisted(() => ({
  verified: false,
  matchStatus: "NOTIFIED",
  assignments: [] as unknown[],
  matchUpdates: [] as unknown[],
  timesheets: [] as unknown[],
  kv: new Map<string, unknown>(),
  taken: vi.fn(),
}));

const SHIFT = {
  id: "shift1",
  positions: 2,
  branchId: "b1",
  title: "Bediening",
  startsAt: new Date("2026-12-01T09:00:00Z"),
  endsAt: new Date("2026-12-01T17:00:00Z"),
  breakMinutes: 30,
  hourlyRateCents: 3000,
  branch: { tenantId: "t1" },
};

function maakTx() {
  return {
    $executeRaw: async () => 1,
    shiftMatch: {
      findUnique: async () => ({ id: "m1", status: h.matchStatus, expiresAt: null }),
      update: async (a: unknown) => void h.matchUpdates.push(a),
      updateMany: async () => ({ count: 0 }),
    },
    shift: { findUniqueOrThrow: async () => SHIFT, update: async () => ({}) },
    shiftAssignment: {
      findFirst: async () => null,
      count: async () => h.assignments.length,
      create: async () => {
        const rij = { id: `a${h.assignments.length + 1}` };
        h.assignments.push(rij);
        return rij;
      },
    },
    timesheet: { create: async (a: unknown) => void h.timesheets.push(a) },
    freelancerProfile: { findUnique: async () => ({ userId: "u1" }) },
  };
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(maakTx()),
    freelancerProfile: { findUnique: async (a: { where: { id?: string; userId?: string } }) => (a.where.userId ? { id: "fp1" } : { userId: "u1" }) },
    shift: { findUnique: async () => ({ title: "Bediening", hourlyRateCents: 3000, branch: { name: "Café Zuid" } }) },
    user: { findUnique: async () => ({ fullName: "Sanne de Vries" }) },
    shiftMatch: { updateMany: async () => ({ count: 0 }) },
  },
}));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
  kvListValues: async (prefix: string) => [...h.kv].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v),
}));
vi.mock("@/lib/company/verified", () => ({ isTenantVerified: async () => h.verified }));
vi.mock("@/lib/redis", () => ({ redis: { del: async () => 1, hset: async () => 1 }, acquireLock: async () => async () => undefined }));
vi.mock("@/lib/engagement/events", () => ({ recordEngagement: () => undefined }));
vi.mock("@/lib/agreements/model-agreement", () => ({ ensureModelAgreement: async () => ({}) }));
vi.mock("@/lib/webhooks/dispatcher", () => ({ dispatchWebhook: async () => undefined }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}));
// de route
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: "u1", fullName: "Sanne de Vries" }), requireRole: () => undefined }));
vi.mock("@/lib/onboarding/werker-poort-server", () => ({ eisOnboardingVoorReageren: async () => undefined }));
vi.mock("@/lib/werkrecht/store", () => ({ eisWerkrecht: async () => undefined }));
vi.mock("@/lib/fiscal/eligibility", () => ({ eisUitzendGegevens: async () => undefined }));
vi.mock("@/lib/uitzend/partners", () => ({ isUitzendPartnerKlus: async () => false }));
vi.mock("@/lib/notifications/employer-push", () => ({ pushShiftTaken: (...a: unknown[]) => h.taken(...a) }));
vi.mock("@/lib/run-after", () => ({ runAfter: (fn: () => unknown) => void fn() }));

const { recordOfferResponse } = await import("@/lib/notifications/dispatcher");
const { listCounterOffers, createCounterOffer } = await import("@/lib/offers/store");
const { POST } = await import("@/app/api/shifts/[shiftId]/offer/route");
const { REACTIE_KLAAR_TEKST } = await import("@/lib/matching/reactie");

beforeEach(() => {
  vi.clearAllMocks();
  h.verified = false;
  h.matchStatus = "NOTIFIED";
  h.assignments.length = 0;
  h.matchUpdates.length = 0;
  h.timesheets.length = 0;
  h.kv.clear();
});

describe("recordOfferResponse bij een bedrijf dat nog niet is gecontroleerd", () => {
  it("legt de reactie vast: match op VIEWED, een gewone reactie bij het bedrijf, en niemand ingepland", async () => {
    const uit = await recordOfferResponse("shift1", "fp1", "ACCEPTED");

    expect(uit).toEqual({ status: "VIEWED", shiftFilled: false, pendingCompanyVerification: true });
    expect(h.matchUpdates).toEqual([{ where: { id: "m1" }, data: { status: "VIEWED", expiresAt: null } }]);
    // alleen het inplannen wacht: geen toewijzing, geen urenbriefje
    expect(h.assignments).toEqual([]);
    expect(h.timesheets).toEqual([]);
    const reacties = await listCounterOffers();
    expect(reacties).toHaveLength(1);
    expect(reacties[0]).toMatchObject({ userId: "u1", shiftId: "shift1", freelancerName: "Sanne de Vries", status: "pending", listedRateCents: 3000, proposedRateCents: 3000, branch: "Café Zuid" });
  });

  it("nogmaals accepteren maakt geen tweede reactie, en een reactie met een eigen tarief blijft zoals ze is", async () => {
    await createCounterOffer({ userId: "u1", freelancerName: "Sanne de Vries", shiftId: "shift1", shiftTitle: "Bediening", branch: "Café Zuid", listedRateCents: 3000, proposedRateCents: 3500, note: "Ik kan om 8 uur" });
    await recordOfferResponse("shift1", "fp1", "ACCEPTED");
    await recordOfferResponse("shift1", "fp1", "ACCEPTED");
    const reacties = await listCounterOffers();
    expect(reacties).toHaveLength(1);
    expect(reacties[0]).toMatchObject({ proposedRateCents: 3500, note: "Ik kan om 8 uur", status: "pending" });
  });

  it("een aanbod dat niet meer open staat weigert net als anders, en legt niets vast", async () => {
    h.matchStatus = "EXPIRED";
    await expect(recordOfferResponse("shift1", "fp1", "ACCEPTED")).rejects.toMatchObject({ status: 409 });
    expect(await listCounterOffers()).toEqual([]);
  });

  it("een gecontroleerd bedrijf: de werker wordt gewoon ingepland en er komt geen wachtende reactie", async () => {
    h.verified = true;
    const uit = await recordOfferResponse("shift1", "fp1", "ACCEPTED");
    expect(uit).toEqual({ status: "ACCEPTED", shiftFilled: false });
    expect(h.assignments).toHaveLength(1);
    expect(await listCounterOffers()).toEqual([]);
  });
});

describe("POST /api/shifts/<id>/offer", () => {
  const antwoord = async () => {
    const req = new Request("http://localhost/api/shifts/shift1/offer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "ACCEPTED" }),
    });
    return POST(req, { params: Promise.resolve({ shiftId: "shift1" }) });
  };

  it("geen 412 meer: 200 met een eerlijke tekst, de reactie staat vast en het bedrijf krijgt geen 'neemt je klus'", async () => {
    const res = await antwoord();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "VIEWED", pendingCompanyVerification: true, bericht: REACTIE_KLAAR_TEKST });
    expect(REACTIE_KLAAR_TEKST).toBe("Je reactie staat klaar; het bedrijf ziet hem en bevestigt.");
    expect(await listCounterOffers()).toHaveLength(1);
    expect(h.taken).not.toHaveBeenCalled();
  });

  it("een gecontroleerd bedrijf: ingepland, en het bedrijf hoort het", async () => {
    h.verified = true;
    const res = await antwoord();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ACCEPTED", shiftFilled: false });
    expect(h.taken).toHaveBeenCalledTimes(1);
  });
});
