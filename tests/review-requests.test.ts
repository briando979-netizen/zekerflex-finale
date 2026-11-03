import { beforeEach, describe, expect, it, vi } from "vitest";

// Google-reviews verzamelen: een bedrijf vraagt zijn eigen klanten om een
// review. Geen gating: elke score krijgt de knop naar Google, en daarnaast kan
// iedereen het bedrijf privé schrijven. Afgemelde klanten krijgen niets.

const store = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => structuredClone(store.get(k) ?? null),
  kvSet: async (k: string, v: unknown) => void store.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void store.delete(k),
  kvListValues: async (prefix: string) => [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { tenant: { findUnique: async () => ({ name: "Bakkerij Jansen" }) } } }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => undefined }));
const verified = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/company/verified", () => ({ isTenantVerified: (...a: unknown[]) => verified(...a) }));
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: async () => ({ tenantIds: ["t-admin-eigen"] }) }));
const sendMail = vi.fn();
vi.mock("@/lib/mail", () => ({
  sendMail: (...a: unknown[]) => sendMail(...a),
  mailShell: (title: string, body: string) => `<h1>${title}</h1>${body}`,
  mailButton: (href: string, label: string) => `<a href="${href}">${label}</a>`,
}));

const shared = await import("@/lib/review-requests/shared");
const s = await import("@/lib/review-requests/store");
const rateRoute = await import("@/app/api/review/[token]/route");
const googleRoute = await import("@/app/api/review/[token]/naar-google/route");
const { isPublicApiRoute } = await import("@/lib/auth/public-routes");
const { isAutomatedKind, mailCategoryForKind } = await import("@/lib/mail/categories");

const owner = { userId: "u1", email: "eigenaar@bakkerij.nl", fullName: "Eigenaar", emailVerifiedAt: new Date(), grants: [{ role: "HQ_ADMIN", organizationId: "t1" }], memberships: [], managedBranchIds: [] } as never;
const settings = { googleUrl: "https://g.page/r/CAbc123/review", feedbackEmail: "info@bakkerij.nl", naam: "Bakkerij Jansen" };

beforeEach(() => {
  store.clear();
  sendMail.mockReset();
  sendMail.mockImplementation(async (m: { to: string }) => (m.to === "afgemeld@klant.nl" ? { id: "x", delivered: false, transport: "mailbox", suppressed: "afgemeld" } : { id: "x", delivered: true, transport: "smtp" }));
  verified.mockResolvedValue(true);
});

const post = (token: string, body: unknown) => rateRoute.POST(new Request(`https://zekerflex.com/api/review/${token}`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ token }) });

describe("de Google-reviewlink", () => {
  it("neemt de vormen die Google uitdeelt, altijd als https", () => {
    expect(shared.normalizeGoogleReviewUrl("g.page/r/CAbc123/review")).toBe("https://g.page/r/CAbc123/review");
    expect(shared.normalizeGoogleReviewUrl("http://search.google.com/local/writereview?placeid=ChIJ123")).toBe("https://search.google.com/local/writereview?placeid=ChIJ123");
    expect(shared.normalizeGoogleReviewUrl("https://maps.app.goo.gl/AbCdEf")).toBe("https://maps.app.goo.gl/AbCdEf");
    expect(shared.normalizeGoogleReviewUrl("https://www.google.nl/maps/place/Bakkerij")).toBe("https://www.google.nl/maps/place/Bakkerij");
  });

  it("weigert alles wat niet echt van Google is", () => {
    for (const bad of ["https://evil.com/review", "https://google.com.evil.com/x", "https://g.page.evil.nl/r", "javascript:alert(1)", "https://user:pw@g.page/r/x", "", "geen link"]) {
      expect(shared.normalizeGoogleReviewUrl(bad)).toBeNull();
    }
  });
});

