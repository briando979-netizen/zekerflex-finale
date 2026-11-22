import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// De bel per app (15 nov 2026). De eigenaar wil alles apart voor werkers en bedrijven, zoals WhatsApp en WhatsApp Business.
// De bel van het bedrijf had de tabbladen van een werker ("Over je klussen", "Uren & uitbetaling"); wie beide rollen heeft,
// zag er ook "Bevestig je komst" in, en een chat opende in /dashboard. Nu: ?app=werker|werkgever, eigen tabbladen, en de
// bedrijfsmeldingen ook in het Engels. Weggeklikt blijft weggeklikt (de handtekening komt uit de Nederlandse tekst).

const NU = new Date("2026-11-15T10:00:00+01:00");
const uur = (n: number) => new Date(NU.getTime() + n * 3600_000);

const h = vi.hoisted(() => ({ kv: new Map<string, unknown>(), toApprove: 0, shifts: [] as unknown[] }));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
}));
vi.mock("@/lib/auth", () => ({ hasRole: (p: { roles: string[] }, ...r: string[]) => r.some((x) => p.roles.includes(x)) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: async () => ({ id: "f1" }) },
    shiftAssignment: { findMany: async () => [{ id: "a1", shift: { id: "s1", title: "Bediening", startsAt: uur(5), branch: { name: "Grand Café" } } }] },
    timesheet: { findMany: async () => [{ id: "ts1", status: "SUBMITTED", updatedAt: NU }], count: async () => h.toApprove },
    shiftMatch: { findMany: async () => [] },
    shift: { findMany: async () => h.shifts },
    bankAccount: { findUnique: async () => null },
  },
}));
vi.mock("@/lib/prefs/store", () => ({ getPrefs: async () => ({ confirmations: {} }) }));
vi.mock("@/lib/offers/store", () => ({ offersForUser: async () => [], listCounterOffers: async () => [] }));
vi.mock("@/lib/replacements/store", () => ({ listReplacementRequests: async () => [] }));
vi.mock("@/lib/messaging/store", () => ({
  listThreadsForUser: async () => [{ id: "c1", kind: "direct", meta: {}, lastMessage: { text: "Kun je dinsdag?", at: NU.toISOString() } }],
  getMessages: async () => [],
  unreadForUser: () => 1,
}));
vi.mock("@/lib/messaging/contacts", () => ({ isPlatformAdmin: async () => false }));
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: async () => ({ branchIds: null, tenantIds: ["t1"] }) }));
vi.mock("@/lib/bank/notify", () => ({ recentNotes: async () => [] }));
vi.mock("@/lib/offers/verval", () => ({ REACTIE_MARGE_MS: 0 }));
vi.mock("@/lib/app-mode", () => ({ BANK_AAN: false }));

import { getNotifications } from "@/lib/notifications/feed";
import { MELDING_BEDRIJF_EN, MELDING_BEDRIJF_NL, meldingBedrijfVoor } from "@/lib/notifications/bedrijf-teksten";
import { NOTIFICATIONS_BEDRIJF, NOTIFICATIONS_NL } from "@/components/app/notifications-texts";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

// iemand die werker is én een vestiging beheert
const beide = { userId: "u1", roles: ["FREELANCER", "LOCAL_MANAGER"], grants: [] } as never;
const perId = (items: Awaited<ReturnType<typeof getNotifications>>) => Object.fromEntries(items.map((i) => [i.id, i]));
const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
  h.kv.clear();
  h.toApprove = 2;
  h.shifts = [{ id: "s9", title: "Kassa", startsAt: uur(10), positions: 3, _count: { assignments: 1 } }];
});

