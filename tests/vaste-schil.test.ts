import { afterEach, describe, expect, it, vi } from "vitest";

// Vaste schil (20 nov 2026): een lid van een pool met "direct inplannen" dat reageert tegen het geplaatste tarief,
// staat meteen ingepland via dezelfde weg als een acceptatie door het bedrijf (applyToShift). Alles wat die weg
// weigert (vol, overlap, niet geverifieerd) laat de reactie gewoon openstaan.

const applyToShift = vi.fn();
const setOfferStatus = vi.fn();
const vasteSchilPoolVoor = vi.fn();
const recordAudit = vi.fn().mockResolvedValue(undefined);
const sendUserPush = vi.fn().mockResolvedValue(undefined);
const postMessage = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/matching/apply", () => ({ applyToShift: (...a: unknown[]) => applyToShift(...a) }));
vi.mock("@/lib/offers/store", () => ({ setOfferStatus: (...a: unknown[]) => setOfferStatus(...a) }));
vi.mock("@/lib/pools/store", () => ({ vasteSchilPoolVoor: (...a: unknown[]) => vasteSchilPoolVoor(...a) }));
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));
vi.mock("@/lib/messaging/contacts", () => ({ resolveShiftContact: vi.fn().mockResolvedValue({ userId: "bedrijf1", name: "Bedrijf", branch: "Centrum", shiftTitle: "Bediening" }) }));
vi.mock("@/lib/messaging/store", () => ({ ensureDirectThread: vi.fn().mockResolvedValue({ id: "t1" }), postMessage: (...a: unknown[]) => postMessage(...a) }));
vi.mock("@/lib/notifications/push", () => ({ sendUserPush: (...a: unknown[]) => sendUserPush(...a) }));
vi.mock("@/lib/notifications/worker-push", () => ({ maybeSweepWorkerPushes: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/run-after", () => ({ runAfter: (fn: () => unknown) => void fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { probeerVasteSchil } from "@/lib/pools/vaste-schil";

const offer = { id: "o1", userId: "w1", freelancerName: "Sam", shiftId: "s1", shiftTitle: "Bediening", proposedRateCents: 1700, listedRateCents: 1700 };

afterEach(() => vi.clearAllMocks());

describe("probeerVasteSchil", () => {
  it("een tegenbod met een ander tarief gaat nooit vanzelf", async () => {
    const r = await probeerVasteSchil({ ...offer, proposedRateCents: 1900 }, "t1");
    expect(r.ingepland).toBe(false);
    expect(vasteSchilPoolVoor).not.toHaveBeenCalled();
    expect(applyToShift).not.toHaveBeenCalled();
  });

  it("geen pool met vaste schil voor deze werker: gewone reactie", async () => {
    vasteSchilPoolVoor.mockResolvedValue(null);
    const r = await probeerVasteSchil(offer, "t1");
    expect(r.ingepland).toBe(false);
    expect(vasteSchilPoolVoor).toHaveBeenCalledWith("t1", "w1");
    expect(applyToShift).not.toHaveBeenCalled();
  });

  it("lid van de vaste schil: direct ingepland, reactie geaccepteerd, bedrijf krijgt een push", async () => {
    vasteSchilPoolVoor.mockResolvedValue({ id: "p1", name: "Horeca team A" });
    applyToShift.mockResolvedValue({ status: "ACCEPTED", shiftFilled: false });
    const r = await probeerVasteSchil(offer, "t1");
    expect(r).toEqual({ ingepland: true, poolNaam: "Horeca team A" });
    expect(applyToShift).toHaveBeenCalledWith("w1", "s1");
    expect(setOfferStatus).toHaveBeenCalledWith("o1", "accepted");
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "offer.auto_accepted", targetId: "s1" }));
    expect(postMessage).toHaveBeenCalledWith("t1", "system", expect.stringContaining("vaste schil"), "system");
    expect(sendUserPush).toHaveBeenCalledWith(["bedrijf1"], expect.objectContaining({ title: expect.stringContaining("Direct ingepland") }));
  });

  it("weigert applyToShift (vol, overlap, geblokkeerd), dan blijft de reactie open", async () => {
    vasteSchilPoolVoor.mockResolvedValue({ id: "p1", name: "Horeca team A" });
    applyToShift.mockRejectedValue(new Error("Deze dienst is al vol."));
    const r = await probeerVasteSchil(offer, "t1");
    expect(r.ingepland).toBe(false);
    expect(setOfferStatus).not.toHaveBeenCalled();
    expect(sendUserPush).not.toHaveBeenCalled();
  });

  it("bedrijf nog niet geverifieerd: niemand wordt ingepland, de reactie blijft staan", async () => {
    vasteSchilPoolVoor.mockResolvedValue({ id: "p1", name: "Horeca team A" });
    applyToShift.mockResolvedValue({ status: "VIEWED", shiftFilled: false, pendingCompanyVerification: true });
    const r = await probeerVasteSchil(offer, "t1");
    expect(r.ingepland).toBe(false);
    expect(setOfferStatus).not.toHaveBeenCalled();
  });
});
