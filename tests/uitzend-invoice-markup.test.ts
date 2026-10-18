import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { UITZEND_MARKUP_RATE: 0.35, PLATFORM_FEE_PER_HOUR_CENTS: 350 } }));

import { buildUitzendInvoice } from "@/lib/billing/self-billing";

const base = { timesheetId: "t", billableMinutes: 480, hourlyRateCents: 1500, recipientTenantId: "c", recipientCountry: "NL", platformTenantId: "p", shiftTitle: "Shift", workedOn: new Date("2026-10-18"), invoiceNumber: "U-1" };

describe("uitzend invoice markup", () => {
  it("uses the default markup", () => {
    const inv = buildUitzendInvoice(base);
    expect(inv.subtotalCents).toBe(12_000 + 4_200);
  });

  it("uses the client's agreed markup and names it on the line", () => {
    const inv = buildUitzendInvoice({ ...base, markupRate: 0.42 });
    expect(inv.subtotalCents).toBe(12_000 + 5_040);
    expect(JSON.stringify(inv)).toContain("42%");
  });
});
