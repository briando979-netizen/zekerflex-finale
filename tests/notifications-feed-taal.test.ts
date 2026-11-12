import { beforeEach, describe, expect, it, vi } from "vitest";

// De meldingen in de bel (lib/notifications/feed.ts) in de taal van de werker. Vertaald bij het LEZEN (ook bestaande
// meldingen), alleen de vaste zinnen; vrije tekst van een mens (klusnaam, chatbericht) blijft zoals hij is. Opdrachtgever
// en beheer blijven Nederlands. De handtekening van een weggeklikte melding komt altijd uit de Nederlandse tekst.

const NU = new Date("2026-11-12T10:00:00+01:00");

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  admin: false,
  threads: [] as unknown[],
  unread: 2,
  assignments: [] as unknown[],
  timesheets: [] as unknown[],
  offers: [] as unknown[],
  matches: [] as unknown[],
  replacements: [] as unknown[],
  toApprove: 0,
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
}));
vi.mock("@/lib/auth", () => ({ hasRole: (p: { roles: string[] }, ...r: string[]) => r.some((x) => p.roles.includes(x)) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: async () => ({ id: "f1" }) },
    shiftAssignment: { findMany: async () => h.assignments },
    timesheet: { findMany: async () => h.timesheets, count: async () => h.toApprove },
    shiftMatch: { findMany: async () => h.matches },
    shift: { findMany: async () => [] },
    bankAccount: { findUnique: async () => null },
  },
}));
vi.mock("@/lib/prefs/store", () => ({ getPrefs: async () => ({ confirmations: {} }) }));
vi.mock("@/lib/offers/store", () => ({ offersForUser: async () => h.offers, listCounterOffers: async () => [] }));
vi.mock("@/lib/replacements/store", () => ({ listReplacementRequests: async () => h.replacements }));
vi.mock("@/lib/messaging/store", () => ({
  listThreadsForUser: async () => h.threads,
  getMessages: async () => [],
  unreadForUser: () => h.unread,
}));
vi.mock("@/lib/messaging/contacts", () => ({ isPlatformAdmin: async () => h.admin }));
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: async () => ({ branchIds: null, tenantIds: ["t1"] }) }));
vi.mock("@/lib/bank/notify", () => ({ recentNotes: async () => [] }));
vi.mock("@/lib/offers/verval", () => ({ REACTIE_MARGE_MS: 0 }));
vi.mock("@/lib/app-mode", () => ({ BANK_AAN: false }));
vi.mock("@/lib/afspraken/bel", () => ({ afsprakenBelVoor: async () => [] }));

import { getNotifications } from "@/lib/notifications/feed";
import { MELDING_NL } from "@/lib/notifications/feed-teksten";
import { notifSignature, addDismissed } from "@/lib/notifications/dismissed";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

const werker = { userId: "w1", roles: ["FREELANCER"], grants: [] } as never;
const manager = { userId: "m1", roles: ["LOCAL_MANAGER"], grants: [] } as never;
const TALEN = ["nl", "en", "pl", "ro", "uk"] as const;

const uur = (n: number) => new Date(NU.getTime() + n * 3600_000);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
  h.kv.clear();
  h.admin = false;
  h.unread = 2;
  h.threads = [{ id: "c1", kind: "direct", meta: { subject: "Vraag over rooster" }, lastMessage: { text: "Kun je dinsdag ook?", at: NU.toISOString() } }];
  h.assignments = [{ id: "a1", shift: { id: "s1", title: "Bediening", startsAt: uur(5), branch: { name: "Grand Café" } } }];
  h.timesheets = [{ id: "ts1", status: "DISPUTED", updatedAt: NU }, { id: "ts2", status: "SUBMITTED", updatedAt: NU }];
  const respondedAt = new Date(NU.getTime() - 3600_000).toISOString();
  h.offers = [
    { id: "o1", status: "accepted", respondedAt, at: respondedAt, proposedRateCents: 1850, listedRateCents: 1800, shiftTitle: "Afwas ochtend", shiftId: "s2" },
    { id: "o2", status: "accepted", respondedAt, at: respondedAt, proposedRateCents: 1800, listedRateCents: 1800, shiftTitle: "Bar avond", shiftId: "s3" },
    { id: "o3", status: "declined", respondedAt, at: respondedAt, proposedRateCents: 1900, listedRateCents: 1800, shiftTitle: "Terras", shiftId: "s4" },
    { id: "o4", status: "declined", respondedAt, at: respondedAt, proposedRateCents: 1800, listedRateCents: 1800, shiftTitle: "Keuken", shiftId: "s5" },
    { id: "o5", status: "expired", respondedAt, at: respondedAt, proposedRateCents: 1800, listedRateCents: 1800, shiftTitle: "Magazijn", shiftId: "s6" },
  ];
  h.matches = [{ id: "m1", respondedAt: new Date(NU.getTime() - 3600_000), expiresAt: null, createdAt: new Date(NU.getTime() - 7200_000), shift: { id: "s7", title: "Receptie" } }];
  h.replacements = [{ id: "r1", userId: "w1", status: "open", shiftTitle: "Schoonmaak", at: NU.toISOString() }];
});

