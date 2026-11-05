import { beforeEach, describe, expect, it, vi } from "vitest";

// Wifi op de werkvloer: mag iemand nu op dit netwerk? (lib/netwerk/radius.ts)
// De RADIUS-server vraagt het per inlogpoging; hier met een nagebootste
// database: een bedrijf met één vestiging, een eigen medewerker en een
// flexwerker met een dienst van 9 tot 17 uur.

process.env.AUTH_SECRET ??= "test-geheim-voor-de-wifi-wachtwoorden-0123456789";

const store = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => structuredClone(store.get(k) ?? null),
  kvSet: async (k: string, v: unknown) => void store.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void store.delete(k),
  kvListEntries: async (prefix: string) => [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value: structuredClone(value) })),
}));

const dienst = { startsAt: new Date("2026-11-05T08:00:00Z"), endsAt: new Date("2026-11-05T16:00:00Z"), branchId: "b1", status: "FILLED", cancelledAt: null as Date | null };
const gebruikers: Record<string, { id: string; fullName: string; lid: boolean; flex: string | null }> = {
  "baas@bedrijf.test": { id: "u-baas", fullName: "Bas de Baas", lid: true, flex: null },
  "flex@werker.test": { id: "u-flex", fullName: "Fatima Flex", lid: false, flex: "f1" },
  "los@iemand.test": { id: "u-los", fullName: "Lotte Los", lid: false, flex: null },
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { email: string } }) => {
        const g = gebruikers[where.email];
        return g ? { id: g.id, fullName: g.fullName, memberships: g.lid ? [{ id: "m1" }] : [], freelancerProfile: g.flex ? { id: g.flex } : null } : null;
      },
    },
    shiftAssignment: {
      findFirst: async ({ where }: { where: { freelancerId: string; shift: { branchId: string; startsAt: { lte: Date }; endsAt: { gte: Date } } } }) => {
        if (where.freelancerId !== "f1" || dienst.cancelledAt || where.shift.branchId !== dienst.branchId) return null;
        if (dienst.startsAt > where.shift.startsAt.lte || dienst.endsAt < where.shift.endsAt.gte) return null;
        return { shift: { endsAt: dienst.endsAt } };
      },
    },
    branch: { findMany: async () => [] },
  },
}));

import { wifiToegang } from "@/lib/netwerk/radius";
import { netwerkStand, radiusClientVoorIp, wifiWachtwoord, zetModuleStand, zetWifiVestiging } from "@/lib/netwerk/store";

const IP = "83.12.45.67";
const om = (t: string) => new Date(`2026-11-05T${t}:00Z`);

beforeEach(async () => {
  store.clear();
  dienst.cancelledAt = null;
  await zetModuleStand("t1", "wifi", { status: "actief", sinds: "2026-11-01T00:00:00Z", aantal: 1 });
  await zetWifiVestiging("t1", "b1", { ip: IP, ssid: "Bedrijf Werk", aan: true });
});

describe("wifi-toegang", () => {
  it("een eigen medewerker mag altijd, 12 uur lang, met zijn eigen wifi-wachtwoord", async () => {
    const r = await wifiToegang({ gebruiker: "Baas@Bedrijf.test", nasIp: IP, nu: om("03:00") });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.soort).toBe("medewerker");
    expect(r.sessieSeconden).toBe(12 * 3600);
    expect(r.wachtwoord).toBe(await wifiWachtwoord("u-baas"));
    expect(r.wachtwoord).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(r).toMatchObject({ tenantId: "t1", branchId: "b1" });
  });

  it("een flexwerker mag tijdens haar dienst, met een half uur speling, tot een half uur na het einde", async () => {
    const r = await wifiToegang({ gebruiker: "flex@werker.test", nasIp: IP, nu: om("07:45") });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.soort).toBe("flexwerker");
    // 07:45 → einde 16:00 + 30 min = 16:30: 8 uur en 45 min
    expect(r.sessieSeconden).toBe((8 * 60 + 45) * 60);
    expect((await wifiToegang({ gebruiker: "flex@werker.test", nasIp: IP, nu: om("16:20") })).ok).toBe(true);
  });

  it("buiten de dienst, bij een afgezegde dienst of zonder dienst: geen toegang", async () => {
    expect(await wifiToegang({ gebruiker: "flex@werker.test", nasIp: IP, nu: om("07:00") })).toEqual({ ok: false, reden: "geen-dienst" });
    expect(await wifiToegang({ gebruiker: "flex@werker.test", nasIp: IP, nu: om("16:45") })).toEqual({ ok: false, reden: "geen-dienst" });
    dienst.cancelledAt = new Date();
    expect(await wifiToegang({ gebruiker: "flex@werker.test", nasIp: IP, nu: om("10:00") })).toEqual({ ok: false, reden: "geen-dienst" });
    expect(await wifiToegang({ gebruiker: "los@iemand.test", nasIp: IP, nu: om("10:00") })).toEqual({ ok: false, reden: "geen-dienst" });
  });

  it("onbekend netwerk, onbekende gebruiker, pakket uit of vestiging uit", async () => {
    expect(await wifiToegang({ gebruiker: "baas@bedrijf.test", nasIp: "10.0.0.1", nu: om("10:00") })).toEqual({ ok: false, reden: "onbekend-netwerk" });
    expect(await wifiToegang({ gebruiker: "baas@bedrijf.test", nasIp: "geen-ip", nu: om("10:00") })).toEqual({ ok: false, reden: "onbekend-netwerk" });
    expect(await wifiToegang({ gebruiker: "niemand@bedrijf.test", nasIp: IP, nu: om("10:00") })).toEqual({ ok: false, reden: "onbekende-gebruiker" });
    await zetWifiVestiging("t1", "b1", { ip: IP, ssid: "Bedrijf Werk", aan: false });
    expect(await wifiToegang({ gebruiker: "baas@bedrijf.test", nasIp: IP, nu: om("10:00") })).toEqual({ ok: false, reden: "wifi-uit" });
    await zetWifiVestiging("t1", "b1", { ip: IP, ssid: "Bedrijf Werk", aan: true });
    await zetModuleStand("t1", "wifi", { status: "opgezegd", sinds: "2026-11-02T00:00:00Z", aantal: 1 });
    expect(await wifiToegang({ gebruiker: "baas@bedrijf.test", nasIp: IP, nu: om("10:00") })).toEqual({ ok: false, reden: "wifi-uit" });
    expect((await netwerkStand("t1")).modules.wifi?.status).toBe("opgezegd");
  });

  it("het geheim per vestiging blijft gelijk bij een wijziging en verhuist mee met een nieuw IP", async () => {
    const eerst = await radiusClientVoorIp(IP);
    expect(eerst).toMatchObject({ tenantId: "t1", branchId: "b1", aan: true });
    expect(eerst?.secret.length).toBeGreaterThanOrEqual(24);
    await zetWifiVestiging("t1", "b1", { ip: "83.12.45.68", ssid: "Nieuwe naam", aan: true });
    expect(await radiusClientVoorIp(IP)).toBeNull();
    expect((await radiusClientVoorIp("83.12.45.68"))?.secret).toBe(eerst?.secret);
    // een ander bedrijf kan dat IP niet ook claimen
    await expect(zetWifiVestiging("t2", "b9", { ip: "83.12.45.68", ssid: "X", aan: true })).rejects.toThrow(/al gekoppeld/);
    await expect(zetWifiVestiging("t1", "b1", { ip: "geen", ssid: "X", aan: true })).rejects.toThrow(/IP-adres/);
  });
});
