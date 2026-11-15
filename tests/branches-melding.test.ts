import { beforeEach, describe, expect, it, vi } from "vitest";

// De melding "kies je branches" aan werkers die zich tussen 6 en 9 november aanmeldden en nog niets kozen: eerst een push, anders een mail,
// pas gemarkeerd als het aankwam, nooit naar testadressen, geblokkeerde accounts of wie al koos.

type U = { id: string; email: string; fullName: string; emailVerifiedAt: Date | null; disabledAt: Date | null; createdAt: Date };
const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  gebruikers: [] as U[],
  gekozen: new Set<string>(),
  keuzeStoring: new Set<string>(),
  subs: new Set<string>(),
  pushBereikt: new Map<string, number>(),
  pushTitels: [] as string[],
  mails: [] as { to: string; subject: string; kind: string; text: string }[],
  mailOk: true,
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (h.kv.has(k) ? structuredClone(h.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, structuredClone(v)),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: async () => h.gebruikers },
    webPushSubscription: { findMany: async ({ where }: { where: { userId: { in: string[] } } }) => [...h.subs].filter((id) => where.userId.in.includes(id)).map((userId) => ({ userId })) },
  },
}));
vi.mock("@/lib/worker/branche-store", () => ({
  getBrancheKeuze: async (id: string) => {
    if (h.keuzeStoring.has(id)) throw new Error("kv weg");
    return h.gekozen.has(id) ? { alle: true, branches: [] } : null;
  },
}));
vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zf.test" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/mail", () => ({
  sendMail: async (m: { to: string; subject: string; kind: string; text: string }) => {
    h.mails.push(m);
    return { id: "m", delivered: h.mailOk, transport: "smtp" };
  },
}));
vi.mock("@/lib/mail/taal", () => ({ mailTaalVoorWerker: async (id: string) => (id.startsWith("pl") ? "pl" : "nl") }));
vi.mock("@/lib/notifications/localized-push", () => ({
  sendLocalizedPush: async (ids: string[], build: (t: unknown, l: "nl" | "pl") => { title: string }) => {
    const id = ids[0]!;
    h.pushTitels.push(build({}, id.startsWith("pl") ? "pl" : "nl").title);
    return h.pushBereikt.get(id) ?? 0;
  },
}));

import { AANGEMELD_VANAF, BRANCHES_MELDING_PREFIX, inDoelgroep, meldBranchesKiezen } from "@/lib/onboarding/branches-melding";
import { BRANCHES_MELDING } from "@/lib/onboarding/branches-melding-teksten";
import { branchesMeldingEmailT } from "@/lib/mail/werker/branches-melding";
import { ERASABLE_KV_PREFIXES } from "@/lib/privacy/user-kv";

const BINNEN = new Date("2026-11-07T10:00:00+01:00");
const mk = (id: string, extra: Partial<U> = {}): U => ({ id, email: `${id}@werker.nl`, fullName: `Naam ${id}`, emailVerifiedAt: new Date("2026-11-07T11:00:00+01:00"), disabledAt: null, createdAt: BINNEN, ...extra });

beforeEach(() => {
  h.kv.clear();
  h.gebruikers = [];
  h.gekozen.clear();
  h.keuzeStoring.clear();
  h.subs.clear();
  h.pushBereikt.clear();
  h.pushTitels = [];
  h.mails = [];
  h.mailOk = true;
});

describe("wie erbij hoort", () => {
  it("aangemeld van 6 november tot de stap bestond (10 november), geen testadres, niet geblokkeerd", () => {
    expect(inDoelgroep({ email: "a@werker.nl", createdAt: BINNEN, disabledAt: null })).toBe(true);
    expect(inDoelgroep({ email: "a@werker.nl", createdAt: new Date(AANGEMELD_VANAF - 1), disabledAt: null })).toBe(false);
    expect(inDoelgroep({ email: "a@werker.nl", createdAt: new Date("2026-11-10T00:00:00+01:00"), disabledAt: null })).toBe(false);
    expect(inDoelgroep({ email: "a@werker.test", createdAt: BINNEN, disabledAt: null })).toBe(false);
    expect(inDoelgroep({ email: "a@werker.nl", createdAt: BINNEN, disabledAt: new Date() })).toBe(false);
  });
});