const perId = (items: Awaited<ReturnType<typeof getNotifications>>) => Object.fromEntries(items.map((i) => [i.id, i]));

describe("zonder teksten: Nederlands, precies zoals het altijd stond", () => {
  it("elke melding van een werker heeft de bestaande Nederlandse titel en tekst", async () => {
    const m = perId(await getNotifications(werker));
    expect(m["chat:c1"]).toMatchObject({ title: "Vraag over rooster", body: '2 nieuw berichten: "Kun je dinsdag ook?"' });
    expect(m["confirm:a1"]).toMatchObject({ title: "Bevestig je komst", body: "Bediening bij Grand Café — over 5 uur", action: { type: "confirm", id: "a1", label: "Bevestig komst" } });
    expect(m["ts:ts1"]).toMatchObject({ title: "Dispuut over je uren", body: "Er is een dispuut over een urenbriefje." });
    expect(m["ts:ts2"]).toMatchObject({ title: "Uren in behandeling", body: "Je ingediende uren wachten op goedkeuring." });
    expect(m["offer:o1"]).toMatchObject({ title: "Tegenbod geaccepteerd", body: "Afwas ochtend: je tarief van € 18.50/u is akkoord. Je staat ingepland." });
    expect(m["offer:o2"]).toMatchObject({ title: "Je bent uitgekozen", body: "Bar avond: je reactie is geaccepteerd. Je staat ingepland." });
    expect(m["offer:o3"]).toMatchObject({ title: "Tegenbod afgewezen", body: "Terras: het oorspronkelijke tarief blijft gelden." });
    expect(m["offer:o4"]).toMatchObject({ title: "Niet uitgekozen", body: "Keuken: er is iemand anders gekozen. Zoek een andere klus." });
    expect(m["offer:o5"]).toMatchObject({ title: "Helaas niet uitgekozen", body: "Magazijn: de klus is begonnen zonder dat je gekozen bent. Zoek een andere klus." });
    expect(m["match:m1"]).toMatchObject({ title: "Niet uitgekozen", body: "Receptie: deze klus is niet (meer) voor jou — een ander is gekozen of de reactietijd is verlopen." });
    expect(m["repl:r1"]).toMatchObject({ title: "Vervanger gezocht", body: 'Schoonmaak: je klus staat als "Vervanging" op het platform.' });
  });

  it("een gesprek zonder onderwerp heet 'Nieuw bericht', en één ongelezen bericht gebruikt het enkelvoud", async () => {
    h.unread = 1;
    h.threads = [{ id: "c2", kind: "direct", meta: {}, lastMessage: { text: "Hoi", at: NU.toISOString() } }];
    const m = perId(await getNotifications(werker));
    expect(m["chat:c2"]).toMatchObject({ title: "Nieuw bericht", body: '1 nieuw bericht: "Hoi"' });
  });
});

