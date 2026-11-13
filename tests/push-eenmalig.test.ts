import { beforeEach, describe, expect, it, vi } from "vitest";

// Eén push per klus per werker per kanaal (13 nov 2026, lib/notifications/push-eenmalig.ts). Zette een werkgever een klus
// opnieuw openbaar, dan stuurden volgers en job-alerts dezelfde push nog eens. Nu een markering
// "push-sent:<kanaal>:<klus>:<werker>" (zoals geo), 30 dagen geldig en daarna opgeruimd; een KV-storing = gewoon sturen.

const NOW = new Date("2026-11-13T10:00:00Z");
const DAG = 86_400_000;

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  kvFout: false,
  gewist: [] as { voorvoegsel: string; voor: Date }[],
  pushes: [] as { ids: string[]; title: string }[],
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => {
    if (h.kvFout) throw new Error("kv weg");
    return h.kv.get(k) ?? null;
  },
  kvSet: async (k: string, v: unknown) => {
    if (h.kvFout) throw new Error("kv weg");
    h.kv.set(k, v);
  },
  kvDeleteStale: async (voorvoegsel: string, voor: Date) => {
    h.gewist.push({ voorvoegsel, voor });
    return 2;
  },
}));
const SHIFT = {
  id: "s1",
  title: "Bediening restaurant",
  createdAt: new Date("2026-11-12T10:00:00Z"),
  startsAt: new Date("2099-11-05T18:00:00Z"),
  hourlyRateCents: 1800,
  viaUitzendbureau: false,
  requiredSkill: null,
  branch: { tenantId: "t1", city: "Amsterdam", tenant: { name: "Café De Brug" } },
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shift: { findMany: async () => [SHIFT] },
    $queryRaw: async () => [{ key: "prefs:u2", value: { jobAlerts: [{ id: "a", label: "Bediening Amsterdam", createdAt: "" }] } }],
  },
}));
vi.mock("@/lib/notifications/push", () => ({
  sendUserPush: async (ids: string[], p: { title: string }) => (h.pushes.push({ ids, title: p.title }), ids.length),
}));
vi.mock("@/lib/i18n/worker-locale", () => ({ userLocales: async (ids: string[]) => new Map(ids.map((i) => [i, "nl"])) }));
vi.mock("@/lib/employer/relations", () => ({ isBlockedByAny: async () => false }));
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: async () => ({}), invoiceModeFor: () => "invoice" }));
vi.mock("@/lib/admin/eigen-test", () => ({ leesEigenTest: async () => ({ tenants: {}, users: {} }) }));

import { PUSH_MARKERING_VOORVOEGSELS, eenmaligPush, pushSleutel, ruimPushMarkeringenOp } from "@/lib/notifications/push-eenmalig";
import { notifyFollowersOfShifts } from "@/lib/worker/follows";
import { notifyJobAlerts } from "@/lib/matching/job-alerts";

beforeEach(() => {
  h.kv.clear();
  h.kvFout = false;
  h.gewist = [];
  h.pushes = [];
});

describe("de markering", () => {
  it("eerst ja, daarna nee; na 30 dagen weer ja", async () => {
    expect(pushSleutel("volg", "s1", "u1")).toBe("push-sent:volg:s1:u1");
    expect(await eenmaligPush("volg", "s1", "u1", NOW)).toBe(true);
    expect(await eenmaligPush("volg", "s1", "u1", NOW)).toBe(false);
    // ander kanaal, andere klus of andere werker: los van elkaar
    expect(await eenmaligPush("alert", "s1", "u1", NOW)).toBe(true);
    expect(await eenmaligPush("volg", "s2", "u1", NOW)).toBe(true);
    expect(await eenmaligPush("volg", "s1", "u2", NOW)).toBe(true);
    expect(await eenmaligPush("volg", "s1", "u1", new Date(NOW.getTime() + 29 * DAG))).toBe(false);
    expect(await eenmaligPush("volg", "s1", "u1", new Date(NOW.getTime() + 31 * DAG))).toBe(true);
  });

  it("een markering zonder leesbare tijd telt als gestuurd; een KV-storing = gewoon sturen", async () => {
    h.kv.set("push-sent:volg:s9:u1", { at: "onzin" });
    expect(await eenmaligPush("volg", "s9", "u1", NOW)).toBe(false);
    h.kvFout = true;
    expect(await eenmaligPush("volg", "s1", "u1", NOW)).toBe(true);
    expect(await eenmaligPush("volg", "s1", "u1", NOW)).toBe(true);
  });

  it("opruimen: markeringen ouder dan 30 dagen, ook van geo; hooguit één keer per dag", async () => {
    expect(await ruimPushMarkeringenOp(NOW)).toBe(6);
    expect(h.gewist.map((g) => g.voorvoegsel)).toEqual([...PUSH_MARKERING_VOORVOEGSELS]);
    expect(h.gewist.every((g) => g.voor.toISOString() === "2026-10-14T10:00:00.000Z")).toBe(true);
    expect(await ruimPushMarkeringenOp(new Date(NOW.getTime() + 3_600_000))).toBe(0);
    expect(h.gewist).toHaveLength(3);
    expect(await ruimPushMarkeringenOp(new Date(NOW.getTime() + DAG))).toBe(6);
    h.kvFout = true;
    expect(await ruimPushMarkeringenOp(new Date(NOW.getTime() + 2 * DAG))).toBe(0);
  });
});

describe("twee keer openbaar zetten: één push per kanaal", () => {
  it("volgers en job-alerts sturen een klus één keer", async () => {
    h.kv.set("volgers:t1", ["u1"]);
    h.kv.set("volgt:u1", ["t1"]);
    expect(await notifyFollowersOfShifts(["s1"], NOW)).toEqual({ notified: 1 });
    expect(await notifyJobAlerts(["s1"], NOW)).toEqual({ notified: 1 });
    // de werkgever zet hem opnieuw openbaar (app/werkgever/diensten/[shiftId]/actions.ts)
    expect(await notifyFollowersOfShifts(["s1"], NOW)).toEqual({ notified: 0 });
    expect(await notifyJobAlerts(["s1"], NOW)).toEqual({ notified: 0 });
    expect(h.pushes.map((p) => p.ids)).toEqual([["u1"], ["u2"]]);
    expect([...h.kv.keys()].filter((k) => k.startsWith("push-sent:")).sort()).toEqual(["push-sent:alert:s1:u2", "push-sent:volg:s1:u1"]);
  });

  it("met een KV-storing komt de push gewoon (liever een keer te veel dan een klus missen)", async () => {
    expect(await notifyJobAlerts(["s1"], NOW)).toEqual({ notified: 1 });
    h.kvFout = true;
    expect(await notifyJobAlerts(["s1"], NOW)).toEqual({ notified: 1 });
    expect(h.pushes).toHaveLength(2);
  });
});
