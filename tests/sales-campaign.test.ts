import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

const campaignFindUnique = vi.fn();
const campaignUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    salesCampaign: {
      findUnique: (...a: unknown[]) => campaignFindUnique(...a),
      update: (...a: unknown[]) => campaignUpdate(...a),
    },
    salesOutreach: { count: vi.fn().mockResolvedValue(0) },
  },
}));

import { withinSendWindow, setCampaignMode } from "@/lib/sales/campaign";
import type { SalesCampaign } from "@prisma/client";

afterEach(() => vi.clearAllMocks());

const base = {
  id: "c1",
  name: "Test",
  sendStartHour: 8,
  sendEndHour: 18,
  workdaysOnly: true,
} as unknown as SalesCampaign;

describe("withinSendWindow", () => {
  it("is inside on a weekday at 10:00", () => {
    expect(withinSendWindow(base, new Date("2026-09-02T10:00:00"))).toBe(true); // Wed
  });
  it("is outside before the start hour", () => {
    expect(withinSendWindow(base, new Date("2026-09-02T06:30:00"))).toBe(false);
  });
  it("is outside on a Saturday when workdaysOnly", () => {
    expect(withinSendWindow(base, new Date("2026-09-05T10:00:00"))).toBe(false); // Sat
  });
  it("allows the weekend when workdaysOnly is false", () => {
    expect(
      withinSendWindow({ ...base, workdaysOnly: false } as SalesCampaign, new Date("2026-09-05T10:00:00")),
    ).toBe(true);
  });
});

describe("setCampaignMode", () => {
  it("refuses AUTOPILOT while the global switch is off", async () => {
    campaignFindUnique.mockResolvedValue(base);
    // tests/setup.ts does not set SALES_AUTOPILOT_ENABLED -> defaults to false
    await expect(setCampaignMode("c1", "AUTOPILOT", "usr_admin")).rejects.toMatchObject({
      status: 412,
    });
  });

  it("allows switching back to REVIEW", async () => {
    campaignFindUnique.mockResolvedValue(base);
    campaignUpdate.mockResolvedValue({ ...base, mode: "REVIEW" });
    const r = await setCampaignMode("c1", "REVIEW", "usr_admin");
    expect(r.mode).toBe("REVIEW");
  });
});
