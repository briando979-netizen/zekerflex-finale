import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const requirePrincipal = vi.fn();
const requireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requirePrincipal: (...a: unknown[]) => requirePrincipal(...a),
  requireRole: (...a: unknown[]) => requireRole(...a),
}));

const orderFindMany = vi.fn();
const orderCount = vi.fn();
const variantFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shopOrder: {
      findMany: (...a: unknown[]) => orderFindMany(...a),
      count: (...a: unknown[]) => orderCount(...a),
    },
    shopProductVariant: { findMany: (...a: unknown[]) => variantFindMany(...a) },
  },
}));

import { GET } from "@/app/api/shop/stats/route";

const PRINCIPAL = { userId: "admin1", email: "admin@zekerflex.com" };

afterEach(() => vi.clearAllMocks());

describe("GET /api/shop/stats", () => {
  it("sums revenue and tallies top products only from paid orders, never from pending/cancelled ones", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    const now = new Date();
    orderFindMany.mockResolvedValue([
      { totalCents: 4995, createdAt: now, itemsJson: [{ productId: "p1", name: "Veiligheidsschoenen S3", priceCents: 4995, qty: 1 }] },
      { totalCents: 2990, createdAt: now, itemsJson: [{ productId: "p1", name: "Veiligheidsschoenen S3", priceCents: 1495, qty: 2 }] },
    ]);
    orderCount.mockResolvedValue(10);
    variantFindMany.mockResolvedValue([]);

    const res = await GET(new Request("http://localhost/api/shop/stats"), { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.revenueCents).toBe(4995 + 2990);
    expect(json.topProducts).toEqual([{ name: "Veiligheidsschoenen S3", qty: 3, revenueCents: 4995 + 2990 }]);
    // Only PENDING_PAYMENT/RECEIVED/CONFIRMED/SHIPPED filtering happens in the
    // Prisma `where`, asserted via the query itself:
    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { in: ["RECEIVED", "CONFIRMED", "SHIPPED"] } } }),
    );
  });

  it("surfaces low-stock variants (stock <= 5) for active products only", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    orderFindMany.mockResolvedValue([]);
    orderCount.mockResolvedValue(0);
    variantFindMany.mockResolvedValue([
      { id: "v1", size: "42", color: null, stock: 0, product: { name: "Veiligheidsschoenen S3", slug: "veiligheidsschoenen-s3" } },
    ]);

    const res = await GET(new Request("http://localhost/api/shop/stats"), { params: Promise.resolve({}) });
    const json = await res.json();

    expect(json.lowStock).toEqual([
      { variantId: "v1", productName: "Veiligheidsschoenen S3", slug: "veiligheidsschoenen-s3", size: "42", color: null, stock: 0 },
    ]);
    expect(variantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stock: { lte: 5 }, product: { active: true } } }),
    );
  });

  it("requires an authenticated platform admin", async () => {
    requirePrincipal.mockRejectedValue(AppError.unauthenticated());
    const res = await GET(new Request("http://localhost/api/shop/stats"), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
  });
});
