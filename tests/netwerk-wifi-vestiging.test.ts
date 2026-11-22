import { beforeEach, describe, expect, it, vi } from "vitest";

// De wifi-instellingen per vestiging (lib/netwerk/store.ts): IP-adres, netwerknaam en
// het geheim. De RADIUS-server die ze las is op 22 nov 2026 weggehaald, de opslag
// blijft (bestaande instellingen en het eigen wifi-wachtwoord van een gebruiker).

process.env.AUTH_SECRET ??= "test-geheim-voor-de-wifi-wachtwoorden-0123456789";

const store = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => structuredClone(store.get(k) ?? null),
  kvSet: async (k: string, v: unknown) => void store.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void store.delete(k),
  kvListEntries: async (prefix: string) => [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value: structuredClone(value) })),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { nieuwWifiWachtwoord, wifiInstellingen, wifiWachtwoord, zetWifiVestiging } from "@/lib/netwerk/store";

const IP = "83.12.45.67";

beforeEach(() => {
  store.clear();
});

describe("wifi per vestiging", () => {
  it("het geheim per vestiging blijft gelijk bij een wijziging en verhuist mee met een nieuw IP", async () => {
    const eerst = await zetWifiVestiging("t1", "b1", { ip: IP, ssid: "Bedrijf Werk", aan: true });
    expect(eerst).toMatchObject({ branchId: "b1", ip: IP, ssid: "Bedrijf Werk", aan: true });
    expect(eerst.secret.length).toBeGreaterThanOrEqual(24);
    const daarna = await zetWifiVestiging("t1", "b1", { ip: "83.12.45.68", ssid: "Nieuwe naam", aan: true });
    expect(daarna.secret).toBe(eerst.secret);
    expect((await wifiInstellingen("t1")).vestigingen.b1).toMatchObject({ ip: "83.12.45.68", ssid: "Nieuwe naam" });
    // het oude IP is vrij, het nieuwe kan een ander bedrijf niet ook claimen
    await expect(zetWifiVestiging("t2", "b9", { ip: "83.12.45.68", ssid: "X", aan: true })).rejects.toThrow(/al gekoppeld/);
    await expect(zetWifiVestiging("t2", "b9", { ip: IP, ssid: "X", aan: true })).resolves.toMatchObject({ ip: IP });
    await expect(zetWifiVestiging("t1", "b1", { ip: "geen", ssid: "X", aan: true })).rejects.toThrow(/IP-adres/);
  });

  it("het eigen wifi-wachtwoord blijft gelijk en is leesbaar; een nieuw wachtwoord vervangt het", async () => {
    const eerst = await wifiWachtwoord("u1");
    expect(eerst).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(await wifiWachtwoord("u1")).toBe(eerst);
    expect(await wifiWachtwoord("u2")).not.toBe(eerst);
    const nieuw = await nieuwWifiWachtwoord("u1");
    expect(nieuw).not.toBe(eerst);
    expect(await wifiWachtwoord("u1")).toBe(nieuw);
  });
});
