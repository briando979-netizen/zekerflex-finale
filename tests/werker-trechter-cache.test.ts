import { beforeEach, describe, expect, it, vi } from "vitest";

// De werkerstrechter haalt per werker de poort op (een handvol query's); binnen 10 minuten komt hij uit het geheugen,
// "Vernieuwen" haalt meteen opnieuw op.

const h = vi.hoisted(() => ({ gebruikersVragen: 0 }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: async () => (h.gebruikersVragen++, []) },
    analyticsEvent: { findMany: async () => [] },
  },
}));
vi.mock("@/lib/storage/kv", () => ({ kvGetMany: async () => new Map() }));
vi.mock("@/lib/onboarding/werker-poort-server", () => ({ werkerPoortStand: async () => null }));

const { werkerTrechterGecached } = await import("@/lib/admin/werker-trechter");

describe("werkerTrechterGecached", () => {
  beforeEach(() => {
    (globalThis as { __zfWerkerTrechter?: unknown }).__zfWerkerTrechter = undefined;
    h.gebruikersVragen = 0;
  });

  it("binnen 10 minuten uit het geheugen, daarna opnieuw; vernieuwen haalt altijd opnieuw op", async () => {
    const t0 = new Date("2026-11-13T12:00:00+01:00");
    const eerst = await werkerTrechterGecached(t0);
    expect(eerst.bijgewerkt).toEqual(t0);
    const later = await werkerTrechterGecached(new Date(t0.getTime() + 9 * 60_000));
    expect(later.bijgewerkt).toEqual(t0);
    expect(h.gebruikersVragen).toBe(1);
    await werkerTrechterGecached(new Date(t0.getTime() + 9 * 60_000), true);
    expect(h.gebruikersVragen).toBe(2);
    const na = await werkerTrechterGecached(new Date(t0.getTime() + 20 * 60_000));
    expect(na.bijgewerkt).toEqual(new Date(t0.getTime() + 20 * 60_000));
    expect(h.gebruikersVragen).toBe(3);
  });
});
