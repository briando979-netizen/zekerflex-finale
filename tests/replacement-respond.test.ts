import { beforeEach, describe, expect, it, vi } from "vitest";

// Een werker biedt aan een klus over te nemen (POST /api/me/replacement/respond).
// Dat volgt dezelfde regel als de matching (lib/matching/geschikt.ts): een klus via
// het uitzendbureau alleen voor een uitzendkracht, een gewone klus voor een zzp'er
// met een geldige inschrijving of een uitzendkracht. Voorheen eiste dit pad een
// KVK, waardoor een uitzendkracht nooit kon overnemen.

const PROFIEL = { id: "fp-1", kvkValid: true, vatValid: true, country: "NL", isBlacklisted: false, matchingBlockedUntil: null, user: { kycStatus: "VERIFIED" } };

const h = vi.hoisted(() => ({
  profiel: null as unknown,
  viaUitzendbureau: false,
  werkvorm: "zzp" as string,
  aanbiedingen: [] as string[],
}));

vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: "u-1", fullName: "Sanne de Vries" }) }));
vi.mock("@/lib/replacements/store", () => ({
  getOpenRequestForShift: async () => ({ userId: "u-orig", startsAt: "2026-11-05T08:00:00.000Z" }),
  addReplacementResponse: async (_shiftId: string, r: { userId: string }) => (h.aanbiedingen.push(r.userId), { responses: [r] }),
  withdrawReplacementResponse: async () => null,
}));
vi.mock("@/lib/shifts/worker-overlap", () => ({ findOverlappingShift: async () => null, overlapMessageSelf: () => "" }));
vi.mock("@/lib/fiscal/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/fiscal/store")>();
  return { ...actual, getFiscal: async () => ({ workerKind: h.werkvorm }) };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: async () => h.profiel },
    shiftAssignment: { findUnique: async () => null },
    shift: {
      findUnique: async () => ({
        startsAt: new Date("2026-11-05T08:00:00Z"),
        endsAt: new Date("2026-11-05T16:00:00Z"),
        viaUitzendbureau: h.viaUitzendbureau,
      }),
    },
  },
}));

import { POST } from "@/app/api/me/replacement/respond/route";

const bied = () => POST(new Request("https://zekerflex.com/api/me/replacement/respond", { method: "POST", body: JSON.stringify({ shiftId: "sh1" }) }));

beforeEach(() => {
  // de dienst begint op 5 nov 2026; zonder vaste klok is hij na die dag "al begonnen"
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
  h.profiel = PROFIEL;
  h.viaUitzendbureau = false;
  h.werkvorm = "zzp";
  h.aanbiedingen.length = 0;
});

describe("POST /api/me/replacement/respond", () => {
  it("een zzp'er met KVK en btw-nummer mag een gewone klus overnemen", async () => {
    const res = await bied();
    expect(res.status).toBe(200);
    expect(h.aanbiedingen).toEqual(["u-1"]);
  });

  it("een uitzendkracht mag een uitzendklus overnemen", async () => {
    h.profiel = { ...PROFIEL, kvkValid: false, vatValid: false };
    h.werkvorm = "uitzendkracht";
    h.viaUitzendbureau = true;
    const res = await bied();
    expect(res.status).toBe(200);
    expect(h.aanbiedingen).toEqual(["u-1"]);
  });

  it("een zzp'er mag geen uitzendklus overnemen", async () => {
    h.viaUitzendbureau = true;
    const res = await bied();
    expect(res.status).toBe(412);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe("Deze klus loopt via het uitzendbureau: alleen een uitzendkracht kan hem overnemen.");
    expect(h.aanbiedingen).toEqual([]);
  });

  it("een Nederlandse zzp'er zonder KVK mag niet overnemen, ook niet met een btw-nummer", async () => {
    h.profiel = { ...PROFIEL, kvkValid: false };
    const res = await bied();
    expect(res.status).toBe(412);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe("Je kunt pas een klus overnemen als je volledig geverifieerd bent.");
    expect(h.aanbiedingen).toEqual([]);
  });

  it("een werker die nog niet geverifieerd is, mag niet overnemen", async () => {
    h.profiel = { ...PROFIEL, user: { kycStatus: "PENDING" } };
    const res = await bied();
    expect(res.status).toBe(412);
    expect(h.aanbiedingen).toEqual([]);
  });
});
