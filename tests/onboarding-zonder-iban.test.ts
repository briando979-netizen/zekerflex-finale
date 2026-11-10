import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Het rekeningnummer hoort niet meer bij de onboarding: het wordt bij
// "Bankrekening bevestigen" gevraagd. De wallet-route en de documenten-route
// moeten dus zonder `payoutIban` werken, en met een IBAN blijft de oude
// controle (lengte) gelden.
// ---------------------------------------------------------------------------

const submit = vi.fn(async (_i: unknown) => ({ outcome: "verified", summary: "ok", checks: [] }));

vi.mock("@/lib/auth", () => ({
  requirePrincipal: async () => ({ userId: "u1", role: "FREELANCER" }),
  requireRole: () => undefined,
}));
vi.mock("@/lib/onboarding/verify", () => ({
  submitFreelancerOnboardingViaWallet: (i: unknown) => submit(i),
}));
vi.mock("@/lib/geo/thuisbasis", () => ({ geocodeThuisbasis: async () => ({}) }));

import { POST } from "@/app/api/onboarding/wallet/submit/route";

function post(body: Record<string, unknown>): Promise<Response> {
  return POST(new Request("http://app:3000/api/onboarding/wallet/submit", { method: "POST", body: JSON.stringify(body) }));
}

beforeEach(() => submit.mockClear());

describe("POST /api/onboarding/wallet/submit zonder IBAN", () => {
  it("werkt zonder payoutIban en geeft geen IBAN door", async () => {
    const res = await post({ attemptId: "a1", postalCode: "1012 JS", city: "Amsterdam" });
    expect(res.status).toBe(200);
    expect(submit).toHaveBeenCalledTimes(1);
    const arg = submit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.payoutIban).toBeUndefined();
    expect(arg.postalCode).toBe("1012 JS");
  });

  it("geeft een IBAN dat wel wordt meegestuurd gewoon door (de veiligheidscontroles zitten in verify.ts)", async () => {
    const res = await post({ attemptId: "a1", postalCode: "1012 JS", payoutIban: "NL91ABNA0417164300" });
    expect(res.status).toBe(200);
    expect((submit.mock.calls[0]?.[0] as Record<string, unknown>).payoutIban).toBe("NL91ABNA0417164300");
  });

  it("een te kort IBAN wordt nog steeds geweigerd", async () => {
    const res = await post({ attemptId: "a1", postalCode: "1012 JS", payoutIban: "NL91" });
    expect(res.status).toBe(422);
    expect(submit).not.toHaveBeenCalled();
  });

  it("zonder postcode wordt de aanvraag geweigerd: de postcode komt uit het gekozen adres", async () => {
    const res = await post({ attemptId: "a1", postalCode: "" });
    expect(res.status).toBe(422);
    expect(submit).not.toHaveBeenCalled();
  });
});
