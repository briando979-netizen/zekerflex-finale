import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Zegt een werker af van een volle klus ("volledig bezet"), dan ging de klus altijd meteen weer open. Sinds 23 nov 2026 kan een bedrijf dat uitzetten
// (Instellingen → Klus-instellingen, lib/werkgever/heropenen.ts): dan blijft de klus staan, start er geen nieuwe matching of standby en hoort het
// bedrijf dat het de klus zelf weer open moet zetten. Zonder keuze (de standaard) is er niets veranderd; tests/cancel-shift-rematch.test.ts blijft
// dat ook bewaken. Dit bestand heeft dezelfde mocks, plus de opslag met de keuze van het bedrijf.

const h = vi.hoisted(() => ({
  tasks: [] as Promise<unknown>[],
  pushes: [] as { ids: string[]; push: { title: string; body: string } }[],
  mails: [] as { text: string }[],
  rematched: [] as string[],
  standby: [] as string[],
  reserves: 0,
  reserveMeldingen: [] as { shiftId: string; assignmentId: string }[],
  kv: new Map<string, unknown>(),
  kapot: false,
  /** de status van de klus voor de afzegging, en hoeveel plekken er daarna nog bezet zijn */
  status: "FILLED",
  actief: 0,
  /** de nieuwe status die naar de database ging, of niets */
  updates: [] as string[],
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => {
    if (h.kapot) throw new Error("opslag weg");
    return h.kv.has(k) ? structuredClone(h.kv.get(k)) : null;
  },
}));
vi.mock("@/lib/matching/standby", () => ({ notifyStandby: async (id: string) => void h.standby.push(id) }));
vi.mock("@/lib/reservebank/store", () => ({
  meldReservesVrijePlek: async (shiftId: string, assignmentId: string) => {
    h.reserveMeldingen.push({ shiftId, assignmentId });
    return { reserves: h.reserves, gemeld: h.reserves };
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: "u1", fullName: "Sanne de Vries" }) }));
vi.mock("@/lib/run-after", () => ({ runAfter: (t: () => Promise<unknown>) => void h.tasks.push(t()) }));
vi.mock("@/lib/matching/engine", () => ({ runMatchingForShift: async (id: string) => void h.rematched.push(id) }));
vi.mock("@/lib/notifications/push", () => ({
  sendUserPush: async (ids: string[], push: { title: string; body: string }) => (h.pushes.push({ ids, push }), 1),
}));
vi.mock("@/lib/mail", () => ({ sendMail: async (m: { text: string }) => void h.mails.push(m) }));
vi.mock("@/lib/replacements/store", () => ({ getOpenRequestForShift: async () => null, cancelReplacementRequest: async () => undefined }));
vi.mock("@/lib/messaging/contacts", () => ({ resolveShiftContact: async () => ({ userId: "mgr1", name: "Manager", branch: "Hal 1", shiftTitle: "Magazijn" }) }));
vi.mock("@/lib/claims/store", () => ({ offerEmployerClaim: async () => undefined }));
vi.mock("@/lib/prisma", () => {
  const tx = {
    shiftAssignment: { update: async () => ({}), count: async () => h.actief },
    timesheet: { delete: async () => ({}) },
    shift: { update: async (a: { data: { status: string } }) => (h.updates.push(a.data.status), {}) },
    freelancerProfile: { findUnique: async () => ({ reliabilityScore: 0.9 }), update: async () => ({}) },
  };
  return {
    prisma: {
      freelancerProfile: { findUnique: async () => ({ id: "fp1" }) },
      shiftAssignment: {
        findFirst: async () => ({
          id: "a1",
          cancelledAt: null,
          shift: {
            id: "sh1",
            title: "Magazijn",
            startsAt: new Date("2026-11-20T08:00:00Z"),
            endsAt: new Date("2026-11-20T16:00:00Z"),
            breakMinutes: 30,
            hourlyRateCents: 1800,
            positions: 1,
            annuleerUren: 24,
            status: h.status,
            branch: { name: "Hal 1", tenantId: "t1" },
          },
          timesheet: { id: "ts1", status: "DRAFT" },
        }),
      },
      $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});

import { POST } from "@/app/api/me/assignments/[assignmentId]/cancel/route";

const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC"; // zoals de server
});
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-17T12:00:00Z"));
  h.tasks.length = 0;
  h.pushes.length = 0;
  h.mails.length = 0;
  h.rematched.length = 0;
  h.standby.length = 0;
  h.reserves = 0;
  h.reserveMeldingen.length = 0;
  h.kv.clear();
  h.kapot = false;
  h.status = "FILLED";
  h.actief = 0;
  h.updates.length = 0;
});
afterEach(() => vi.useRealTimers());