describe("een klant om een review vragen", () => {
  it("vraagt eerst de instellingen, en controleert die", async () => {
    await expect(s.sendReviewRequest("t1", { naam: "Piet", email: "piet@klant.nl" }, owner)).rejects.toThrow(/Zet eerst je Google-reviewlink/);
    await expect(s.saveReviewSettings("t1", { ...settings, googleUrl: "https://evil.com" }, owner)).rejects.toThrow(/geen link naar Google/);
    await expect(s.saveReviewSettings("t1", { ...settings, feedbackEmail: "geen-mail" }, owner)).rejects.toThrow(/geldig e-mailadres/);
    expect((await s.saveReviewSettings("t1", settings, owner)).googleUrl).toBe(settings.googleUrl);
  });

  it("stuurt een afmeldbare mail namens het bedrijf, met antwoorden naar het bedrijf", async () => {
    await s.saveReviewSettings("t1", settings, owner);
    const r = await s.sendReviewRequest("t1", { naam: "Piet Klant", email: "Piet@Klant.nl" }, owner);
    expect(r).toMatchObject({ naam: "Piet Klant", email: "piet@klant.nl", sent: true, rating: null });
    expect(shared.isReviewToken(r.token)).toBe(true);
    const mail = sendMail.mock.calls[0]![0] as { to: string; kind: string; replyTo: string; subject: string; text: string };
    expect(mail).toMatchObject({ to: "piet@klant.nl", kind: "google-review-verzoek", replyTo: "info@bakkerij.nl", subject: "Hoe was je ervaring met Bakkerij Jansen?" });
    expect(mail.text).toContain(`/review/${r.token}`);
    expect(mail.text).toContain("Verstuurd via ZekerFlex namens Bakkerij Jansen");
    expect(mailCategoryForKind("google-review-verzoek")).toBe("reviews"); // afmeldbaar
    expect(isAutomatedKind("google-review-verzoek")).toBe(false); // antwoorden gaan naar het bedrijf
  });

  it("niet dezelfde klant binnen 30 dagen, niet als het bedrijf niet geverifieerd is, en niets naar wie zich afmeldde", async () => {
    await s.saveReviewSettings("t1", settings, owner);
    await s.sendReviewRequest("t1", { naam: "Piet", email: "piet@klant.nl" }, owner);
    await expect(s.sendReviewRequest("t1", { naam: "Piet", email: "PIET@klant.nl" }, owner)).rejects.toThrow(/al om een review gevraagd/);
    const afgemeld = await s.sendReviewRequest("t1", { naam: "Anna", email: "afgemeld@klant.nl" }, owner);
    expect(afgemeld.sent).toBe(false);
    verified.mockResolvedValue(false);
    await expect(s.sendReviewRequest("t1", { naam: "Kees", email: "kees@klant.nl" }, owner)).rejects.toThrow(/zodra je bedrijf geverifieerd is/);
  });
});

describe("de kant van de klant", () => {
  async function request() {
    await s.saveReviewSettings("t1", settings, owner);
    return s.sendReviewRequest("t1", { naam: "Piet", email: "piet@klant.nl" }, owner);
  }

  it("elke score krijgt de Google-knop: geen gating", async () => {
    const r = await request();
    for (const rating of [1, 3, 5]) {
      const res = await post(r.token, { action: "sterren", rating });
      expect(await res.json()).toEqual({ ok: true, rating, google: `/api/review/${r.token}/naar-google` });
    }
    expect((await post(r.token, { action: "sterren", rating: 9 })).status).toBe(422);
    expect((await post("nietbestaand", { action: "sterren", rating: 5 })).status).toBe(404);
  });

  it("de doorstuurlink gaat alleen naar de eigen Google-pagina van het bedrijf, zonder het token mee te sturen", async () => {
    const r = await request();
    const res = await googleRoute.GET(new Request("https://zekerflex.com/x"), { params: Promise.resolve({ token: r.token }) });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(settings.googleUrl);
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect((await s.listReviewRequests("t1"))[0]!.googleAt).not.toBeNull();
  });

  it("een privébericht gaat naar het bedrijf, met antwoorden naar de klant, en maar één keer", async () => {
    const r = await request();
    await post(r.token, { action: "geopend" });
    await post(r.token, { action: "sterren", rating: 2 });
    sendMail.mockClear();
    expect((await post(r.token, { action: "feedback", tekst: "Het brood was koud." })).status).toBe(200);
    expect(sendMail.mock.calls[0]![0]).toMatchObject({ to: "info@bakkerij.nl", replyTo: "piet@klant.nl", kind: "review-feedback", subject: "Feedback van Piet (2 van de 5 sterren)" });
    expect(isAutomatedKind("review-feedback")).toBe(false);
    expect((await post(r.token, { action: "feedback", tekst: "Nog een keer" })).status).toBe(409);
    const saved = (await s.listReviewRequests("t1"))[0]!;
    expect(saved).toMatchObject({ rating: 2, feedback: "Het brood was koud." });
    expect(saved.openedAt).not.toBeNull();
    expect(shared.reviewStats([saved])).toMatchObject({ verstuurd: 1, geopend: 1, beoordeeld: 1, gemiddeld: 2, feedback: 1 });
  });

  it("alleen deze klantroutes zijn openbaar; verwijderen haalt de klantgegevens weg", async () => {
    expect(isPublicApiRoute("/api/review/0123456789abcdef01234567")).toBe(true);
    expect(isPublicApiRoute("/api/review/0123456789abcdef01234567/naar-google")).toBe(true);
    expect(isPublicApiRoute("/api/reviews/company/x")).toBe(false);
    expect(isPublicApiRoute("/api/werkgever/google-reviews")).toBe(false);
    const r = await request();
    await s.deleteReviewRequest("t1", r.token);
    expect(await s.reviewByToken(r.token)).toBeNull();
    expect(await s.listReviewRequests("t1")).toEqual([]);
  });
});
