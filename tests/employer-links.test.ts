import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvDelete: async (k: string) => void kv.delete(k),
}));
const shifts: unknown[] = [];
const timesheets: unknown[] = [];
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shift: { findMany: async () => shifts },
    timesheet: { findMany: async () => timesheets },
    invoice: { findMany: async () => [] },
  },
}));
vi.mock("@/lib/webhooks/manage", () => ({ assertSafeWebhookUrl: (u: string) => u }));

const links = await import("@/lib/integrations/employer-links");

beforeEach(() => {
  kv.clear();
  shifts.length = 0;
  timesheets.length = 0;
});

describe("no-code integrations", () => {
  it("calendar token resolves to its company, and rotating kills the old link", async () => {
    const t1 = await links.calendarToken("tenant-1");
    expect(await links.tenantForCalendarToken(t1)).toBe("tenant-1");
    expect(await links.calendarToken("tenant-1")).toBe(t1);
    const t2 = await links.calendarToken("tenant-1", true);
    expect(t2).not.toBe(t1);
    expect(await links.tenantForCalendarToken(t1)).toBeNull();
    expect(await links.tenantForCalendarToken(t2)).toBe("tenant-1");
  });

  it("builds a valid agenda with who is coming", async () => {
    shifts.push({
      id: "s1",
      title: "Bediening; avond",
      status: "FILLED",
      startsAt: new Date("2026-10-25T16:00:00Z"),
      endsAt: new Date("2026-10-25T21:00:00Z"),
      positions: 2,
      updatedAt: new Date("2026-10-20T10:00:00Z"),
      branch: { name: "Grand Café", addressLine: "Dam 1", city: "Amsterdam" },
      assignments: [{ freelancer: { user: { fullName: "Jan de Vries" } } }],
    });
    const ics = await links.calendarIcs("tenant-1", "https://www.zekerflex.com");
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toContain("DTSTART:20261025T160000Z");
    expect(ics).toContain("SUMMARY:Bediening\\; avond (1/2 ingevuld)");
    expect(ics.replace(/\r\n /g, "")).toContain("Komt: Jan de Vries");
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true);
  });

  it("CSV export opens in Dutch Excel and is safe against formula injection", async () => {
    timesheets.push({
      scheduledStart: new Date("2026-10-01T07:00:00Z"),
      scheduledEnd: new Date("2026-10-01T15:00:00Z"),
      billableMinutes: 450,
      hourlyRateCents: 1800,
      status: "APPROVED",
      approvedAt: new Date("2026-10-02T09:00:00Z"),
      branch: { name: "DC West" },
      assignment: { shift: { title: "Orderpicker" } },
      freelancer: { user: { fullName: "=HYPERLINK(evil)" } },
    });
    const csv = await links.hoursCsv("tenant-1", new Date("2026-10-01"), new Date("2026-11-01"));
    expect(csv.startsWith("﻿Datum;Begin;Eind;Kracht")).toBe(true);
    expect(csv).toContain(";'=HYPERLINK(evil);");
    expect(csv).toContain(";7,50;18,00;135,00;Goedgekeurd;");
  });
});
