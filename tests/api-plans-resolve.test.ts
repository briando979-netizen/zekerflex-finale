import { afterEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { apiSubscription: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));

import { resolveTenantPlan } from "@/lib/api-plans/resolve";

afterEach(() => vi.clearAllMocks());

describe("resolveTenantPlan", () => {
  it("returns free when there is no subscription row", async () => {
    findUnique.mockResolvedValue(null);
    expect((await resolveTenantPlan("t1")).key).toBe("free");
  });

  it("returns free when the subscription isn't active (e.g. canceled)", async () => {
    findUnique.mockResolvedValue({ planKey: "pro", status: "canceled" });
    expect((await resolveTenantPlan("t1")).key).toBe("free");
  });

  it("returns the subscribed plan when active", async () => {
    findUnique.mockResolvedValue({ planKey: "starter", status: "active" });
    expect((await resolveTenantPlan("t1")).key).toBe("starter");
  });

  it("falls back to free for a stored planKey that no longer exists in the catalog", async () => {
    findUnique.mockResolvedValue({ planKey: "deprecated-tier", status: "active" });
    expect((await resolveTenantPlan("t1")).key).toBe("free");
  });
});
