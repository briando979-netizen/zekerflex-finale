import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// /api/register (14 nov 2026): dezelfde wachtwoordcontrole als het aanmeldformulier. De route krijgt het oordeel van
// wachtwoordProbleem (lib/auth/password.ts, apart getest in tests/wachtwoord-probleem.test.ts): een reden → 422 met die
// tekst en geen account; null → 201.

const h = vi.hoisted(() => ({ probleem: vi.fn(), register: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/logger", () => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { logger: { ...log, forRequest: () => log, child: () => log } };
});
vi.mock("@/lib/auth/register", () => ({
  registerAccount: (...a: unknown[]) => h.register(...a),
  registerSchema: z.object({
    type: z.enum(["freelancer", "bedrijf"]),
    fullName: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    companyName: z.string().optional(),
  }),
}));
vi.mock("@/lib/auth/password", () => ({ wachtwoordProbleem: (pw: string) => h.probleem(pw) }));
vi.mock("@/lib/auth/email-verify", () => ({ sendVerificationEmail: async () => ({ sent: true, delivered: true, transport: "mailbox" }) }));
vi.mock("@/lib/i18n/aanmeld-taal", () => ({ onthoudAanmeldTaal: async () => undefined }));
vi.mock("@/lib/rewards/referral", () => ({ recordReferral: async () => undefined, REF_COOKIE: "zf_ref" }));
vi.mock("@/lib/security/ip-throttle", () => ({ throttleIp: async () => undefined }));
vi.mock("@/lib/security/captcha", () => ({ verifyCaptcha: async () => true }));
vi.mock("@/lib/mail/test-adres", () => ({ bezorgingMislukt: () => false }));

import { POST } from "@/app/api/register/route";

const post = (body: Record<string, unknown>) =>
  POST(new Request("https://zekerflex.com/api/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const basis = { type: "freelancer", fullName: "Jan Jansen", email: "jan@werker.test" };

beforeEach(() => {
  h.probleem.mockReset().mockResolvedValue(null);
  h.register.mockReset().mockResolvedValue({ userId: "u1", email: basis.email });
});

describe("/api/register controleert het wachtwoord zoals het formulier", () => {
  it("een zwak wachtwoord: 422 met de reden, en geen account", async () => {
    h.probleem.mockResolvedValue("Kies een sterker wachtwoord.");
    const res = await post({ ...basis, password: "wachtwoord123" });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.message).toBe("Kies een sterker wachtwoord.");
    expect(h.probleem).toHaveBeenCalledWith("wachtwoord123");
    expect(h.register).not.toHaveBeenCalled();
  });

  it("een gelekt wachtwoord: 422 met dezelfde tekst als het formulier", async () => {
    h.probleem.mockResolvedValue("Dit wachtwoord staat in bekende datalekken. Kies een ander wachtwoord.");
    const res = await post({ ...basis, password: "Correct-Paard-Batterij-91!" });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { message: string } }).error.message).toBe("Dit wachtwoord staat in bekende datalekken. Kies een ander wachtwoord.");
    expect(h.register).not.toHaveBeenCalled();
  });

  it("een sterk wachtwoord: 201 en het account wordt aangemaakt", async () => {
    const res = await post({ ...basis, password: "Correct-Paard-Batterij-91!" });
    expect(res.status).toBe(201);
    expect(h.register).toHaveBeenCalledOnce();
  });
});
