import { describe, expect, it, vi } from "vitest";

const calls: { take?: number }[] = [];
vi.mock("@/lib/auth/handlers", () => ({ withAdminAccess: (_r: string[], fn: (req: Request) => Promise<Response>) => fn }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      findMany: async (args: { take?: number }) => {
        calls.push(args);
        return [
          { id: "1", category: "BILLING", action: "bank.topup", summary: "Bank opgewaardeerd", severity: "info", actorLabel: "integration:stripe", targetType: null, targetId: null, createdAt: new Date() },
          { id: "2", category: "TIMESHEET", action: "timesheet.approved", summary: "Uren goedgekeurd", severity: "info", actorLabel: "user", targetType: "timesheet", targetId: "ts1", createdAt: new Date() },
          { id: "3", category: "SALES", action: "sales.outreach.drafted", summary: "Mail opgesteld", severity: "info", actorLabel: "sales-ai", targetType: null, targetId: null, createdAt: new Date() },
          { id: "4", category: "ADMIN", action: "shop.order_refunded", summary: "Terugbetaald", severity: "info", actorLabel: "user", targetType: null, targetId: null, createdAt: new Date() },
          { id: "5", category: "KYC", action: "kyc.verified", summary: "ID gecontroleerd", severity: "warning", actorLabel: "system", targetType: "tenant", targetId: "t9", createdAt: new Date() },
        ];
      },
    },
    timesheet: { findMany: async () => [{ id: "ts1", branch: { tenantId: "t1" } }] },
  },
}));

import { GET } from "@/app/api/admin/office/route";

const get = (url = "http://localhost/api/admin/office") => (GET as unknown as (req: Request) => Promise<Response>)(new Request(url));

describe("live office feed", () => {
  it("maps real audit events to departments", async () => {
    const d = await (await get()).json();
    expect(d.events.map((e: { room: string }) => e.room)).toEqual(["bank", "operations", "sales", "shop", "legal"]);
    expect(d.counts).toEqual({ bank: 1, operations: 1, sales: 1, shop: 1, legal: 1 });
  });

  it("links an event to its customer, so the 3D city can send it from that building", async () => {
    const d = await (await get()).json();
    expect(d.events.map((e: { tenantId: string | null }) => e.tenantId)).toEqual([null, "t1", null, null, "t9"]);
  });

  it("returns 40 events by default and at most 200 for the 24-hour replay", async () => {
    calls.length = 0;
    await get();
    await get("http://localhost/api/admin/office?limit=200");
    await get("http://localhost/api/admin/office?limit=5000");
    expect(calls.map((c) => c.take)).toEqual([40, 200, 200]);
  });
});
