import { beforeEach, describe, expect, it, vi } from "vitest";

// Een aanbod aannemen met de knop in de app (POST /api/shifts/<id>/offer) ging langs
// payoutEligibility heen: nu eerst het recht om in Nederland te werken (lib/werkrecht).
// Afslaan mag altijd.

const h = vi.hoisted(() => ({
  werkrechtFout: null as string | null,
  antwoorden: [] as string[],
}));

vi.mock("@/lib/auth", () => ({
  requirePrincipal: async () => ({ userId: "u-1", fullName: "Sanne de Vries" }),
  requireRole: () => undefined,
}));
vi.mock("@/lib/prisma", () => ({ prisma: { freelancerProfile: { findUnique: async () => ({ id: "fp-1" }) } } }));
vi.mock("@/lib/notifications/dispatcher", () => ({
  recordOfferResponse: async (_s: string, _f: string, d: string) => {
    h.antwoorden.push(d);
    return { status: d, shiftFilled: false };
  },
}));
vi.mock("@/lib/notifications/employer-push", () => ({ pushShiftTaken: async () => undefined }));
vi.mock("@/lib/run-after", () => ({ runAfter: () => undefined }));
vi.mock("@/lib/werkrecht/store", () => ({
  eisWerkrecht: async () => {
    if (!h.werkrechtFout) return;
    const { AppError } = await import("@/lib/errors");
    throw AppError.precondition(h.werkrechtFout);
  },
}));

async function antwoord(decision: "ACCEPTED" | "DECLINED") {
  const { POST } = await import("@/app/api/shifts/[shiftId]/offer/route");
  const req = new Request("http://localhost/api/shifts/sh1/offer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision }),
  });
  return POST(req, { params: Promise.resolve({ shiftId: "sh1" }) });
}

describe("POST /api/shifts/<id>/offer en het recht om te werken", () => {
  beforeEach(() => {
    h.werkrechtFout = null;
    h.antwoorden = [];
  });

  it("met recht om te werken: aannemen gaat door", async () => {
    const res = await antwoord("ACCEPTED");
    expect(res.status).toBe(200);
    expect(h.antwoorden).toEqual(["ACCEPTED"]);
  });

  it("zonder: 412 met de reden, en het aanbod blijft onaangeroerd", async () => {
    h.werkrechtFout = "Upload bij Verificatie een document waaruit blijkt dat je in Nederland mag werken.";
    const res = await antwoord("ACCEPTED");
    expect(res.status).toBe(412);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("in Nederland mag werken");
    expect(h.antwoorden).toEqual([]);
  });

  it("afslaan mag altijd, ook zonder", async () => {
    h.werkrechtFout = "x";
    const res = await antwoord("DECLINED");
    expect(res.status).toBe(200);
    expect(h.antwoorden).toEqual(["DECLINED"]);
  });
});
