import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// "Verder op je telefoon", tweede review (9 nov, H1): of de foto's via de telefoon
// kwamen, beslist de server zelf (het merkteken in lib/kyc/overdracht.ts), niet de
// vlag overdracht=1 die de laptop meestuurt. Wie de vlag weglaat en de foto's los
// instuurt, gaat net zo goed naar een mens. Hier: POST /api/onboarding.
// ---------------------------------------------------------------------------

const submit = vi.fn(async (_i: Record<string, unknown>) => ({ outcome: "in_review", kycStatus: "PENDING", checks: [], summary: "" }));
let merk = { viaTelefoon: false, geweigerd: 0 };
let opgehaald: Record<string, unknown> | null = null;

vi.mock("@/lib/auth", () => ({
  requirePrincipal: async () => ({ userId: "usr_1", email: "jan@werker.test", roles: ["FREELANCER"] }),
  requireRole: () => undefined,
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => undefined }));
vi.mock("@/lib/onboarding/verify", () => ({
  saveFreelancerBase: async () => ({ checks: [] }),
  submitFreelancerOnboarding: (i: Record<string, unknown>) => submit(i),
}));
vi.mock("@/lib/fiscal/iban-bevestiging", () => ({ ibanBevestigingAntwoord: () => null }));
vi.mock("@/lib/kyc/stripe-identity", () => ({ startStripeIdentity: async () => "", stripeIdentityAvailable: async () => false }));
vi.mock("@/lib/kyc/overdracht", () => ({
  overdrachtMerk: async () => merk,
  overdrachtGegevens: async () =>
    opgehaald ? { soort: "ID_CARD", gegevens: { nummer: "IXA12B3C4", datum: "2034-03-12", naam: "Jan Jansen" } } : null,
  pakOverdracht: async () => opgehaald,
  netwerkVan: (ip: string) => (ip.includes(".") ? ip.split(".").slice(0, 3).join(".") : null),
}));

import { POST } from "@/app/api/onboarding/route";

const foto = (naam: string) => new File([Buffer.from(`foto-${naam}`)], `${naam}.jpg`, { type: "image/jpeg" });

function verzoek(velden: Record<string, string>, metFotos: boolean, ip = "83.84.85.10"): Request {
  const form = new FormData();
  for (const [k, v] of Object.entries({
    postalCode: "1012 AB",
    payoutIban: "NL91ABNA0417164300",
    documentType: "ID_CARD",
    documentNumber: "IXA12B3C4",
    documentExpiry: "2034-03-12",
    nameOnDocument: "Jan Jansen",
    ...velden,
  }))
    form.set(k, v);
  if (metFotos) {
    form.set("documentFront", foto("voor"));
    form.set("documentBack", foto("achter"));
    form.set("selfie", foto("selfie"));
  }
  return new Request("http://localhost/api/onboarding", { method: "POST", body: form, headers: { "x-forwarded-for": ip } });
}

const laatste = () => submit.mock.calls.at(-1)![0];

beforeEach(() => {
  submit.mockClear();
  merk = { viaTelefoon: false, geweigerd: 0 };
  opgehaald = null;
});

describe("POST /api/onboarding en de telefoon (review 2, H1)", () => {
  it("gewoon insturen zonder overdracht: geen tweede toestel", async () => {
    const res = await POST(verzoek({}, true));
    expect(res.status).toBe(200);
    expect(laatste().viaTweedeToestel).toBeUndefined();
    expect(laatste().tweedeToestel).toBeUndefined();
  });

  it("na een overdracht de vlag weglaten en losse foto's sturen: toch een tweede toestel (een mens)", async () => {
    merk = { viaTelefoon: true, geweigerd: 0 };
    const res = await POST(verzoek({}, true));
    expect(res.status).toBe(200);
    expect(laatste().viaTweedeToestel).toBe(true);
    expect(laatste().tweedeToestel).toEqual({ zelfdeNetwerk: null, geweigerd: 0, zonderVlag: true });
  });

  it("een eerdere 'niet mijn account' gaat mee naar de beoordelaar, ook zonder overdracht", async () => {
    merk = { viaTelefoon: false, geweigerd: 2 };
    await POST(verzoek({}, true));
    expect(laatste().viaTweedeToestel).toBeUndefined();
    expect(laatste().tweedeToestel).toEqual({ zelfdeNetwerk: null, geweigerd: 2, zonderVlag: false });
  });

  it("via de telefoon: de foto's van de telefoon en het netwerk van telefoon en laptop vergeleken", async () => {
    merk = { viaTelefoon: true, geweigerd: 0 };
    const f = (n: string) => ({ filename: `${n}.webp`, mimeType: "image/webp", bytes: Buffer.from(`telefoon-${n}`) });
    opgehaald = { soort: "ID_CARD", gegevens: { nummer: "IXA12B3C4", datum: "2034-03-12", naam: "Jan Jansen" }, voor: f("voor"), achter: f("achter"), selfie: f("selfie"), net: "83.84.85" };
    await POST(verzoek({ overdracht: "1" }, false));
    expect(laatste().viaTweedeToestel).toBe(true);
    expect(laatste().tweedeToestel).toEqual({ zelfdeNetwerk: true, geweigerd: 0, zonderVlag: false });
    expect((laatste().files as { front: { bytes: Buffer } }).front.bytes.toString()).toBe("telefoon-voor");

    await POST(verzoek({ overdracht: "1" }, false, "31.20.1.2"));
    expect((laatste().tweedeToestel as { zelfdeNetwerk: boolean }).zelfdeNetwerk).toBe(false);
  });
});
