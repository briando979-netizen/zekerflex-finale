import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Pushes aan werkers gaan in hun eigen app-taal (WORKER_PUSH, vijf talen), niet als losse Nederlandse tekst via sendUserPush:
// mijlpalen, badge, bedrijf geverifieerd, uren invullen, uitbetaling geblokkeerd, welkom bij de slagboom, testmelding,
// chat en bellen. Pushes aan opdrachtgevers blijven Nederlands (sendMixedPush).

const h = vi.hoisted(() => ({
  sent: [] as { userIds: string[]; title: string; body: string }[],
  locales: new Map<string, string>(),
  werkers: [] as string[],
  profielFout: false,
  kv: new Map<string, unknown>(),
  milestones: vi.fn(),
}));

vi.mock("@/lib/notifications/push", () => ({
  sendUserPush: async (userIds: string[], p: { title: string; body: string }) => {
    h.sent.push({ userIds, title: p.title, body: p.body });
    return userIds.length;
  },
}));
vi.mock("@/lib/i18n/worker-locale", () => ({ userLocales: async (ids: string[]) => new Map(ids.map((i) => [i, h.locales.get(i) ?? "nl"])) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: async () => [{ id: "w1" }] },
    freelancerProfile: {
      findMany: async () => {
        if (h.profielFout) throw new Error("db weg");
        return h.werkers.map((userId) => ({ userId }));
      },
    },
  },
}));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/worker/milestones", () => ({
  amsterdamYearQuarter: () => ({ year: 2026, quarter: 4 }),
  getWorkerMilestones: h.milestones,
}));

import { WORKER_PUSH } from "@/lib/i18n/worker-push";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { sendMixedPush } from "@/lib/notifications/localized-push";
import { sweepMilestoneReminders } from "@/lib/worker/milestone-push";

const TALEN = ["nl", "en", "pl", "ro", "uk"] as const;

beforeEach(() => {
  h.sent = [];
  h.locales.clear();
  h.werkers = [];
  h.profielFout = false;
  h.kv.clear();
  h.milestones.mockReset();
});

describe("de nieuwe pushteksten in vijf talen", () => {
  it("elke tekst bestaat, is niet leeg en bevat de ingevulde waarden", () => {
    for (const taal of TALEN) {
      const t = WORKER_PUSH[taal];
      const teksten = [
        t.msBtwTitle, t.msUrenTitle, t.msUrenBody, t.msSpreidingTitle, t.msSpreidingBody("40% bij Acme"), t.msKorTitle,
        t.badge.SILVER.title, t.badge.SILVER.body, t.badge.GOLD.title, t.badge.GOLD.body, t.badge.PLATINUM.title, t.badge.PLATINUM.body,
        t.verifiedTitle, t.verifiedBody("Acme", "Bediening"), t.hoursReminderTitle, t.hoursReminderBody("Bediening", "Café", "09:00"),
        t.payoutIncompleteTitle, t.payoutIncompleteBody("iban"), t.payoutIncompleteBody("dest"), t.payoutIncompleteBody("pending"),
        t.welcomeTitle("Magazijn"), t.welcomeBody("12-AB-34"), t.testTitle, t.testBody,
        t.callTitle("Sam", false), t.callTitle("Sam", true), t.callBody, t.missedTitle("Sam"), t.missedVideoBody, t.missedBody, t.newMessage,
      ];
      for (const x of teksten) {
        expect(x.trim().length, `${taal}: ${x}`).toBeGreaterThan(3);
        expect(x, taal).not.toMatch(/undefined|\{\w+\}/);
      }
      expect(t.msSpreidingBody("40% bij Acme"), taal).toContain("40% bij Acme");
      expect(t.verifiedBody("Acme", "Bediening"), taal).toContain("Acme");
      expect(t.verifiedBody("Acme", "Bediening"), taal).toContain("Bediening");
      expect(t.hoursReminderBody("Bediening", "Café", "09:00"), taal).toContain("09:00");
      expect(t.welcomeBody("12-AB-34"), taal).toContain("12-AB-34");
      expect(t.welcomeTitle("Magazijn"), taal).toContain("Magazijn");
      expect(t.callTitle("Sam", true), taal).toContain("Sam");
      expect(t.missedTitle("Sam"), taal).toContain("Sam");
      // de drie redenen voor een onvolledig profiel klinken verschillend
      expect(new Set([t.payoutIncompleteBody("iban"), t.payoutIncompleteBody("dest"), t.payoutIncompleteBody("pending")]).size, taal).toBe(3);
    }
  });

  it("een andere taal is echt vertaald, niet het Nederlands", () => {
    const nl = WORKER_PUSH.nl;
    for (const taal of ["en", "pl", "ro", "uk"] as const) {
      const t = WORKER_PUSH[taal];
      for (const k of ["msBtwTitle", "msUrenTitle", "verifiedTitle", "hoursReminderTitle", "payoutIncompleteTitle", "testTitle", "newMessage"] as const) {
        expect(t[k], `${taal} ${k}`).not.toBe(nl[k]);
      }
      expect(t.badge.GOLD.title, taal).not.toBe(nl.badge.GOLD.title);
    }
  });
});

