import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const m = vi.hoisted(() => ({
  users: [] as Record<string, unknown>[],
  kv: new Map<string, unknown>(),
  mail: vi.fn(async (_x: { subject: string; to: string }) => ({ delivered: true })),
  code: vi.fn(async () => ({ sent: true })),
  disabledAt: null as Date | null,
}));

vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zf.test" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => m.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, v),
  kvGetMany: async (keys: string[]) => new Map(keys.filter((k) => m.kv.has(k)).map((k) => [k, m.kv.get(k)])),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: async () => m.users, findUnique: async () => (m.users[0] ? { ...m.users[0], disabledAt: m.disabledAt } : null) },
    tenant: { findMany: async () => [] },
  },
}));
vi.mock("@/lib/mail", async (orig) => ({ ...(await orig<typeof import("@/lib/mail")>()), sendMail: m.mail }));
vi.mock("@/lib/auth/email-verify", () => ({ sendVerificationEmail: m.code }));
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: async () => ({ workerKind: "zzp" }) }));
vi.mock("@/lib/onboarding/employer", () => ({ isEmployerOnboarded: async () => false }));
vi.mock("@/lib/company/verified", async (orig) => ({ ...(await orig<typeof import("@/lib/company/verified")>()), isTenantVerified: async () => false }));

import {
  WERKER_STAPPEN,
  WERKGEVER_STAPPEN,
  bereikteStappen,
  csvRegel,
  eersteOpenStap,
  isOnboardingAudit,
  isTestAccount,
  leeftijdVan,
  tijdlijn,
  trechter,
  vastStatus,
  type OnboardingRij,
} from "@/lib/admin/onboarding-model";
import { verificatieUitFeiten } from "@/lib/company/verified";
import { herinneringenVerstuurd, stuurHerinneringNu } from "@/lib/onboarding/reminders";
import { onboardingData } from "@/lib/admin/insights/onboarding";

const NOW = new Date("2026-11-09T10:00:00+01:00");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

const rij = (over: Partial<OnboardingRij> = {}): OnboardingRij => ({
  id: "u1",
  naam: "Jan Kowalski",
  email: "jan@voorbeeld.nl",
  doelgroep: "werker",
  rollen: ["FREELANCER"],
  aangemeld: daysAgo(3),
  laatsteInlog: null,
  gehaald: [true, true, false, false, false, false],
  herinneringen: 1,
  tenantId: null,
  tenantNaam: null,
  ...over,
});

describe("afbakening testaccounts", () => {
  const basis = { email: "echt@bedrijf.nl", rollen: ["FREELANCER"], disabledAt: null, tenantNamen: [] as string[] };
  it("echte accounts tellen mee", () => {
    expect(isTestAccount(basis)).toBe(false);
  });
  it.each(["a@b.test", "a@b.example", "a@b.invalid", "a@x.example.com", "a@example.com", "a@zekerflex.com", "a@ZekerFlex.nl", "a@verwijderd.zekerflex.invalid"])("sluit %s uit", (email) => {
    expect(isTestAccount({ ...basis, email })).toBe(true);
  });
  it("sluit geblokkeerde accounts, beheerders, sales en Test-bedrijven uit", () => {
    expect(isTestAccount({ ...basis, disabledAt: NOW })).toBe(true);
    expect(isTestAccount({ ...basis, rollen: ["PLATFORM_ADMIN"] })).toBe(true);
    expect(isTestAccount({ ...basis, rollen: ["SALES"] })).toBe(true);
    expect(isTestAccount({ ...basis, tenantNamen: ["Test bedrijven"] })).toBe(true);
    expect(isTestAccount({ ...basis, tenantNamen: ["Testudo Bouw BV"] })).toBe(false);
  });
});

describe("stapbepaling", () => {
  it("vindt de eerste open stap", () => {
    expect(eersteOpenStap([true, true, false, true])).toBe(2);
    expect(eersteOpenStap([true, true])).toBe(-1);
    expect(bereikteStappen([true, false, true])).toBe(1);
    expect(bereikteStappen([true, true])).toBe(2);
  });
  it("stappenlijsten hebben zes stappen", () => {
    expect(WERKER_STAPPEN).toHaveLength(6);
    expect(WERKGEVER_STAPPEN).toHaveLength(6);
  });
  it("een nieuw account zit nog niet vast, na een dag wel", () => {
    expect(vastStatus(rij({ aangemeld: daysAgo(0.2), gehaald: [true, false, false, false, false, false] }), NOW).vast).toBe(false);
    const st = vastStatus(rij({ gehaald: [true, false, false, false, false, false] }), NOW);
    expect(st.vast).toBe(true);
    expect(st.label).toBe("E-mail nog niet bevestigd");
  });
  it("wie alleen nog de eerste klus mist zit niet vast, wie klaar is ook niet", () => {
    expect(vastStatus(rij({ gehaald: [true, true, true, true, true, false] }), NOW)).toMatchObject({ vast: false, stapKey: "reactie" });
    expect(vastStatus(rij({ gehaald: [true, true, true, true, true, true] }), NOW)).toMatchObject({ vast: false, stap: -1, label: "Alles klaar" });
  });
  it("leeftijdsklassen", () => {
    expect([0.5, 3, 20, 90].map((d) => leeftijdVan(daysAgo(d), NOW))).toEqual(["dag", "week", "maand", "ouder"]);
  });
});