const UIT = { automatisch: false, sinds: "2026-11-23T09:00:00.000Z" };

async function zegAf(): Promise<Response> {
  const res = await POST(new Request("http://x/api", { method: "POST", body: JSON.stringify({ reason: "Ziek geworden" }) }), {
    params: Promise.resolve({ assignmentId: "a1" }),
  });
  await Promise.all(h.tasks);
  return res;
}

describe("afzeggen van een volle klus, met automatisch heropenen aan (de standaard)", () => {
  it("de klus gaat meteen weer open, er wordt opnieuw gematcht en standby-werkers horen het: zoals het altijd werkte", async () => {
    const res = await zegAf();
    expect(res.status).toBe(200);
    expect(h.updates).toEqual(["OPEN"]);
    expect(h.rematched).toEqual(["sh1"]);
    expect(h.standby).toEqual(["sh1"]);
    expect(h.pushes[0]?.push.body).toContain("ZekerFlex zoekt direct een vervanger");
    expect(h.mails[0]?.text).toContain("De dienst staat weer open op het platform.");
    expect(h.reserveMeldingen).toEqual([{ shiftId: "sh1", assignmentId: "a1" }]);
  });

  it("nog een plek bezet: deels bezet, en ook dan wordt er gematcht", async () => {
    h.actief = 1;
    await zegAf();
    expect(h.updates).toEqual(["PARTIALLY_FILLED"]);
    expect(h.rematched).toEqual(["sh1"]);
  });

  it("de keuze van een ander bedrijf telt niet voor dit bedrijf", async () => {
    h.kv.set("klus:heropenen:t2", UIT);
    await zegAf();
    expect(h.updates).toEqual(["OPEN"]);
    expect(h.rematched).toEqual(["sh1"]);
  });

  it("een storing in de opslag verandert niets (fail-open): de klus gaat gewoon weer open", async () => {
    h.kv.set("klus:heropenen:t1", UIT);
    h.kapot = true;
    await zegAf();
    expect(h.updates).toEqual(["OPEN"]);
    expect(h.rematched).toEqual(["sh1"]);
    expect(h.standby).toEqual(["sh1"]);
  });
});

describe("afzeggen van een volle klus, met automatisch heropenen uit", () => {
  beforeEach(() => h.kv.set("klus:heropenen:t1", UIT));

  it("de klus blijft volledig bezet staan, er start niets vanzelf, en het bedrijf hoort wat het zelf moet doen", async () => {
    const res = await zegAf();
    expect(res.status).toBe(200);
    expect(h.updates).toEqual([]);
    expect(h.rematched).toEqual([]);
    expect(h.standby).toEqual([]);
    expect(h.pushes).toHaveLength(1);
    expect(h.pushes[0]?.ids).toEqual(["mgr1"]);
    expect(h.pushes[0]?.push.body).toContain("Sanne de Vries komt niet op");
    expect(h.pushes[0]?.push.body).toContain("De klus blijft op volledig bezet staan, want automatisch heropenen staat uit. Zet hem zelf weer open op de klus.");
    expect(h.pushes[0]?.push.body).not.toContain("ZekerFlex zoekt direct");
    expect(h.mails[0]?.text).toContain("het bedrijf heeft automatisch heropenen uitgezet");
    expect(h.mails[0]?.text).not.toContain("staat weer open op het platform");
  });

  it("ook met een plek nog bezet blijft hij volledig bezet; de afzegging zelf (plek vrij, urenbriefje weg) gebeurt wel", async () => {
    h.actief = 1;
    await zegAf();
    expect(h.updates).toEqual([]);
    expect(h.rematched).toEqual([]);
  });

  it("de reserves van het bedrijf zelf horen het wel, en het bedrijf kiest daaruit zoals altijd", async () => {
    h.reserves = 2;
    await zegAf();
    expect(h.reserveMeldingen).toEqual([{ shiftId: "sh1", assignmentId: "a1" }]);
    expect(h.pushes[0]?.push.body).toContain("2 reserves op de reservebank");
    expect(h.pushes[0]?.push.body).not.toContain("De klus blijft op volledig bezet staan");
  });

  it("een klus die nog niet vol was is al open: daar verandert uit niets aan", async () => {
    h.status = "PARTIALLY_FILLED";
    await zegAf();
    expect(h.updates).toEqual(["OPEN"]);
    expect(h.rematched).toEqual(["sh1"]);
    expect(h.standby).toEqual(["sh1"]);
    expect(h.pushes[0]?.push.body).toContain("ZekerFlex zoekt direct een vervanger");
  });
});
