import { afterEach, describe, expect, it, vi } from "vitest";

const tenantFindUnique = vi.fn();
const shiftFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findUnique: (...a: unknown[]) => tenantFindUnique(...a), findMany: vi.fn() },
    shift: { findMany: (...a: unknown[]) => shiftFindMany(...a) },
  },
}));

const store = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (key: string) => (store.has(key) ? store.get(key) : null),
  kvSet: async (key: string, value: unknown) => {
    store.set(key, value);
  },
}));

const getFiscal = vi.fn().mockResolvedValue({});
const invoiceModeFor = vi.fn();
vi.mock("@/lib/fiscal/store", () => ({
  getFiscal: (...a: unknown[]) => getFiscal(...a),
  invoiceModeFor: (...a: unknown[]) => invoiceModeFor(...a),
}));

const sendUserPush = vi.fn().mockResolvedValue(1);
vi.mock("@/lib/notifications/push", () => ({ sendUserPush: (...a: unknown[]) => sendUserPush(...a) }));

import { isFollowing, notifyFollowersOfShifts, setFollow } from "@/lib/worker/follows";

const NOW = new Date("2026-11-03T10:00:00Z");

function shift(id: string, startsAt: string, over: Record<string, unknown> = {}) {
  return { id, title: "Bediening", startsAt: new Date(startsAt), hourlyRateCents: 1650, viaUitzendbureau: false, branch: { tenantId: "t1", city: "Utrecht", tenant: { name: "Café De Brug" } }, ...over };
}

afterEach(() => {
  vi.clearAllMocks();
  store.clear();
});

describe("setFollow", () => {
  it("houdt beide lijsten bij en ontvolgt netjes", async () => {
    tenantFindUnique.mockResolvedValue({ id: "t1" });
    await setFollow("u1", "t1", true);
    await setFollow("u1", "t1", true); // dubbel volgen = één keer
    expect(store.get("volgt:u1")).toEqual(["t1"]);
    expect(store.get("volgers:t1")).toEqual(["u1"]);
    expect(await isFollowing("u1", "t1")).toBe(true);

    await setFollow("u1", "t1", false);
    expect(store.get("volgt:u1")).toEqual([]);
    expect(store.get("volgers:t1")).toEqual([]);
  });

  it("weigert een onbekend bedrijf", async () => {
    tenantFindUnique.mockResolvedValue(null);
    await expect(setFollow("u1", "nope", true)).rejects.toThrow(/bestaat niet/);
  });
});

describe("notifyFollowersOfShifts", () => {
  it("stuurt één push per volger, ook voor een reeks dagen, in Nederlandse tijd", async () => {
    store.set("volgers:t1", ["u1", "u2", "weg"]);
    store.set("volgt:u1", ["t1"]);
    store.set("volgt:u2", ["t1"]);
    store.set("volgt:weg", []); // ontvolgd: eigen lijst is leidend
    shiftFindMany.mockResolvedValue([shift("s1", "2026-11-10T08:00:00Z"), shift("s2", "2026-11-11T08:00:00Z")]);

    const r = await notifyFollowersOfShifts(["s1", "s2"], NOW);
    expect(r).toEqual({ notified: 2 });
    expect(sendUserPush).toHaveBeenCalledTimes(1);
    const [ids, push] = sendUserPush.mock.calls[0]!;
    expect(ids).toEqual(["u1", "u2"]);
    expect(push.title).toBe("❤️ Nieuwe dienst bij Café De Brug");
    expect(push.body).toBe("Bediening · 10 nov 09:00 (+1 dag) · Utrecht · € 16,50/u");
    expect(push.data.url).toBe("/dashboard/klussen/s1");

    const where = shiftFindMany.mock.calls[0]![0].where;
    expect(where.visibility).toBe("PUBLIC");
    expect(where.startsAt).toEqual({ gt: NOW });
  });

  it("een dienst alleen via het uitzendbureau gaat alleen naar uitzendkrachten", async () => {
    store.set("volgers:t1", ["zzp", "uitzend"]);
    store.set("volgt:zzp", ["t1"]);
    store.set("volgt:uitzend", ["t1"]);
    invoiceModeFor.mockImplementation(() => "reverse-billing");
    getFiscal.mockImplementation(async (userId: string) => ({ userId }));
    invoiceModeFor.mockImplementation((f: { userId: string }) => (f.userId === "uitzend" ? "payroll" : "reverse-billing"));
    shiftFindMany.mockResolvedValue([shift("s1", "2026-11-10T08:00:00Z", { viaUitzendbureau: true })]);

    await notifyFollowersOfShifts(["s1"], NOW);
    expect(sendUserPush.mock.calls[0]![0]).toEqual(["uitzend"]);
  });

  it("doet niets zonder volgers of zonder openbare diensten", async () => {
    shiftFindMany.mockResolvedValue([]);
    expect(await notifyFollowersOfShifts(["s1"], NOW)).toEqual({ notified: 0 });
    expect(await notifyFollowersOfShifts([], NOW)).toEqual({ notified: 0 });
    expect(sendUserPush).not.toHaveBeenCalled();
  });
});