describe("trechter", () => {
  it("telt per stap wie ook alle stappen ervoor haalde, met doorstroom en uitval", () => {
    const rijen = [
      { gehaald: [true, true, true, true, true, true] },
      { gehaald: [true, true, true, true, false, false] },
      { gehaald: [true, true, false, true, true, true] }, // soort mist: telt niet verder dan e-mail
      { gehaald: [true, false, false, false, false, false] },
    ];
    const t = trechter("werker", rijen);
    expect(t.map((s) => s.aantal)).toEqual([4, 3, 2, 2, 1, 1]);
    expect(t[1]).toMatchObject({ vanVorige: 75, vanBegin: 75, uitval: 1 });
    expect(t[4]).toMatchObject({ vanVorige: 50, uitval: 1 });
    expect(t[0]).toMatchObject({ vanVorige: null, uitval: 0 });
  });
  it("lege lijst geeft nullen en geen deling door nul", () => {
    const t = trechter("werkgever", []);
    expect(t.every((s) => s.aantal === 0 && s.vanBegin === 0)).toBe(true);
    expect(t.map((s) => s.label)).toEqual(WERKGEVER_STAPPEN.map((s) => s.label));
  });
});

describe("CSV-regel", () => {
  it("bevat geen e-mailadres, IBAN of BSN", () => {
    const regel = csvRegel(rij({ laatsteInlog: daysAgo(1) }), NOW);
    const alles = Object.values(regel).join("|");
    expect(alles).not.toContain("@");
    expect(Object.keys(regel)).toEqual(expect.arrayContaining(["naam", "soort", "rol", "aangemeld", "laatste", "stap", "herinneringen"]));
    expect(regel.soort).toBe("Werker");
    expect(regel.aangemeld).toBe(daysAgo(3).toISOString());
  });
});

describe("bedrijfsverificatie uit feiten", () => {
  const geen = { platform: false, kvkActief: false, kvkBewijs: false, goedgekeurd: false, ingepland: false };
  it("volgt de regels van de poort", () => {
    expect(verificatieUitFeiten({ ...geen, platform: true })).toMatchObject({ verified: true, via: "platform" });
    expect(verificatieUitFeiten({ ...geen, kvkActief: true, kvkBewijs: true })).toMatchObject({ verified: true, via: "kvk" });
    expect(verificatieUitFeiten({ ...geen, goedgekeurd: true })).toMatchObject({ verified: true, via: "admin" });
    expect(verificatieUitFeiten({ ...geen, ingepland: true })).toMatchObject({ verified: true, via: "history" });
    expect(verificatieUitFeiten({ ...geen, kvkActief: true })).toEqual({ verified: false, via: null, inControle: true });
    expect(verificatieUitFeiten(geen)).toEqual({ verified: false, via: null, inControle: false });
  });
});

describe("tijdlijn", () => {
  it("zet bekende gebeurtenissen op volgorde en laat open stappen onderaan staan", () => {
    const items = tijdlijn({
      aangemeld: daysAgo(5),
      emailBevestigdOp: null,
      laatsteInlog: daysAgo(1),
      profielAangemaakt: null,
      soort: "zzp",
      identiteit: [{ at: daysAgo(2), label: "Zelf-verificatie (foto's), in behandeling", goed: null }],
      herinneringen: { aantal: 2, laatsteOp: daysAgo(3) },
      audit: [
        { at: daysAgo(4), action: "admin.onboarding.verification_mail_resent", summary: "x" },
        { at: daysAgo(5), action: "auth.register", summary: "x" },
        { at: daysAgo(4), action: "iets.anders", summary: "x" },
      ],
    });
    expect(items[0]?.tekst).toBe("Aangemeld");
    expect(items.map((i) => i.key)).toEqual(["aangemeld", "audit-0", "herinneringen", "id-0", "inlog", "soort", "open-email"]);
    expect(items.at(-1)).toMatchObject({ at: null, tone: "warn" });
  });
  it("herkent alleen onboarding-acties in het auditspoor", () => {
    expect(isOnboardingAudit("admin.onboarding.reminder_sent")).toBe(true);
    expect(isOnboardingAudit("constructor")).toBe(false);
  });
});