describe("de bel toont alleen de kant van de app waarin hij hangt", () => {
  it("werker: geen meldingen van het bedrijf, de chat opent in /dashboard", async () => {
    const m = perId(await getNotifications(beide, undefined, { app: "werker" }));
    expect(m["confirm:a1"]).toBeDefined();
    expect(m["ts:ts1"]).toBeDefined();
    expect(Object.keys(m).some((id) => id.startsWith("emp:"))).toBe(false);
    expect(m["chat:c1"]?.href).toBe("/dashboard/berichten");
  });

  it("werkgever: alleen bedrijfsmeldingen, de chat opent in /werkgever", async () => {
    const m = perId(await getNotifications(beide, undefined, { app: "werkgever" }));
    expect(m["confirm:a1"]).toBeUndefined();
    expect(m["ts:ts1"]).toBeUndefined();
    expect(m["emp:approve"]).toMatchObject({ title: "2 urenbriefjes te keuren", group: "geld", href: "/werkgever/uren" });
    expect(m["emp:shift:s9"]).toMatchObject({ title: "Dienst nog niet vol", body: "Kassa: 2 plek(ken) open, start over 10 uur.", group: "klussen" });
    expect(m["chat:c1"]?.href).toBe("/werkgever/berichten");
  });

  it("zonder app (beheer, de oude shell): alles, zoals altijd", async () => {
    const m = perId(await getNotifications(beide));
    expect(m["confirm:a1"]).toBeDefined();
    expect(m["emp:approve"]).toBeDefined();
    expect(m["chat:c1"]?.href).toBe("/dashboard/berichten");
  });
});

describe("de bedrijfsmeldingen in het Engels, met dezelfde handtekening", () => {
  it("Engels in de werkgeversapp: vaste zinnen vertaald, vrije tekst ongemoeid, geen plaatshouder over", async () => {
    h.toApprove = 1;
    const en = perId(await getNotifications(beide, FREELANCER_DICTS.en.meldingTeksten, { app: "werkgever", bedrijf: MELDING_BEDRIJF_EN }));
    expect(en["emp:approve"]).toMatchObject({ title: "1 timesheet to approve", body: "Approve them so your workers' payment can get started." });
    expect(en["emp:shift:s9"]?.body).toBe("Kassa: 2 place(s) open, starts in 10 hours.");
    expect(en["chat:c1"]?.body).toContain("Kun je dinsdag?");
    expect(en["chat:c1"]?.body).not.toContain("nieuw bericht");
    const nl = perId(await getNotifications(beide, undefined, { app: "werkgever" }));
    for (const id of Object.keys(nl)) expect(en[id]?.sig, id).toBe(nl[id]?.sig);
    for (const i of Object.values(en)) expect(`${i.title} ${i.body}`, i.id).not.toMatch(/\{\w+\}|undefined/);
  });

  it("dezelfde sleutels en plaatshouders in beide talen; de taal volgt de app", () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join(",");
    expect(Object.keys(MELDING_BEDRIJF_EN).sort()).toEqual(Object.keys(MELDING_BEDRIJF_NL).sort());
    for (const [k, v] of Object.entries(MELDING_BEDRIJF_NL)) expect(ph(MELDING_BEDRIJF_EN[k as keyof typeof MELDING_BEDRIJF_NL]), k).toBe(ph(v));
    expect(meldingBedrijfVoor("en")).toBe(MELDING_BEDRIJF_EN);
    expect(meldingBedrijfVoor("nl")).toBe(MELDING_BEDRIJF_NL);
  });
});

describe("de tabbladen en de shells", () => {
  it("de bel van het bedrijf heeft eigen tabbladen, in het Nederlands en Engels", () => {
    expect(NOTIFICATIONS_BEDRIJF.nl.groups).toEqual({ klussen: "Diensten", geld: "Uren & facturen", berichten: "Berichten", account: "Account" });
    expect(NOTIFICATIONS_BEDRIJF.en.groups.klussen).toBe("Shifts");
    expect(Object.keys(NOTIFICATIONS_BEDRIJF.en).sort()).toEqual(Object.keys(NOTIFICATIONS_NL).sort());
    expect(JSON.stringify(NOTIFICATIONS_BEDRIJF)).not.toMatch(/Over je klussen|uitbetaling/);
  });

  it("de werkgeversapp vraagt ?app=werkgever, de werkersapp ?app=werker", () => {
    expect(bron("components/app/EmployerShell.tsx")).toContain('<NotificationsBell app="werkgever"');
    expect(bron("components/app/FreelancerShell.tsx")).toContain('app="werker"');
    expect(bron("components/app/NotificationsBell.tsx")).toContain("/api/me/notifications?app=${app}");
  });
});
