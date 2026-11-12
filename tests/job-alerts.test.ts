import { beforeEach, describe, expect, it, vi } from "vitest";

// Job-alerts werden opgeslagen maar nergens gebruikt. Nu: elk woord van het
// alert moet terugkomen in de klus, de klus staat bovenaan Ontdekken, en bij
// een nieuwe dienst krijgt de werker een push.

const h = vi.hoisted(() => ({
  rows: [] as { key: string; value: unknown }[],
  shifts: [] as unknown[],
  pushes: [] as { ids: string[]; push: { title: string; body: string } }[],
  blocked: false,
  payroll: false,
  talen: new Map<string, string>(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    shift: { findMany: async () => h.shifts },
    $queryRaw: async () => h.rows,
  },
}));
vi.mock("@/lib/notifications/push", () => ({
  sendUserPush: async (ids: string[], push: { title: string; body: string }) => (h.pushes.push({ ids, push }), 1),
}));
vi.mock("@/lib/i18n/worker-locale", () => ({ userLocales: async (ids: string[]) => new Map(ids.map((i) => [i, h.talen.get(i) ?? "nl"])) }));
vi.mock("@/lib/employer/relations", () => ({ isBlockedByAny: async () => h.blocked }));
vi.mock("@/lib/fiscal/store", () => ({
  getFiscal: async () => ({}),
  invoiceModeFor: () => (h.payroll ? "payroll" : "invoice"),
}));

import { alertMatches, alertTokens, notifyJobAlerts } from "@/lib/matching/job-alerts";

// do 5 nov 2026 19:00 NL, bediening in Amsterdam, € 18/u
const shift = { title: "Bediening restaurant", skill: null, city: "Amsterdam", startsAt: new Date("2026-11-05T18:00:00Z"), hourlyRateCents: 1800 };

describe("alertMatches", () => {
  it("vindt elk woord terug in titel, categorie, stad en dagdeel", () => {
    expect(alertTokens("Horeca Amsterdam avond")).toEqual(["horeca", "amsterdam", "avond"]);
    expect(alertMatches({ label: "Horeca Amsterdam avond" }, shift)).toBe(true);
    expect(alertMatches({ label: "horeca donderdag" }, shift)).toBe(true);
  });

  it("niet als één woord ontbreekt, onder het minimumtarief of zonder woorden", () => {
    expect(alertMatches({ label: "Horeca Utrecht" }, shift)).toBe(false);
    expect(alertMatches({ label: "Horeca ochtend" }, shift)).toBe(false);
    expect(alertMatches({ label: "Horeca", minRateCents: 2000 }, shift)).toBe(false);
    expect(alertMatches({ label: " - " }, shift)).toBe(false);
  });

  it("kent het weekend", () => {
    const zat = { ...shift, startsAt: new Date("2026-11-07T18:00:00Z") };
    expect(alertMatches({ label: "weekend horeca" }, zat)).toBe(true);
    expect(alertMatches({ label: "weekend horeca" }, shift)).toBe(false);
  });
});

describe("notifyJobAlerts", () => {
  beforeEach(() => {
    h.pushes.length = 0;
    h.talen.clear();
    h.blocked = false;
    h.payroll = false;
    h.shifts = [
      {
        id: "s1",
        title: "Bediening restaurant",
        startsAt: new Date("2099-11-05T18:00:00Z"),
        hourlyRateCents: 1800,
        viaUitzendbureau: false,
        requiredSkill: null,
        branch: { city: "Amsterdam", tenantId: "t1" },
      },
    ];
    h.rows = [
      { key: "prefs:u1", value: { jobAlerts: [{ id: "a", label: "Horeca Amsterdam", createdAt: "" }] } },
      { key: "prefs:u2", value: { jobAlerts: [{ id: "b", label: "Magazijn", createdAt: "" }] } },
      // alert past, maar het minimumtarief van de werker zelf niet
      { key: "prefs:u3", value: { minHourlyRateCents: 2500, jobAlerts: [{ id: "c", label: "Horeca", createdAt: "" }] } },
    ];
  });

  it("stuurt alleen wie een passend alert heeft en binnen zijn eigen voorkeuren valt", async () => {
    const r = await notifyJobAlerts(["s1"]);
    expect(r.notified).toBe(1);
    expect(h.pushes[0]?.ids).toEqual(["u1"]);
    expect(h.pushes[0]?.push.title).toBe("🔔 Horeca Amsterdam");
    expect(h.pushes[0]?.push.body).toContain("Bediening restaurant");
  });

  it("de melding komt in de app-taal van de werker (WORKER_PUSH via sendLocalizedPush), ook als het alle talen zijn", async () => {
    // do 5 nov 2099 19:00 in Nederland: de dag staat in de taal van de werker
    const dagen: Record<string, string> = {};
    for (const taal of ["nl", "en", "pl", "ro", "uk"]) {
      h.pushes.length = 0;
      h.talen.set("u1", taal);
      await notifyJobAlerts(["s1"]);
      expect(h.pushes, taal).toHaveLength(1);
      dagen[taal] = h.pushes[0]!.push.body;
    }
    // elke taal geeft een eigen tekst (de dag en het uurtarief), en de eigen zoekopdracht blijft de titel
    expect(new Set(Object.values(dagen)).size).toBe(5);
    expect(dagen.pl).toContain("/godz");
    expect(h.pushes[0]!.push.title).toBe("🔔 Horeca Amsterdam");
  });

  it("niet bij een opdrachtgever die de werker blokkeerde, en uitzenddiensten alleen voor uitzendkrachten", async () => {
    h.blocked = true;
    expect((await notifyJobAlerts(["s1"])).notified).toBe(0);
    h.blocked = false;
    (h.shifts[0] as { viaUitzendbureau: boolean }).viaUitzendbureau = true;
    expect((await notifyJobAlerts(["s1"])).notified).toBe(0);
    h.payroll = true;
    expect((await notifyJobAlerts(["s1"])).notified).toBe(1);
  });
});
