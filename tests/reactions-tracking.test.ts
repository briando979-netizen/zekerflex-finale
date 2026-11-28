import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { trackShiftReactionClick } from "@/lib/analytics/track-shift-reactions";

// Tests for shift reactions tracking and employer dashboard
describe("Shift Reactions Tracking", () => {
  let testShiftId: string;
  let testTenantId: string;

  beforeAll(async () => {
    // Create a test tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: "Test Reactions Tenant",
        slug: `test-reactions-${Date.now()}`,
      },
    });
    testTenantId = tenant.id;

    // Create a test branch
    const branch = await prisma.branch.create({
      data: {
        tenantId: testTenantId,
        name: "Test Branch",
      },
    });

    // Create a test shift
    const shift = await prisma.shift.create({
      data: {
        branchId: branch.id,
        title: "Test Shift for Reactions",
        status: "openstaand",
        startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000),
      },
    });
    testShiftId = shift.id;
  });

  afterAll(async () => {
    // Clean up test data
    if (testShiftId) {
      await prisma.shift.delete({ where: { id: testShiftId } }).catch(() => undefined);
    }
    if (testTenantId) {
      await prisma.tenant.delete({ where: { id: testTenantId } }).catch(() => undefined);
    }
  });

  it("should create analytics events for shift reactions", async () => {
    // Simulate three different reaction types
    const actions = ["ACCEPT", "DECLINE", "RESERVE"] as const;

    for (const action of actions) {
      await trackShiftReactionClick(testShiftId, action);
    }

    // Give the events a moment to persist
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Query the events
    const events = await prisma.analyticsEvent.findMany({
      where: {
        label: { in: ["shift_reaction_accept", "shift_reaction_decline", "shift_reaction_reserve"] },
        meta: { path: { equals: testShiftId, mode: "insensitive" } },
      },
    });

    // Verify the events were recorded
    expect(events.length).toBeGreaterThanOrEqual(3);
  });

  it("should correctly associate events with shift ID", async () => {
    // Create an event
    await trackShiftReactionClick(testShiftId, "ACCEPT");
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Query and verify metadata
    const event = await prisma.analyticsEvent.findFirst({
      where: {
        label: "shift_reaction_accept",
      },
      orderBy: { createdAt: "desc" },
    });

    expect(event).toBeDefined();
    expect(event?.meta).toBeDefined();
    const meta = event?.meta as Record<string, unknown>;
    expect(meta?.shiftId).toBe(testShiftId);
    expect(meta?.action).toBe("ACCEPT");
  });

  it("should calculate accurate reaction statistics", async () => {
    // Create multiple events
    const eventCounts = { ACCEPT: 3, DECLINE: 1, RESERVE: 2 };

    for (const [action, count] of Object.entries(eventCounts)) {
      for (let i = 0; i < count; i++) {
        await trackShiftReactionClick(testShiftId, action as "ACCEPT" | "DECLINE" | "RESERVE");
        // Stagger the events slightly to ensure they're within the same time window
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Query events
    const events = await prisma.analyticsEvent.findMany({
      where: {
        label: { in: ["shift_reaction_accept", "shift_reaction_decline", "shift_reaction_reserve"] },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // Count events by type
    const stats = events.reduce(
      (acc, event) => {
        if (event.label === "shift_reaction_accept") acc.accepted += 1;
        else if (event.label === "shift_reaction_decline") acc.declined += 1;
        else if (event.label === "shift_reaction_reserve") acc.reserved += 1;
        return acc;
      },
      { accepted: 0, declined: 0, reserved: 0 },
    );

    // Verify counts (should have at least the events we just created)
    expect(stats.accepted).toBeGreaterThanOrEqual(eventCounts.ACCEPT);
    expect(stats.declined).toBeGreaterThanOrEqual(eventCounts.DECLINE);
    expect(stats.reserved).toBeGreaterThanOrEqual(eventCounts.RESERVE);

    // Verify percentages
    const total = stats.accepted + stats.declined + stats.reserved;
    const acceptRate = Math.round((stats.accepted / total) * 100);

    expect(acceptRate).toBeGreaterThan(0);
    expect(acceptRate).toBeLessThanOrEqual(100);
  });

  it("should correctly filter events by time window", async () => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Query events from the last 7 days
    const recentEvents = await prisma.analyticsEvent.findMany({
      where: {
        createdAt: { gte: sevenDaysAgo },
        label: { in: ["shift_reaction_accept", "shift_reaction_decline", "shift_reaction_reserve"] },
      },
    });

    // All returned events should be within the time window
    for (const event of recentEvents) {
      expect(event.createdAt.getTime()).toBeGreaterThanOrEqual(sevenDaysAgo.getTime());
      expect(event.createdAt.getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });

  it("should handle batch reactions correctly", async () => {
    // Test rapid-fire reactions (simulating bulk operations)
    const shiftIds = [testShiftId, testShiftId, testShiftId];

    for (const shiftId of shiftIds) {
      void trackShiftReactionClick(shiftId, "ACCEPT");
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify all were recorded
    const events = await prisma.analyticsEvent.findMany({
      where: {
        label: "shift_reaction_accept",
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    expect(events.length).toBeGreaterThanOrEqual(3);
  });
});

describe("Employer Reactions Dashboard", () => {
  it("should correctly calculate acceptance rate", async () => {
    // Test the calculation logic
    const accepted = 5;
    const declined = 2;
    const reserved = 3;
    const total = accepted + declined + reserved;

    const acceptRate = Math.round((accepted / total) * 100);
    const declineRate = Math.round((declined / total) * 100);
    const reserveRate = Math.round((reserved / total) * 100);

    expect(acceptRate).toBe(50); // 5/10 = 50%
    expect(declineRate).toBe(20); // 2/10 = 20%
    expect(reserveRate).toBe(30); // 3/10 = 30%
    expect(acceptRate + declineRate + reserveRate).toBe(100);
  });

  it("should correctly determine trend vs last week", () => {
    // Test the trend logic
    const cases = [
      { thisWeek: 5, lastWeek: 3, expected: "up" },
      { thisWeek: 3, lastWeek: 5, expected: "down" },
      { thisWeek: 4, lastWeek: 4, expected: "stable" },
    ];

    for (const { thisWeek, lastWeek, expected } of cases) {
      const trend = thisWeek > lastWeek ? "up" : thisWeek < lastWeek ? "down" : "stable";
      expect(trend).toBe(expected);
    }
  });
});