describe("mijlpaal-pushes in de taal van de werker", () => {
  const btw = { id: "btw", status: "action", title: "x", headline: "± € 120 te betalen", detail: "Je btw over Q4 …" };

  it("haalt de mijlpalen in de taal van de werker op en stuurt titel en tekst in diezelfde taal", async () => {
    h.locales.set("w1", "pl");
    h.milestones.mockResolvedValue({ milestones: [btw] });
    const r = await sweepMilestoneReminders(new Date("2026-11-12T10:00:00+01:00"));
    expect(r).toEqual({ users: 1, sent: 1 });
    expect(h.milestones.mock.calls[0]![2]).toBe(FREELANCER_DICTS.pl.milestones);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.title).toBe(WORKER_PUSH.pl.msBtwTitle);
    expect(h.sent[0]!.body).toContain("± € 120 te betalen");
  });

  it("zonder opgeslagen taal: Nederlands, en elk signaal maar één keer", async () => {
    h.milestones.mockResolvedValue({ milestones: [btw, { id: "urencriterium", status: "ok", title: "u", headline: "h", detail: "d" }] });
    await sweepMilestoneReminders(new Date("2026-11-12T10:00:00+01:00"));
    expect(h.sent.map((x) => x.title)).toEqual([WORKER_PUSH.nl.msBtwTitle, WORKER_PUSH.nl.msUrenTitle]);
    h.sent = [];
    await sweepMilestoneReminders(new Date("2026-11-12T10:00:00+01:00"));
    expect(h.sent).toHaveLength(0);
    expect(h.milestones.mock.calls[0]![2]).toBe(FREELANCER_DICTS.nl.milestones);
  });
});

describe("sendMixedPush: werkers in hun taal, de rest Nederlands", () => {
  it("een werker krijgt zijn taal en een opdrachtgever het Nederlands", async () => {
    h.werkers = ["w1"];
    h.locales.set("w1", "ro");
    const n = await sendMixedPush(["w1", "e1"], (t) => ({ title: t.newMessage, body: "x", data: {}, ttlSeconds: 60 }));
    expect(n).toBe(2);
    const door = Object.fromEntries(h.sent.map((x) => [x.userIds[0], x.title]));
    expect(door).toEqual({ w1: WORKER_PUSH.ro.newMessage, e1: WORKER_PUSH.nl.newMessage });
  });

  it("lukt het opzoeken van werkers niet, dan gaat alles in het Nederlands en blijft niets weg", async () => {
    h.profielFout = true;
    h.locales.set("w1", "uk");
    const n = await sendMixedPush(["w1", "e1"], (t) => ({ title: t.newMessage, body: "x", data: {}, ttlSeconds: 60 }));
    expect(n).toBe(2);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.userIds.sort()).toEqual(["e1", "w1"]);
    expect(h.sent[0]!.title).toBe(WORKER_PUSH.nl.newMessage);
  });

  it("zonder ontvangers gebeurt er niets", async () => {
    expect(await sendMixedPush([], (t) => ({ title: t.newMessage, body: "", data: {}, ttlSeconds: 1 }))).toBe(0);
    expect(h.sent).toHaveLength(0);
  });
});

describe("geen losse Nederlandse tekst meer in de werker-pushes", () => {
  const ROOT = process.cwd();
  const bron = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
  const gevallen: [string, string[]][] = [
    ["lib/worker/milestone-push.ts", ["Btw-aangifte bijna", "1.225 uur gehaald", "Let op je KOR-grens", "Let op je spreiding"]],
    ["lib/worker/stats-sync.ts", ["Je bent nu Zilver", "Je bent nu Goud", "Je bent nu Platina"]],
    ["lib/company/verified.ts", ["Bedrijf geverifieerd — bevestig je klus"]],
    ["lib/autopilot/actions.ts", ["Vul je uren in"]],
    ["lib/timesheets/approve.ts", ["Vul je gegevens aan om uitbetaald te worden", "er staat nog geen geldig rekeningnummer"]],
    ["lib/locatie/toegang.ts", ["Je kenteken"]],
    ["app/api/me/push/test/route.ts", ["Testmelding van ZekerFlex"]],
    ["lib/messaging/notify.ts", ["belt je", "Gemiste oproep van", "Tik om op te nemen", "Nieuw bericht"]],
  ];
  for (const [bestand, zinnen] of gevallen) {
    it(`${bestand} haalt zijn tekst uit WORKER_PUSH`, () => {
      const src = bron(bestand);
      for (const zin of zinnen) expect(src, zin).not.toContain(zin);
    });
  }
});