describe("in de taal van de werker", () => {
  for (const taal of ["en", "pl", "ro", "uk"] as const) {
    it(`${taal}: vaste zinnen vertaald, vrije tekst ongemoeid, geen plaatshouder blijft staan`, async () => {
      const t = FREELANCER_DICTS[taal].meldingTeksten;
      const m = perId(await getNotifications(werker, t));
      // vrije tekst blijft zoals hij is: klusnamen, gespreksonderwerp en het chatbericht
      expect(m["chat:c1"]!.title).toBe("Vraag over rooster");
      expect(m["chat:c1"]!.body).toContain("Kun je dinsdag ook?");
      expect(m["confirm:a1"]!.body).toContain("Bediening");
      expect(m["confirm:a1"]!.body).toContain("Grand Café");
      expect(m["offer:o2"]!.body).toContain("Bar avond");
      expect(m["repl:r1"]!.body).toContain("Schoonmaak");
      // de vaste zinnen zijn vertaald
      expect(m["confirm:a1"]!.title).toBe(t.bevestigTitel);
      expect(m["confirm:a1"]!.title).not.toBe("Bevestig je komst");
      expect(m["confirm:a1"]!.action?.label).toBe(t.bevestigKnop);
      expect(m["ts:ts1"]!.title).toBe(t.urenDisputTitel);
      expect(m["offer:o1"]!.body).toContain(taal === "en" ? "18.50" : "18,50");
      for (const i of Object.values(m)) {
        for (const x of [i.title, i.body, i.action?.label ?? ""]) expect(x, `${taal} ${i.id}: ${x}`).not.toMatch(/\{\w+\}|undefined/);
      }
      // elke tekst is echt vertaald: anders dan de Nederlandse melding met dezelfde id
      const nl = perId(await getNotifications(werker));
      for (const i of Object.values(m)) expect(i.body, `${taal} ${i.id}`).not.toBe(nl[i.id]!.body);
    });
  }

  it("een opdrachtgever blijft Nederlands, ook als er per ongeluk teksten worden meegegeven (de chatmelding houdt het Nederlands)", async () => {
    const pl = FREELANCER_DICTS.pl.meldingTeksten;
    const m = perId(await getNotifications(manager, pl));
    expect(m["chat:c1"]!.body).toBe('2 nieuw berichten: "Kun je dinsdag ook?"');
    h.toApprove = 4;
    const m2 = perId(await getNotifications(manager, pl));
    expect(m2["emp:approve"]).toMatchObject({ title: "4 urenbriefjes te keuren", body: "Keur goed zodat je krachten hun uitbetaling in gang kunnen zetten." });
  });
});

describe("weggeklikt blijft weggeklikt, in elke taal", () => {
  it("de handtekening komt uit de Nederlandse tekst: wat in het Nederlands was weggeklikt, blijft ook vertaald weg", async () => {
    const nl = perId(await getNotifications(werker));
    const sigs = Object.values(nl).map((i) => i.sig);
    expect(sigs.every(Boolean)).toBe(true);
    // een bestaande handtekening zoals de bel hem tot nu toe maakte (id + Nederlandse tekst)
    expect(nl["confirm:a1"]!.sig).toBe(notifSignature("confirm:a1", "Bediening bij Grand Café — over 5 uur"));
    await addDismissed("w1", [notifSignature("confirm:a1", "Bediening bij Grand Café — over 5 uur"), notifSignature("repl:r1", 'Schoonmaak: je klus staat als "Vervanging" op het platform.')]);
    for (const taal of TALEN) {
      const m = perId(await getNotifications(werker, FREELANCER_DICTS[taal].meldingTeksten));
      expect(m["confirm:a1"], taal).toBeUndefined();
      expect(m["repl:r1"], taal).toBeUndefined();
      expect(m["ts:ts1"], taal).toBeDefined();
    }
  });

  it("een vertaalde melding draagt dezelfde handtekening als de Nederlandse, zodat 'gelezen' in elke taal hetzelfde onthoudt", async () => {
    const nl = perId(await getNotifications(werker));
    for (const taal of ["en", "pl", "ro", "uk"] as const) {
      const m = perId(await getNotifications(werker, FREELANCER_DICTS[taal].meldingTeksten));
      for (const id of Object.keys(nl)) expect(m[id]!.sig, `${taal} ${id}`).toBe(nl[id]!.sig);
    }
  });
});

describe("de woordenlijst meldingTeksten in vijf talen", () => {
  const plaatshouders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]!).sort().join(",");

  it("dezelfde sleutels en plaatshouders in elke taal, niets leeg, en echt vertaald", () => {
    for (const taal of TALEN) {
      const t = FREELANCER_DICTS[taal].meldingTeksten as Record<string, string>;
      expect(Object.keys(t).sort(), taal).toEqual(Object.keys(MELDING_NL).sort());
      for (const [k, nl] of Object.entries(MELDING_NL)) {
        const x = t[k] ?? "";
        expect(x.length, `${taal} ${k}`).toBeGreaterThan(0);
        expect(plaatshouders(x), `${taal} ${k}`).toBe(plaatshouders(nl));
        if (taal !== "nl" && nl.length > 14 && k !== "intl") expect(x, `${taal} ${k}`).not.toBe(nl);
      }
    }
    expect(FREELANCER_DICTS.nl.meldingTeksten).toBe(MELDING_NL);
  });
});
