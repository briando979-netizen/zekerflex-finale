import { afterEach, describe, expect, it, vi } from "vitest";

const requirePrincipal = vi.fn();
const requireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requirePrincipal: (...a: unknown[]) => requirePrincipal(...a),
  requireRole: (...a: unknown[]) => requireRole(...a),
}));

const groupBy = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { invoice: { groupBy: (...a: unknown[]) => groupBy(...a) } },
}));

import { GET } from "@/app/api/admin/invoices/stats/route";

const PRINCIPAL = { userId: "admin1", email: "admin@zekerflex.com" };

afterEach(() => vi.clearAllMocks());

describe("GET /api/admin/invoices/stats", () => {
  it("sums outstanding and paid totals per status, platform-wide", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    groupBy.mockResolvedValue([
      { status: "ISSUED", _sum: { totalCents: 5000 }, _count: 3 },
      { status: "PAID", _sum: { totalCents: 12000 }, _count: 7 },
      { status: "DRAFT", _sum: { totalCents: 0 }, _count: 1 },
    ]);

    const res = await GET(new Request("http://localhost/api/admin/invoices/stats"), { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ outstandingCents: 5000, paidCents: 12000, count: 11 });
  });

  it("defaults to zero when there are no invoices at all", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    groupBy.mockResolvedValue([]);

    const res = await GET(new Request("http://localhost/api/admin/invoices/stats"), { params: Promise.resolve({}) });
    const json = await res.json();
    expect(json).toEqual({ outstandingCents: 0, paidCents: 0, count: 0 });
  });
});
