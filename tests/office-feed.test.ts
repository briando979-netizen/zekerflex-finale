import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/handlers", () => ({ withAdminAccess: (_r: string[], fn: () => Promise<Response>) => fn }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      findMany: async () => [
        { id: "1", category: "BILLING", action: "bank.topup", summary: "Bank opgewaardeerd", severity: "info", actorLabel: "integration:stripe", createdAt: new Date() },
        { id: "2", category: "TIMESHEET", action: "timesheet.approved", summary: "Uren goedgekeurd", severity: "info", actorLabel: "user", createdAt: new Date() },
        { id: "3", category: "SALES", action: "sales.outreach.drafted", summary: "Mail opgesteld", severity: "info", actorLabel: "sales-ai", createdAt: new Date() },
        { id: "4", category: "ADMIN", action: "shop.order_refunded", summary: "Terugbetaald", severity: "info", actorLabel: "user", createdAt: new Date() },
        { id: "5", category: "KYC", action: "kyc.verified", summary: "ID gecontroleerd", severity: "warning", actorLabel: "system", createdAt: new Date() },
      ],
    },
  },
}));

import { GET } from "@/app/api/admin/office/route";

describe("live office feed", () => {
  it("maps real audit events to departments", async () => {
    const d = await (await (GET as unknown as () => Promise<Response>)()).json();
    expect(d.events.map((e: { room: string }) => e.room)).toEqual(["bank", "operations", "sales", "shop", "legal"]);
    expect(d.counts).toEqual({ bank: 1, operations: 1, sales: 1, shop: 1, legal: 1 });
  });
});
