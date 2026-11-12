import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  users: [] as Record<string, unknown>[],
  kv: new Map<string, unknown>(),
  mail: vi.fn(async (_x: { subject: string; to: string; text: string }) => ({ delivered: true })),
  code: vi.fn(async () => ({ sent: true })),
  onboarded: false,
  verified: false,
  inControle: false,
  klus: false,
  mist: ["identiteit"] as string[] | null,
  taal: "nl",
  push: vi.fn(async (..._a: unknown[]) => 1),
}));

vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zf.test" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => m.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, v),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findMany: async () => m.users }, shift: { findFirst: async () => (m.klus ? { id: "s1" } : null) } },
}));
vi.mock("@/lib/mail", async (orig) => ({ ...(await orig<typeof import("@/lib/mail")>()), sendMail: m.mail }));
vi.mock("@/lib/auth/email-verify", () => ({ sendVerificationEmail: m.code }));
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: async () => ({ workerKind: "zzp" }) }));
vi.mock("@/lib/onboarding/herinnering-mist", () => ({
  werkerMist: async () => {
    if (m.mist === null) throw new Error("bron stuk");
    return m.mist;
  },
}));
vi.mock("@/lib/i18n/worker-locale", () => ({ userLocale: async () => m.taal }));
vi.mock("@/lib/notifications/localized-push", () => ({ sendLocalizedPush: m.push }));
vi.mock("@/lib/onboarding/employer", () => ({ isEmployerOnboarded: async () => m.onboarded }));
vi.mock("@/lib/company/verified", () => ({
  tenantVerification: async () => ({ verified: m.verified, via: null, inControle: m.inControle }),
}));

import { dueStage, runOnboardingReminders } from "@/lib/onboarding/reminders";

const NOW = new Date("2026-10-20T09:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const user = (over: Record<string, unknown>) => ({
  id: "u1",
  email: "nieuw@test.nl",
  fullName: "Jan Kowalski",
  createdAt: daysAgo(2),
  emailVerifiedAt: daysAgo(2),
  kycStatus: "NOT_STARTED",
  freelancerProfile: null,
  memberships: [{ role: "FREELANCER", tenantId: "org_platform" }],
  ...over,
});

describe("onboarding reminders", () => {
  beforeEach(() => {
    m.kv.clear();
    m.mail.mockClear();
    m.code.mockClear();
    m.onboarded = false;
    m.verified = false;
    m.inControle = false;
    m.klus = false;
    m.mist = ["identiteit"];
    m.taal = "nl";
    m.push.mockClear();
  });

  it("stages: day 1, 3, 7", () => {
    expect([0, 1, 2, 3, 6, 7, 13].map(dueStage)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });

  it("freelancer who never verified gets one 'maak je account af' mail per step, max 3", async () => {
    m.users = [user({ createdAt: daysAgo(10) })];
    for (let i = 0; i < 5; i++) await runOnboardingReminders(NOW);
    expect(m.mail).toHaveBeenCalledTimes(3);
    expect(m.mail.mock.calls[0]![0].subject).toMatch(/bijna klaar/);
    expect(m.mail.mock.calls[2]![0].subject).toMatch(/Laatste herinnering/);
  });

  it("verified freelancer gets nothing", async () => {
    m.users = [user({ kycStatus: "VERIFIED", freelancerProfile: { id: "fp" } })];
    m.mist = [];
    await runOnboardingReminders(NOW);
    expect(m.mail).not.toHaveBeenCalled();
  });

  it("unconfirmed e-mail gets a fresh code mail, not the onboarding mail", async () => {
    m.users = [user({ emailVerifiedAt: null })];
    await runOnboardingReminders(NOW);
    expect(m.code).toHaveBeenCalledTimes(1);
    expect(m.mail).not.toHaveBeenCalled();
  });

  it("company without verified KVK is reminded; a verified one is not", async () => {
    m.users = [user({ memberships: [{ role: "HQ_ADMIN", tenantId: "t1" }] })];
    await runOnboardingReminders(NOW);
    expect(m.mail).toHaveBeenCalledTimes(1);
    expect(m.mail.mock.calls[0]![0]).toMatchObject({ to: "nieuw@test.nl" });

    m.kv.clear();
    m.mail.mockClear();
    m.onboarded = true;
    m.verified = true;
    m.klus = true;
    await runOnboardingReminders(NOW);
    expect(m.mail).not.toHaveBeenCalled();
  });

  it("verified company without a first klus is reminded to place one", async () => {
    m.users = [user({ memberships: [{ role: "HQ_ADMIN", tenantId: "t1" }] })];
    m.onboarded = true;
    m.verified = true;
    await runOnboardingReminders(NOW);
    expect(m.mail).toHaveBeenCalledTimes(1);
    expect(m.mail.mock.calls[0]![0].text).toMatch(/eerste klus/);
  });

  it("company that we are checking by hand gets no reminder (nothing for them to do)", async () => {
    m.users = [user({ memberships: [{ role: "HQ_ADMIN", tenantId: "t1" }] })];
    m.onboarded = true;
    m.inControle = true;
    await runOnboardingReminders(NOW);
    expect(m.mail).not.toHaveBeenCalled();
  });

  it("freelancer: de mail noemt alleen wat er mist (hier alleen de ID-scan)", async () => {
    m.users = [user({ freelancerProfile: { id: "fp" } })];
    await runOnboardingReminders(NOW);
    const tekst = m.mail.mock.calls[0]![0].text;
    expect(tekst).toMatch(/ID-scan/);
    expect(tekst).not.toMatch(/thuisbasis|BSN|profielfoto/);
    expect(tekst).toContain("https://zf.test/dashboard/verificatie");
  });

  it("freelancer: lukt het opzoeken van wat er mist niet, dan gaat de algemene herinnering toch weg", async () => {
    m.mist = null;
    m.users = [user({})];
    await runOnboardingReminders(NOW);
    expect(m.mail).toHaveBeenCalledTimes(1);
    expect(m.mail.mock.calls[0]![0].text).toMatch(/werkvorm al gekozen/);
  });

  it("platform admins are never nudged", async () => {
    m.users = [user({ memberships: [{ role: "PLATFORM_ADMIN", tenantId: "org_platform" }] })];
    await runOnboardingReminders(NOW);
    expect(m.mail).not.toHaveBeenCalled();
  });
});