describe("de droge telling en het versturen", () => {
  it("droog: telt per kanaal en verstuurt niets", async () => {
    h.gebruikers = [mk("a1"), mk("a2"), mk("a3", { emailVerifiedAt: null })];
    h.subs.add("a1");
    const t = await meldBranchesKiezen({ verstuur: false });
    expect(t).toMatchObject({ aangemeld: 3, teMelden: 3, perKanaal: { push: 1, mail: 1, geen: 1 }, verstuurd: 0 });
    expect(h.mails).toHaveLength(0);
    expect(h.pushTitels).toHaveLength(0);
    expect(h.kv.size).toBe(0);
  });

  it("wie al koos, een testadres of een geblokkeerd account krijgt niets; een storing bij de keuze ook niet", async () => {
    h.gebruikers = [mk("g1"), mk("t1", { email: "t1@werker.test" }), mk("b1", { disabledAt: new Date() }), mk("s1"), mk("ok1")];
    h.gekozen.add("g1");
    h.keuzeStoring.add("s1");
    const t = await meldBranchesKiezen({ verstuur: true });
    expect(t).toMatchObject({ aangemeld: 5, overgeslagen: 3, alGekozen: 1, teMelden: 1, verstuurdMail: 1 });
    expect(h.mails.map((m) => m.to)).toEqual(["ok1@werker.nl"]);
  });

  it("push eerst; bereikt die niemand, dan de mail; gemarkeerd met kanaal", async () => {
    h.gebruikers = [mk("p1"), mk("p2")];
    h.subs.add("p1");
    h.subs.add("p2");
    h.pushBereikt.set("p1", 2); // p2: abonnement, maar geen apparaat bereikt
    const t = await meldBranchesKiezen({ verstuur: true });
    expect(t).toMatchObject({ verstuurdPush: 1, verstuurdMail: 1, verstuurd: 2, bereikt: 2 });
    expect(h.kv.get(`${BRANCHES_MELDING_PREFIX}p1`)).toMatchObject({ kanaal: "push" });
    expect(h.kv.get(`${BRANCHES_MELDING_PREFIX}p2`)).toMatchObject({ kanaal: "mail" });
  });

  it("per werker één keer: een tweede run meldt niemand opnieuw", async () => {
    h.gebruikers = [mk("a1"), mk("a2")];
    await meldBranchesKiezen({ verstuur: true });
    const tweede = await meldBranchesKiezen({ verstuur: true });
    expect(tweede).toMatchObject({ alGemeld: 2, teMelden: 0, verstuurd: 0 });
    expect(h.mails).toHaveLength(2);
  });

  it("een mail die niet bezorgd wordt, markeert niet (de volgende run probeert opnieuw)", async () => {
    h.gebruikers = [mk("m1")];
    h.mailOk = false;
    const t = await meldBranchesKiezen({ verstuur: true });
    expect(t).toMatchObject({ nietBereikt: 1, verstuurd: 0 });
    expect(h.kv.size).toBe(0);
  });

  it("de taal van de werker: Pools voor wie Pools leest", async () => {
    h.gebruikers = [mk("pl1"), mk("nl1")];
    await meldBranchesKiezen({ verstuur: true });
    expect(h.mails.find((m) => m.to === "pl1@werker.nl")?.subject).toBe(BRANCHES_MELDING.pl.subject);
    expect(h.mails.find((m) => m.to === "nl1@werker.nl")?.subject).toBe("Kies je branches voor klussen die bij je passen");
  });
});

describe("de teksten", () => {
  it("elke taal heeft alle velden, en de mail linkt naar de brancheskeuze met de soort onboarding-reminder", () => {
    for (const [taal, t] of Object.entries(BRANCHES_MELDING)) {
      for (const [veld, waarde] of Object.entries(t)) expect(waarde.trim().length, `${taal}.${veld}`).toBeGreaterThan(3);
      expect(t.hoi).toContain("{naam}");
    }
    const m = branchesMeldingEmailT("Anna de Vries", "https://zf.test/", "nl");
    expect(m.kind).toBe("onboarding-reminder");
    expect(m.text).toContain("Hoi Anna,");
    expect(m.text).toMatch(/https:\/\/zf\.test\/\S+/);
  });

  it("de sleutel per werker staat in de AVG-lijst (export en wissen)", () => {
    expect(ERASABLE_KV_PREFIXES).toContain(BRANCHES_MELDING_PREFIX);
  });
});