describe("herinneringen en handmatig versturen", () => {
  const user = (over: Record<string, unknown> = {}) => ({
    id: "u1",
    email: "nieuw@test.nl",
    fullName: "Jan Kowalski",
    emailVerifiedAt: daysAgo(2),
    kycStatus: "NOT_STARTED",
    freelancerProfile: null,
    memberships: [{ role: "FREELANCER", tenantId: "org" }],
    ...over,
  });
  beforeEach(() => {
    m.kv.clear();
    m.mail.mockClear();
    m.code.mockClear();
    m.disabledAt = null;
  });

  it("telt de dagen-planning en de handmatige herinneringen samen", () => {
    expect(herinneringenVerstuurd({ stage: 2, handmatig: 1 })).toBe(3);
    expect(herinneringenVerstuurd(null)).toBe(0);
  });

  it("stuurt één mail, telt hem mee en laat de planning ongemoeid", async () => {
    m.users = [user()];
    m.kv.set("onboarding-reminder:u1", { stage: 1, at: "2026-11-08T09:00:00Z" });
    expect(await stuurHerinneringNu("u1", NOW)).toEqual({ sent: true });
    expect(m.mail).toHaveBeenCalledTimes(1);
    expect(m.kv.get("onboarding-reminder:u1")).toMatchObject({ stage: 1, handmatig: 1 });
  });

  it("onbevestigd adres krijgt de verificatiemail, ook na dag 3", async () => {
    m.users = [user({ emailVerifiedAt: null })];
    m.kv.set("onboarding-reminder:u1", { stage: 3 });
    expect((await stuurHerinneringNu("u1", NOW)).sent).toBe(true);
    expect(m.code).toHaveBeenCalledTimes(1);
    expect(m.mail).not.toHaveBeenCalled();
  });

  it("meldt de wachttijd van de verificatiemail en telt dan niet", async () => {
    m.users = [user({ emailVerifiedAt: null })];
    m.code.mockResolvedValueOnce({ sent: false });
    const r = await stuurHerinneringNu("u1", NOW);
    expect(r.sent).toBe(false);
    expect(m.kv.has("onboarding-reminder:u1")).toBe(false);
  });

  it("stuurt niets naar een klaar account, beheerder of geblokkeerd account", async () => {
    m.users = [user({ kycStatus: "VERIFIED", freelancerProfile: { id: "p" } })];
    expect((await stuurHerinneringNu("u1", NOW)).sent).toBe(false);
    m.users = [user({ memberships: [{ role: "PLATFORM_ADMIN", tenantId: "org" }] })];
    expect((await stuurHerinneringNu("u1", NOW)).sent).toBe(false);
    m.users = [user()];
    m.disabledAt = NOW;
    expect((await stuurHerinneringNu("u1", NOW)).sent).toBe(false);
    expect(m.mail).not.toHaveBeenCalled();
  });
});

describe("onboardingData", () => {
  it("rekent werkers uit de echte velden en laat testaccounts en beheerders weg", async () => {
    const werker = (id: string, email: string, over: Record<string, unknown> = {}) => ({
      id,
      email,
      fullName: id,
      createdAt: daysAgo(4),
      lastLoginAt: null,
      emailVerifiedAt: daysAgo(4),
      kycStatus: "VERIFIED",
      disabledAt: null,
      memberships: [{ role: "FREELANCER", tenantId: "t", tenant: { name: "Platform" } }],
      freelancerProfile: { homePostalCode: "1011AB", payoutIban: "NL00TEST", _count: { assignments: 0, matches: 1 } },
      ...over,
    });
    m.users = [
      werker("w1", "echt@voorbeeld.nl"),
      werker("w2", "test@zekerflex.com"),
      werker("w3", "ander@voorbeeld.nl", { memberships: [{ role: "PLATFORM_ADMIN", tenantId: "t", tenant: { name: "Platform" } }] }),
      werker("w4", "nieuw@voorbeeld.nl", { emailVerifiedAt: null, kycStatus: "NOT_STARTED", freelancerProfile: null }),
    ];
    m.kv.set("fiscal:w1", { workerKind: "zzp", iban: null });
    m.kv.set("onboarding-reminder:w4", { stage: 1, handmatig: 1 });

    const zonder = await onboardingData({ testMeetellen: false });
    expect(zonder.rijen.map((r) => r.id)).toEqual(["w1", "w4"]);
    expect(zonder.uitgesloten).toBe(1);
    expect(zonder.rijen[0]?.gehaald).toEqual([true, true, true, true, true, true]);
    expect(zonder.rijen[1]?.gehaald).toEqual([true, false, false, false, false, false]);
    expect(zonder.rijen[1]?.herinneringen).toBe(2);

    const met = await onboardingData({ testMeetellen: true });
    expect(met.rijen.map((r) => r.id)).toEqual(["w1", "w2", "w4"]);
  });
});

describe("rechten en menu", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  it("de pagina en alle acties zijn strikt voor platformbeheerders", () => {
    expect(read("app/admin/onboarding/page.tsx")).toMatch(/hasRole\(principal, "PLATFORM_ADMIN"\)/);
    for (const route of ["verificatiemail", "email-bevestigen", "herinnering"]) {
      expect(read(`app/api/admin/onboarding/[id]/${route}/route.ts`)).toMatch(/withAdminAccess<[^>]*>\(\["PLATFORM_ADMIN"\]/);
    }
  });
});
