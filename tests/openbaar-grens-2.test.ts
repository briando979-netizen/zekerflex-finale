import { afterEach, describe, expect, it, vi } from "vitest";

// Beveiligingsronde 12 nov 2026 (86), groep 2: de accountroutes van het Schwarzwald-voorstel en van rijscholen lezen
// een begrensde body, met een ruime limiet per IP vóór het lezen (ook voor acties die er geen hadden).

const h = vi.hoisted(() => ({ enforceRateLimit: vi.fn(async () => undefined), registreer: vi.fn(), inloggen: vi.fn(), siteRijschool: vi.fn(async () => ({ id: "r1" })) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: h.enforceRateLimit, fixedWindow: vi.fn(async () => ({ ok: true })), privateRateLimitIdentifier: (s: string) => s }));
vi.mock("@/lib/http/request", () => ({ clientIp: () => "198.51.100.4" }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/voorstel/schwarzwald-accounts", () => ({
  eisZelfdeHerkomst: () => undefined,
  bevestigWachtwoord: vi.fn(),
  huidigAccount: vi.fn(async () => null),
  inloggen: h.inloggen,
  registreer: h.registreer,
  uitloggen: vi.fn(),
  wijzigProfiel: vi.fn(),
}));
vi.mock("@/lib/voorstel/schwarzwald-privacy", () => ({ wisGast: vi.fn() }));
vi.mock("@/lib/voorstel/schwarzwald-boekingen", () => ({ annuleerEigen: vi.fn(), boekingenVanAccount: vi.fn(), wijzigEigen: vi.fn(), zoekBoekingOpNummer: vi.fn() }));
vi.mock("@/lib/voorstel/schwarzwald-crm", () => ({ aanvragenVan: vi.fn(), klantkaart: vi.fn(), tijdlijn: vi.fn(), voegItemToe: vi.fn(), wijzigKlantkaart: vi.fn() }));
vi.mock("@/lib/voorstel/schwarzwald-reviews", () => ({ plaatsReview: vi.fn(), reviewsVan: vi.fn() }));
vi.mock("@/lib/rijschool/accounts", () => ({ eisZelfdeHerkomst: () => undefined, inloggen: vi.fn(), uitloggen: vi.fn(), wachtwoordMetUitnodiging: vi.fn() }));
vi.mock("@/lib/rijschool/toegang", () => ({ siteRijschool: h.siteRijschool }));
vi.mock("@/lib/rijschool/store", () => ({ nodigUit: vi.fn() }));

import { POST as schwarzwaldAccount } from "@/app/api/voorstel/schwarzwald/account/route";
import { POST as rijschoolAccount } from "@/app/api/rijschool/site/[slug]/account/route";

const groot = "x".repeat(40_000);
const post = (body: string) => new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body });

afterEach(() => vi.clearAllMocks());

describe("accountroutes", () => {
  it("Schwarzwald: limiet per IP vóór het lezen; een te grote body = 422 zonder dat er iets gebeurt", async () => {
    const res = await schwarzwaldAccount(post(JSON.stringify({ actie: "registreren", naam: groot })));
    expect(res.status).toBe(422);
    expect(h.enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ name: "schwarzwald-account-ip", identifier: "198.51.100.4" }));
    expect(h.registreer).not.toHaveBeenCalled();
    expect(h.inloggen).not.toHaveBeenCalled();
  });

  it("Schwarzwald: boven de limiet geen 403, en de body wordt niet gelezen", async () => {
    const { AppError } = await import("@/lib/errors");
    h.enforceRateLimit.mockRejectedValueOnce(AppError.rateLimited("Te veel verzoeken.", 60));
    const res = await schwarzwaldAccount(post(JSON.stringify({ actie: "inloggen" })));
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(429);
    expect(h.inloggen).not.toHaveBeenCalled();
  });

  it("rijschool: limiet per IP vóór elke actie (ook uitloggen) en een begrensde body", async () => {
    const res = await rijschoolAccount(post(JSON.stringify({ actie: "inloggen", email: groot })), { params: Promise.resolve({ slug: "rijschool-test" }) });
    expect(res.status).toBe(422);
    expect(h.enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ name: "rijschool-account-ip", identifier: "198.51.100.4" }));
  });
});
